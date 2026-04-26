/**
 * reviews-client.ts — Browser-side review browser with list/detail views,
 * status filtering, live SSE-triggered re-fetch, and connection state badge.
 *
 * Design contract: /api/reviews returns the review list.
 * /api/reviews/:id returns the composite detail.
 * SSE change notifications from /api/events signal "re-fetch current view."
 * View routing uses ?id= query parameter with browser history support.
 */

// ---------------------------------------------------------------------------
// Types — mirrors Zod schemas from review-broker-core/src/dashboard.ts.
// Inlined to avoid a build-time dependency on review-broker-core.
// ---------------------------------------------------------------------------

interface DashboardReviewListItem {
  reviewId: string;
  title: string;
  projectName: string | null;
  status: string;
  priority: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  claimedBy: string | null;
  claimedAt: string | null;
  claimGeneration: number;
  currentRound: number;
  latestVerdict: string | null;
  verdictReason: string | null;
  counterPatchStatus: string;
  lastMessageAt: string | null;
  lastActivityAt: string | null;
}

interface ReviewListResponse {
  reviews: DashboardReviewListItem[];
  hasMore: boolean;
}

interface DashboardReviewActivityEntry {
  auditEventId: number;
  reviewId: string;
  eventType: string;
  actorId: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  errorCode: string | null;
  summary: string | null;
  createdAt: string;
}

interface ReviewDiscussionMessage {
  messageId: string;
  reviewId: string;
  actorId: string;
  authorRole: string;
  body: string;
  createdAt: string;
}

interface ReviewProposalDetail {
  title: string;
  description: string;
  diff: string;
  affectedFiles: string[];
  priority: string;
}

interface ReviewDetailResponse {
  review: DashboardReviewListItem;
  proposal: ReviewProposalDetail;
  discussion: ReviewDiscussionMessage[];
  activity: DashboardReviewActivityEntry[];
}

interface DashboardResetResult {
  reviewsDeleted: number;
  messagesDeleted: number;
  eventsDeleted: number;
  reviewersDeleted: number;
}

interface DiffFile {
  id: string;
  oldPath: string | null;
  newPath: string | null;
  displayName: string;
  lines: string[];
  additions: number;
  deletions: number;
  hunks: number;
}

type ConnectionState = 'loading' | 'connected' | 'error' | 'reconnecting';
type StatusFilter = 'all' | 'pending' | 'claimed' | 'submitted' | 'approved' | 'closed' | 'changes_requested';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const statusBadge = document.getElementById('connection-status') as HTMLElement;
const lastRefreshEl = document.getElementById('last-refresh') as HTMLElement;
const reviewsRoot = document.getElementById('reviews-root') as HTMLElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let reviews: DashboardReviewListItem[] = [];
let hasMore = false;
let activeDetail: ReviewDetailResponse | null = null;
let connectionState: ConnectionState = 'loading';
let lastRefreshAt: Date | null = null;
let activeStatusFilter: StatusFilter = 'all';
let eventSource: EventSource | null = null;
let isFetching = false;
let isClearingReviews = false;
let refreshTimer: number | null = null;
let selectedDiffFileId: string | null = null;

const CROSS_PROCESS_REFRESH_MS = 10_000;

// ---------------------------------------------------------------------------
// Connection state management
// ---------------------------------------------------------------------------

function setConnectionState(state: ConnectionState): void {
  connectionState = state;
  statusBadge.textContent = state;
  statusBadge.dataset.state = state;
}

function updateLastRefresh(): void {
  if (!lastRefreshAt) {
    lastRefreshEl.textContent = '';
    return;
  }
  lastRefreshEl.textContent = `Last refresh: ${formatTime(lastRefreshAt.toISOString())}`;
}

// ---------------------------------------------------------------------------
// URL / view routing
// ---------------------------------------------------------------------------

