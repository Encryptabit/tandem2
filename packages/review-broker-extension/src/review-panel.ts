import type { ReviewSummary } from 'review-broker-core';
import type { ReviewGateState, ReviewUnitIdentity } from './types.js';

export interface ReviewPanelData {
  projectRoot: string;
  state: ReviewGateState | null;
  stateSource?: 'live' | 'paused';
  refreshed?: boolean;
  target?: ReviewUnitIdentity | null;
  reviewerFeedback?: string | null;
  recentReviews: ReviewSummary[];
  error?: string | null;
}

interface RenderTheme {
  fg?: (name: string, text: string) => string;
  bold?: (text: string) => string;
}

interface TuiLike {
  requestRender?: () => void;
}

type DoneFn = (value?: unknown) => void;

const ANSI_PATTERN = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const MAX_RECENT_REVIEWS = 7;
const MAX_CONTENT_WIDTH = 118;

function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

function visibleWidth(value: string): number {
  return stripAnsi(value).length;
}

function color(theme: RenderTheme, name: string, value: string): string {
  return theme.fg ? theme.fg(name, value) : value;
}

function bold(theme: RenderTheme, value: string): string {
  return theme.bold ? theme.bold(value) : value;
}

function truncateToWidth(value: string, width: number, suffix = '...'): string {
  if (width <= 0) return '';
  if (visibleWidth(value) <= width) return value;

  const target = Math.max(0, width - suffix.length);
  let visible = 0;
  let output = '';

  for (let index = 0; index < value.length;) {
    const ansiMatch = value.slice(index).match(/^\x1b\[[0-9;?]*[ -/]*[@-~]/);
    if (ansiMatch) {
      output += ansiMatch[0];
      index += ansiMatch[0].length;
      continue;
    }

    if (visible >= target) break;
    output += value[index];
    visible += 1;
    index += 1;
  }

  return `${output}${suffix}`;
}

function wrapPlainText(value: string, width: number): string[] {
  const clean = value.trim();
  if (!clean) return [];
  if (width <= 8) return [truncateToWidth(clean, width)];

  const lines: string[] = [];
  for (const paragraph of clean.split(/\n+/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if (current.length + 1 + word.length <= width) {
        current = `${current} ${word}`;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function padLine(line: string, innerWidth: number): string {
  const truncated = truncateToWidth(line, innerWidth);
  const padding = Math.max(0, innerWidth - visibleWidth(truncated));
  return `${truncated}${' '.repeat(padding)}`;
}

function reviewStatusLabel(state: ReviewGateState | null, activeReview: ReviewSummary | null): string {
  return state?.status ?? activeReview?.status ?? 'none';
}

function reviewDecisionLabel(state: ReviewGateState | null): string {
  return state?.decision ?? 'none';
}

function formatReviewRef(reviewId: string | null | undefined): string {
  return reviewId ? reviewId : 'none';
}

function isReviewShortcutInput(data: string): boolean {
  return (
    data === 'ctrl+alt+r' ||
    data === 'ctrl+shift+r' ||
    data === 'shift+ctrl+r' ||
    data === '\x1b\x12' ||
    /^\x1b\[(?:82|114)(?::\d*)?(?::\d*)?;(?:6|7)(?::\d+)?u$/.test(data) ||
    /^\x1b\[27;(?:6|7);(?:82|114)~$/.test(data)
  );
}

function statusColor(status: string | null | undefined): string {
  switch (status) {
    case 'approved':
      return 'success';
    case 'changes_requested':
    case 'failed':
      return 'error';
    case 'pending':
    case 'claimed':
    case 'submitted':
      return 'warning';
    default:
      return 'dim';
  }
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'never';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 48) return `${deltaHours}h ago`;
  return `${Math.floor(deltaHours / 24)}d ago`;
}

function latestActiveReview(reviews: ReviewSummary[]): ReviewSummary | null {
  return reviews.find((review) =>
    review.status === 'pending' ||
    review.status === 'claimed' ||
    review.status === 'changes_requested' ||
    review.status === 'submitted'
  ) ?? reviews[0] ?? null;
}

export class TandemReviewOverlay {
  private cachedWidth: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    private readonly tui: TuiLike,
    private readonly theme: RenderTheme,
    private readonly data: ReviewPanelData,
    private readonly done: DoneFn,
  ) {}

  handleInput(data: string): void {
    if (data === '\x1b' || data === '\x03' || data === 'q' || isReviewShortcutInput(data)) {
      this.done();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    const panelWidth = Math.max(8, width);
    const innerWidth = Math.max(1, panelWidth - 4);
    const contentWidth = Math.min(innerWidth, MAX_CONTENT_WIDTH);
    const activeReview = latestActiveReview(this.data.recentReviews);
    const state = this.data.state;
    const reviewId = state?.reviewId ?? activeReview?.reviewId ?? null;
    const status = reviewStatusLabel(state, activeReview);
    const feedback = this.data.reviewerFeedback ?? state?.feedback ?? activeReview?.verdictReason ?? null;

    const inner: string[] = [];
    const title = `${color(this.theme, 'accent', bold(this.theme, 'Tandem Review'))} ${color(this.theme, statusColor(status), status)}`;
    inner.push(title);
    inner.push(color(this.theme, 'dim', this.data.projectRoot));
    inner.push('');

    if (this.data.error) {
      inner.push(color(this.theme, 'error', this.data.error));
      inner.push('');
    }

    inner.push(`${color(this.theme, 'dim', 'Review')}  ${formatReviewRef(reviewId)}`);
    inner.push(`${color(this.theme, 'dim', 'Target')}  ${state?.unit?.unitId ?? this.data.target?.unitId ?? 'none'}`);
    inner.push(`${color(this.theme, 'dim', 'State ')}  ${status} / ${reviewDecisionLabel(state)}`);
    inner.push(`${color(this.theme, 'dim', 'Policy')}  ${state?.blockedPolicy ?? 'none'}`);
    inner.push(`${color(this.theme, 'dim', 'Round ')}  ${activeReview?.currentRound ?? '-'}`);
    inner.push(`${color(this.theme, 'dim', 'Source')}  ${this.data.stateSource ?? 'broker'}${this.data.refreshed === undefined ? '' : ` · refreshed ${this.data.refreshed ? 'yes' : 'no'}`}`);
    inner.push('');

    inner.push(color(this.theme, 'muted', 'Reviewer Feedback'));
    const feedbackLines = feedback
      ? wrapPlainText(feedback, contentWidth - 2).slice(0, 7)
      : [color(this.theme, 'dim', 'No reviewer feedback yet.')];
    for (const line of feedbackLines) {
      inner.push(`  ${line}`);
    }
    inner.push('');

    inner.push(color(this.theme, 'muted', 'Recent Reviews'));
    if (this.data.recentReviews.length === 0) {
      inner.push(color(this.theme, 'dim', '  No broker reviews found for this project.'));
    } else {
      for (const review of this.data.recentReviews.slice(0, MAX_RECENT_REVIEWS)) {
        const marker = review.reviewId === reviewId ? color(this.theme, 'accent', '*') : ' ';
        const reviewStatus = color(this.theme, statusColor(review.status), review.status.padEnd(17).slice(0, 17));
        const round = `r${review.currentRound}`;
        const when = formatRelativeTime(review.updatedAt);
        inner.push(`${marker} ${reviewStatus} ${round.padEnd(4)} ${when.padStart(8)}  ${review.title}`);
      }
    }

    inner.push('');
    inner.push(color(this.theme, 'dim', 'Esc/q close · /review submit · /review status · Ctrl+Alt+R'));

    this.cachedWidth = width;
    this.cachedLines = this.box(inner, panelWidth, contentWidth);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
    this.tui.requestRender?.();
  }

  private box(inner: string[], width: number, contentWidth: number): string[] {
    const border = (value: string) => color(this.theme, 'borderMuted', value);
    const innerWidth = Math.max(1, width - 4);
    const sidePad = Math.max(0, Math.floor((innerWidth - contentWidth) / 2));
    const lines = [border(`╭${'─'.repeat(width - 2)}╮`)];
    for (const line of inner) {
      const centeredLine = `${' '.repeat(sidePad)}${padLine(line, contentWidth)}`;
      lines.push(`${border('│')} ${padLine(centeredLine, innerWidth)} ${border('│')}`);
    }
    lines.push(border(`╰${'─'.repeat(width - 2)}╯`));
    return lines;
  }
}