function getActiveReviewId(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

function navigateToDetail(reviewId: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('id', reviewId);
  history.pushState(null, '', url.toString());
  selectedDiffFileId = null;
  fetchDetail(reviewId);
}

function navigateToList(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  history.pushState(null, '', url.toString());
  activeDetail = null;
  selectedDiffFileId = null;
  renderListView();
}

// ---------------------------------------------------------------------------
// Data fetching — list
// ---------------------------------------------------------------------------

async function fetchList(): Promise<void> {
  if (isFetching) return;
  isFetching = true;

  const params = new URLSearchParams();
  params.set('limit', '50');
  if (activeStatusFilter !== 'all') params.set('status', activeStatusFilter);

  try {
    const res = await fetch(`/api/reviews?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: ReviewListResponse = await res.json();
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    reviews = data.reviews;
    hasMore = data.hasMore;
    renderListView();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error');
    if (reviews.length === 0) {
      reviewsRoot.innerHTML = `
        <div class="error-state">
          Failed to load reviews: ${escapeHtml(message)}
          <div class="error-details">The broker may not be running. Check the server logs.</div>
        </div>`;
    }
  } finally {
    isFetching = false;
  }
}

// ---------------------------------------------------------------------------
// Data fetching — detail
// ---------------------------------------------------------------------------

async function fetchDetail(reviewId: string, options: { showLoading?: boolean } = {}): Promise<void> {
  if (isFetching) return;
  isFetching = true;

  if (options.showLoading !== false) {
    reviewsRoot.innerHTML = '<div class="loading-state">Loading review…</div>';
  }

  try {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`);
    if (!res.ok) {
      if (res.status === 404) {
        activeDetail = null;
        selectedDiffFileId = null;

        if (options.showLoading === false) {
          const url = new URL(window.location.href);
          url.searchParams.delete('id');
          history.replaceState(null, '', url.toString());
          reviews = [];
          hasMore = false;
          renderListView();
          return;
        }

        reviewsRoot.innerHTML = `
          <div class="error-state">
            Review not found: ${escapeHtml(reviewId)}
            <div class="error-details"><a href="/reviews/" class="back-link">Back to reviews</a></div>
          </div>`;
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data: ReviewDetailResponse = await res.json();
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    const previousDetail = activeDetail;
    const canPatchDetail =
      options.showLoading === false &&
      previousDetail?.review.reviewId === data.review.reviewId &&
      document.getElementById('review-detail-view') !== null;

    if (canPatchDetail) {
      patchDetailView(data, previousDetail);
    } else {
      renderDetailView(data);
    }

    activeDetail = data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error');
    reviewsRoot.innerHTML = `
      <div class="error-state">
        Failed to load review detail: ${escapeHtml(message)}
        <div class="error-details">The broker may not be running. Check the server logs.</div>
      </div>`;
  } finally {
    isFetching = false;
  }
}

// ---------------------------------------------------------------------------
// Rendering — list view
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'claimed', label: 'Claimed' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes_requested', label: 'Changes Requested' },
  { value: 'closed', label: 'Closed' },
];

function setStatusFilter(filter: StatusFilter): void {
  if (filter === activeStatusFilter) return;
  activeStatusFilter = filter;
  fetchList();
}

function renderListView(): void {
  const filtered = activeStatusFilter === 'all'
    ? reviews
    : reviews.filter((r) => r.status === activeStatusFilter);

  const filterChips = STATUS_FILTERS.map(
    (f) =>
      `<button class="filter-chip${f.value === activeStatusFilter ? ' active' : ''}" data-filter="${f.value}">${f.label}</button>`,
  ).join('');

  const filterBar = `
    <div class="status-filters">
      ${filterChips}
      <button class="action-btn danger clear-reviews-btn" type="button" ${isClearingReviews ? 'disabled' : ''}>
        ${isClearingReviews ? 'Clearing...' : 'Clear Reviews'}
      </button>
      <span class="live-indicator" id="live-dot"><span class="pulse-dot"></span> Live</span>
    </div>`;

  if (filtered.length === 0 && !isFetching) {
    reviewsRoot.innerHTML = `
      ${filterBar}
      <div class="empty-state">No reviews${activeStatusFilter !== 'all' ? ` with status "${activeStatusFilter}"` : ''}</div>`;
    return;
  }

  const rows = filtered.map(renderReviewRow).join('');
  const loadMoreBtn = hasMore
    ? `<div class="load-more-container"><button class="load-more-btn" id="load-more-btn">Load more</button></div>`
    : '';

  reviewsRoot.innerHTML = `
    ${filterBar}
    <div class="review-list">${rows}</div>
    ${loadMoreBtn}`;
}

function renderReviewRow(review: DashboardReviewListItem): string {
  const statusClass = review.status.replace(/_/g, '-');

  return `
    <div class="review-row" data-review-id="${escapeHtml(review.reviewId)}">
      <div class="review-row-header">
        <span class="status-chip ${statusClass}"><span class="status-dot ${statusClass}"></span>${escapeHtml(review.status)}</span>
        <span class="review-title">${escapeHtml(review.title)}</span>
        <span class="event-meta timestamp">${formatRelativeTime(review.updatedAt)}</span>
      </div>
      <div class="review-row-meta">
        ${renderProjectBadge(review)}
        <span class="review-id">${escapeHtml(review.reviewId)}</span>
        <span class="event-actor">${escapeHtml(review.authorId)}</span>
        ${review.claimedBy ? `<span class="event-actor">claimed by ${escapeHtml(review.claimedBy)}</span>` : ''}
        ${review.latestVerdict ? `<span class="review-verdict">${escapeHtml(review.latestVerdict)}</span>` : ''}
      </div>
    </div>`;
}


// ---------------------------------------------------------------------------
// Rendering — detail view
// ---------------------------------------------------------------------------

function renderDetailView(detail: ReviewDetailResponse): void {
  reviewsRoot.innerHTML = `
    <div id="review-detail-view">
      <div class="detail-action-row">
        <a href="#" class="back-link" id="back-to-list">Back to reviews</a>
        <button class="action-btn danger clear-reviews-btn" type="button" ${isClearingReviews ? 'disabled' : ''}>
          ${isClearingReviews ? 'Clearing...' : 'Clear Reviews'}
        </button>
      </div>
      <div id="review-detail-header">${renderDetailHeader(detail.review)}</div>
      <div id="review-proposal-section">${renderProposalSection(detail.proposal)}</div>
      <div id="review-discussion-section">${renderDiscussionSection(detail.discussion)}</div>
      <div id="review-activity-section">${renderActivitySection(detail.activity)}</div>
    </div>`;
}

function patchDetailView(next: ReviewDetailResponse, previous: ReviewDetailResponse): void {
  updateSection('review-detail-header', renderDetailHeader(next.review));
  updateSection('review-discussion-section', renderDiscussionSection(next.discussion));
  updateSection('review-activity-section', renderActivitySection(next.activity));

  if (
    previous.proposal.title !== next.proposal.title ||
    previous.proposal.description !== next.proposal.description ||
    previous.proposal.affectedFiles.join('\n') !== next.proposal.affectedFiles.join('\n')
  ) {
    const proposalCopyRoot = document.getElementById('review-proposal-copy');
    if (proposalCopyRoot) {
      proposalCopyRoot.innerHTML = renderProposalCopy(next.proposal);
    }
  }

  if (previous.proposal.diff !== next.proposal.diff) {
    const diffRoot = document.getElementById('review-diff-root');
    if (diffRoot) {
      diffRoot.innerHTML = renderDiffBlock(next.proposal.diff);
    }
  }
}

function updateSection(id: string, html: string): void {
  const root = document.getElementById(id);
  if (root) {
    root.innerHTML = html;
  }
}

function renderDetailHeader(review: DashboardReviewListItem): string {
  const statusClass = review.status.replace(/_/g, '-');

  return `
    <div class="detail-header">
      <span class="status-chip ${statusClass}"><span class="status-dot ${statusClass}"></span>${escapeHtml(review.status)}</span>
      <h2 class="detail-title">${escapeHtml(review.title)}</h2>
      <div class="detail-meta">
        ${renderProjectBadge(review)}
        <span class="review-id">${escapeHtml(review.reviewId)}</span>
        <span class="event-actor">by ${escapeHtml(review.authorId)}</span>
        <span class="detail-label">Round ${review.currentRound}</span>
        ${review.latestVerdict ? `<span class="review-verdict">${escapeHtml(review.latestVerdict)}</span>` : ''}
      </div>
      <div class="detail-meta">
        <span class="timestamp">Created ${formatRelativeTime(review.createdAt)}</span>
        <span class="timestamp">Updated ${formatRelativeTime(review.updatedAt)}</span>
        ${review.claimedBy ? `<span class="event-actor">Claimed by ${escapeHtml(review.claimedBy)} ${review.claimedAt ? formatRelativeTime(review.claimedAt) : ''}</span>` : ''}
      </div>
    </div>`;
}

function renderProposalSection(proposal: ReviewProposalDetail): string {
  return `
    <div class="detail-section">
      <h3 class="section-title">Proposal</h3>
      <div class="panel">
        <div class="panel-body">
          <div id="review-proposal-copy">${renderProposalCopy(proposal)}</div>
          <div id="review-diff-root">${renderDiffBlock(proposal.diff)}</div>
        </div>
      </div>
    </div>`;
}

function renderProposalCopy(proposal: ReviewProposalDetail): string {
  return `
    <div class="proposal-title">${escapeHtml(proposal.title)}</div>
    <div class="proposal-description">${escapeHtml(proposal.description)}</div>
    ${proposal.affectedFiles.length > 0 ? `
      <div class="affected-files">
        <span class="detail-label">Affected files</span>
        <ul>${proposal.affectedFiles.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>
      </div>` : ''}`;
}

function renderDiscussionSection(discussion: ReviewDiscussionMessage[]): string {
  return `
    <div class="detail-section">
      <h3 class="section-title">Discussion <span class="panel-badge">${discussion.length}</span></h3>
      ${discussion.length === 0
        ? '<div class="empty-state">No discussion yet.</div>'
        : `<div class="panel"><div class="panel-body">${discussion.map(renderDiscussionEntry).join('')}</div></div>`
      }
    </div>`;
}

function renderActivitySection(activity: DashboardReviewActivityEntry[]): string {
  return `
    <div class="detail-section">
      <h3 class="section-title">Activity <span class="panel-badge">${activity.length}</span></h3>
      ${activity.length === 0
        ? '<div class="empty-state">No activity yet.</div>'
        : `<div class="panel"><div class="panel-body">${activity.map(renderActivityEntry).join('')}</div></div>`
      }
    </div>`;
}

function renderProjectBadge(review: Pick<DashboardReviewListItem, 'projectName'>): string {
  if (!review.projectName) return '';
  return `<span class="project-badge">${escapeHtml(review.projectName)}</span>`;
}

function renderDiffBlock(diff: string): string {
  const files = parseDiffFiles(diff);

  if (files.length === 0) {
    selectedDiffFileId = null;
    return '<div class="diff-block diff-empty">No diff available.</div>';
  }

  const selectedFile = selectActiveDiffFile(files);
  const renderedLines = selectedFile.lines
    .map((line) => `<span class="diff-line ${getDiffLineClass(line)}">${escapeHtml(line)}</span>`)
    .join('');

  const fileButtons = files.map((file) => `
    <button class="diff-file-button${file.id === selectedFile.id ? ' active' : ''}" type="button" data-diff-file-id="${escapeHtml(file.id)}">
      <span class="diff-file-name">${escapeHtml(file.displayName)}</span>
      <span class="diff-file-stats">+${file.additions} -${file.deletions}</span>
    </button>
  `).join('');

  return `
    <div class="diff-viewer">
      <aside class="diff-file-list" aria-label="Changed files">
        <div class="diff-file-list-header">${files.length} file${files.length === 1 ? '' : 's'}</div>
        ${fileButtons}
      </aside>
      <div class="diff-current-file">
        <div class="diff-current-file-header">
          <span>${escapeHtml(selectedFile.displayName)}</span>
          <span class="diff-file-stats">+${selectedFile.additions} -${selectedFile.deletions} · ${selectedFile.hunks} hunk${selectedFile.hunks === 1 ? '' : 's'}</span>
        </div>
        <div class="diff-block" role="region" aria-label="Proposal unified diff for ${escapeHtml(selectedFile.displayName)}">
          <code>${renderedLines}</code>
        </div>
      </div>
    </div>`;
}

function selectActiveDiffFile(files: DiffFile[]): DiffFile {
  const selected = selectedDiffFileId ? files.find((file) => file.id === selectedDiffFileId) : undefined;
  const fallback = files[0]!;
  const active = selected ?? fallback;
  selectedDiffFileId = active.id;
  return active;
}

function parseDiffFiles(diff: string): DiffFile[] {
  const normalized = diff.replace(/\r\n/g, '\n');
  const lines = normalized.length > 0 ? normalized.split('\n') : [];
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  function startFile(firstLine: string | null): DiffFile {
    const parsedPaths = firstLine ? parseDiffGitPaths(firstLine) : { oldPath: null, newPath: null };
    return {
      id: '',
      oldPath: parsedPaths.oldPath,
      newPath: parsedPaths.newPath,
      displayName: '',
      lines: firstLine ? [firstLine] : [],
      additions: 0,
      deletions: 0,
      hunks: 0,
    };
  }

  function finishFile(file: DiffFile): void {
    if (file.lines.length === 0) return;
    const index = files.length;
    const displayName = buildDiffDisplayName(file, index);
    files.push({
      ...file,
      id: `${index}:${displayName}`,
      displayName,
    });
  }

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      if (current) finishFile(current);
      current = startFile(line);
      continue;
    }

    if (!current) {
      current = startFile(null);
    }

    current.lines.push(line);

    if (line.startsWith('--- ')) {
      current.oldPath = parseDiffBoundaryPath(line);
    } else if (line.startsWith('+++ ')) {
      current.newPath = parseDiffBoundaryPath(line);
    }

    if (line.startsWith('@@')) {
      current.hunks += 1;
    } else if (line.startsWith('+') && !line.startsWith('+++ ')) {
      current.additions += 1;
    } else if (line.startsWith('-') && !line.startsWith('--- ')) {
      current.deletions += 1;
    }
  }

  if (current) finishFile(current);
  return files;
}

function parseDiffGitPaths(line: string): { oldPath: string | null; newPath: string | null } {
  const prefix = 'diff --git a/';
  if (!line.startsWith(prefix)) {
    return { oldPath: null, newPath: null };
  }

  const rest = line.slice(prefix.length);
  const splitIndex = rest.indexOf(' b/');
  if (splitIndex === -1) {
    return { oldPath: null, newPath: null };
  }

  return {
    oldPath: stripDiffPath(rest.slice(0, splitIndex)),
    newPath: stripDiffPath(rest.slice(splitIndex + 3)),
  };
}

function parseDiffBoundaryPath(line: string): string | null {
  const raw = line.slice(4).split('\t')[0]?.trim() ?? '';
  if (raw === '/dev/null' || raw.length === 0) {
    return null;
  }
  return stripDiffPath(raw);
}

function stripDiffPath(rawPath: string): string {
  const unquoted = rawPath.replace(/^"|"$/g, '');
  if (unquoted.startsWith('a/') || unquoted.startsWith('b/')) {
    return unquoted.slice(2);
  }
  return unquoted;
}

function buildDiffDisplayName(file: DiffFile, index: number): string {
  if (file.oldPath && file.newPath && file.oldPath !== file.newPath) {
    return `${file.oldPath} -> ${file.newPath}`;
  }

  return file.newPath ?? file.oldPath ?? `Diff ${index + 1}`;
}

function getDiffLineClass(line: string): string {
  if (line.startsWith('diff --git')) return 'diff-line-file';
  if (line.startsWith('@@')) return 'diff-line-hunk';
  if (line.startsWith('+++ ')) return 'diff-line-added diff-line-boundary';
  if (line.startsWith('--- ')) return 'diff-line-removed diff-line-boundary';
  if (line.startsWith('+')) return 'diff-line-added';
  if (line.startsWith('-')) return 'diff-line-removed';
  if (
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ') ||
    line.startsWith('\\ ')
  ) {
    return 'diff-line-meta';
  }

  return 'diff-line-context';
}

function renderDiscussionEntry(msg: ReviewDiscussionMessage): string {
  const roleClass = msg.authorRole === 'reviewer' ? 'reviewer' : 'review';
  return `
    <div class="discussion-entry">
      <div class="discussion-header">
        <span class="event-actor">${escapeHtml(msg.actorId)}</span>
        <span class="event-type-badge ${roleClass}">${escapeHtml(msg.authorRole)}</span>
        <span class="event-meta timestamp">${formatRelativeTime(msg.createdAt)}</span>
      </div>
      <div class="discussion-body">${escapeHtml(msg.body)}</div>
    </div>`;
}

function renderActivityEntry(entry: DashboardReviewActivityEntry): string {
  const transitionPart =
    entry.statusFrom || entry.statusTo
      ? `<span class="event-transition">${escapeHtml(entry.statusFrom ?? '?')} → ${escapeHtml(entry.statusTo ?? '?')}</span>`
      : '';

  const summaryPart = entry.summary
    ? `<div class="event-summary">${escapeHtml(entry.summary)}</div>`
    : '';

  return `
    <div class="activity-entry">
      <div class="event-row-header">
        <span class="event-type-badge review">${escapeHtml(entry.eventType)}</span>
        ${entry.actorId ? `<span class="event-actor">${escapeHtml(entry.actorId)}</span>` : ''}
        ${transitionPart}
        <span class="event-meta timestamp">${formatRelativeTime(entry.createdAt)}</span>
      </div>
      ${summaryPart}
    </div>`;
}

async function clearReviews(): Promise<void> {
  if (isClearingReviews) return;
  const confirmed = window.confirm('Clear all reviews, review discussion, and review activity?');
  if (!confirmed) return;

  isClearingReviews = true;
  setClearReviewsButtonsDisabled(true);

  try {
    const res = await fetch('/api/reviews/clear', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = (await res.json()) as DashboardResetResult;

    reviews = [];
    hasMore = false;
    activeDetail = null;
    selectedDiffFileId = null;
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    lastRefreshEl.title = `Cleared ${result.reviewsDeleted} reviews`;

    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    history.replaceState(null, '', url.toString());
    renderListView();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error');
    window.alert(`Failed to clear reviews: ${message}`);
  } finally {
    isClearingReviews = false;
    setClearReviewsButtonsDisabled(false);
  }
}

function setClearReviewsButtonsDisabled(disabled: boolean): void {
  document.querySelectorAll<HTMLButtonElement>('.clear-reviews-btn').forEach((button) => {
    button.disabled = disabled;
    button.textContent = disabled ? 'Clearing...' : 'Clear Reviews';
  });
}

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

function connectSSE(): void {
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('change', () => {
    void refreshCurrentView({ showLoading: false });
  });

  eventSource.addEventListener('heartbeat', () => {
    if (connectionState !== 'connected' && reviews.length > 0) {
      setConnectionState('connected');
    }
  });

  eventSource.onerror = () => {
    if (connectionState === 'connected') {
      setConnectionState('reconnecting');
    }
  };

  eventSource.onopen = () => {
    setConnectionState('connected');
  };
}

async function refreshCurrentView(options: { showLoading?: boolean } = {}): Promise<void> {
  const reviewId = getActiveReviewId();
  if (reviewId) {
    await fetchDetail(reviewId, options);
  } else {
    await fetchList();
  }
}

function startPeriodicRefresh(): void {
  if (refreshTimer !== null) return;

  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') {
      void refreshCurrentView({ showLoading: false });
    }
  }, CROSS_PROCESS_REFRESH_MS);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    void refreshCurrentView({ showLoading: false });
  }
});

// ---------------------------------------------------------------------------
// Browser history support
// ---------------------------------------------------------------------------

window.addEventListener('popstate', () => {
  const reviewId = getActiveReviewId();
  if (reviewId) {
    fetchDetail(reviewId);
  } else {
    activeDetail = null;
    fetchList();
  }
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return iso;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// Event delegation — single listener on the stable parent container
reviewsRoot.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Filter chip
  const chip = target.closest<HTMLButtonElement>('.filter-chip');
  if (chip?.dataset.filter) {
    setStatusFilter(chip.dataset.filter as StatusFilter);
    return;
  }

  const clearBtn = target.closest<HTMLButtonElement>('.clear-reviews-btn');
  if (clearBtn && !clearBtn.disabled) {
    void clearReviews();
    return;
  }

  const diffFileBtn = target.closest<HTMLButtonElement>('.diff-file-button');
  if (diffFileBtn?.dataset.diffFileId && !diffFileBtn.disabled) {
    selectedDiffFileId = diffFileBtn.dataset.diffFileId;
    if (activeDetail) {
      const diffRoot = document.getElementById('review-diff-root');
      if (diffRoot) {
        diffRoot.innerHTML = renderDiffBlock(activeDetail.proposal.diff);
      }
    }
    return;
  }

  // Review row → navigate to detail
  const row = target.closest<HTMLElement>('.review-row');
  if (row?.dataset.reviewId) {
    navigateToDetail(row.dataset.reviewId);
    return;
  }

  // Load more button
  const moreBtn = target.closest<HTMLButtonElement>('.load-more-btn');
  if (moreBtn && !moreBtn.hasAttribute('disabled')) {
    moreBtn.textContent = 'Loading…';
    moreBtn.setAttribute('disabled', 'true');
    fetchList();
    return;
  }

  // Back to list link
  const backLink = target.closest<HTMLAnchorElement>('#back-to-list');
  if (backLink) {
    e.preventDefault();
    navigateToList();
    return;
  }
});

function init(): void {
  const reviewId = getActiveReviewId();
  if (reviewId) {
    fetchDetail(reviewId);
  } else {
    fetchList();
  }
  connectSSE();
  startPeriodicRefresh();
}

init();
