/**
 * overview-client.ts — Browser-side fetch + SSE-triggered re-fetch.
 *
 * Design contract: the overview snapshot from /api/overview is the single
 * source of truth. SSE change notifications only signal "re-fetch now" —
 * they carry no state data. The client exposes connection status, last
 * refresh timestamp, and error state so operators can tell when the
 * dashboard is stale.
 */

// ---------------------------------------------------------------------------
// Types — mirrors the Zod-inferred shapes from review-broker-core/dashboard.
// We inline the minimal subset needed by the browser to avoid a build-time
// dependency on the core package.
// ---------------------------------------------------------------------------

interface OverviewReviewCounts {
  total: number;
  pending: number;
  claimed: number;
  submitted: number;
  changesRequested: number;
  approved: number;
  closed: number;
}

interface OverviewReviewerCounts {
  total: number;
  idle: number;
  assigned: number;
  offline: number;
  tracked: number;
}

interface OverviewLatestReview {
  reviewId: string;
  status: string;
  currentRound: number;
  lastActivityAt: string | null;
}

interface OverviewLatestReviewer {
  reviewerId: string;
  status: string;
  currentReviewId: string | null;
  commandBasename: string;
  offlineReason: string | null;
  updatedAt: string;
}

interface OverviewLatestAudit {
  eventType: string;
  summary: string | null;
  createdAt: string;
}

interface StartupRecoveryOverview {
  completedAt: string;
  recoveredReviewerCount: number;
  reclaimedReviewCount: number;
  staleReviewCount: number;
  unrecoverableReviewCount: number;
}

interface OverviewPoolState {
  configured: boolean;
  enabled: boolean;
  mode: 'unavailable' | 'view_only' | 'standalone';
  reason: string | null;
  sessionToken: string | null;
  lastSpawnAt: string | null;
}

interface OverviewSnapshot {
  snapshotVersion: number;
  generatedAt: string;
  reviews: OverviewReviewCounts;
  reviewers: OverviewReviewerCounts;
  latestReview: OverviewLatestReview | null;
  latestReviewer: OverviewLatestReviewer | null;
  latestAudit: OverviewLatestAudit | null;
  startupRecovery: StartupRecoveryOverview;
  pool: OverviewPoolState;
}

interface DashboardResetResult {
  reviewsDeleted: number;
  messagesDeleted: number;
  eventsDeleted: number;
  reviewersDeleted: number;
}

type ConnectionState = 'loading' | 'connected' | 'error' | 'reconnecting';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const statusBadge = document.getElementById('connection-status') as HTMLElement;
const lastRefreshEl = document.getElementById('last-refresh') as HTMLElement;
const overviewRoot = document.getElementById('overview-root') as HTMLElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentSnapshot: OverviewSnapshot | null = null;
let connectionState: ConnectionState = 'loading';
let lastRefreshAt: Date | null = null;
let lastError: string | null = null;
let eventSource: EventSource | null = null;
let isResetting = false;
let isTogglingPool = false;

// ---------------------------------------------------------------------------
// Connection state management
// ---------------------------------------------------------------------------

function setConnectionState(state: ConnectionState, error?: string): void {
  connectionState = state;
  lastError = error ?? null;
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
// Data fetching
// ---------------------------------------------------------------------------

async function fetchOverview(): Promise<void> {
  try {
    const res = await fetch('/api/overview');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: OverviewSnapshot = await res.json();
    currentSnapshot = data;
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    renderOverview(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error', message);
    if (!currentSnapshot) {
      overviewRoot.innerHTML = `
        <div class="error-state">
          Failed to load overview: ${escapeHtml(message)}
          <div class="error-details">The broker may not be running. Check the server logs.</div>
        </div>`;
    } else {
      // Keep showing stale data but mark the connection state
      updateLastRefresh();
    }
  }
}

// ---------------------------------------------------------------------------
// SSE connection
// ---------------------------------------------------------------------------

function connectSSE(): void {
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('change', () => {
    fetchOverview();
  });

  eventSource.addEventListener('heartbeat', () => {
    // Keep-alive received — no action needed beyond confirming the connection is up.
    if (connectionState !== 'connected' && currentSnapshot) {
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

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderOverview(data: OverviewSnapshot): void {
  overviewRoot.innerHTML = `
    ${renderOverviewActions(data)}
    ${renderCards(data)}
    ${renderReviewerPanel(data)}
    ${renderRecoveryPanel(data)}
    ${renderLatestActivityPanel(data)}
  `;
}

function renderOverviewActions(data: OverviewSnapshot): string {
  const pool = data.pool;
  const poolButtonLabel = isTogglingPool
    ? 'Updating...'
    : pool.enabled
      ? 'Disable Standalone Pool'
      : 'Enable Standalone Pool';
  const poolMode = pool.mode === 'standalone' ? 'standalone pool' : pool.mode === 'view_only' ? 'view only' : 'unavailable';
  const poolDisabled = isTogglingPool || !pool.configured;

  return `
    <div class="overview-actions">
      <div class="pool-control">
        <span class="pool-mode-badge ${pool.mode}">${poolMode}</span>
        <button class="action-btn pool-toggle-btn ${pool.enabled ? 'active' : ''}" type="button" ${poolDisabled ? 'disabled' : ''}>
          ${poolButtonLabel}
        </button>
      </div>
      <button class="action-btn danger full-reset-btn" type="button" ${isResetting ? 'disabled' : ''}>
        ${isResetting ? 'Resetting...' : 'Full Reset'}
      </button>
    </div>`;
}

function renderCards(data: OverviewSnapshot): string {
  const r = data.reviews;
  const rv = data.reviewers;
  return `
    <div class="cards-grid">
      <div class="card">
        <span class="card-label">Total Reviews</span>
        <span class="card-value">${r.total}</span>
        <span class="card-detail">${r.pending} pending · ${r.claimed} claimed</span>
      </div>
      <div class="card">
        <span class="card-label">Completed</span>
        <span class="card-value">${r.approved + r.closed}</span>
        <span class="card-detail">${r.approved} approved · ${r.closed} closed</span>
      </div>
      <div class="card">
        <span class="card-label">Reviewers</span>
        <span class="card-value">${rv.total}</span>
        <span class="card-detail">${rv.idle} idle · ${rv.assigned} assigned · ${rv.offline} offline</span>
      </div>
      <div class="card">
        <span class="card-label">Snapshot</span>
        <span class="card-value">v${data.snapshotVersion}</span>
        <span class="card-detail">${formatTime(data.generatedAt)}</span>
      </div>
    </div>`;
}

function renderReviewerPanel(data: OverviewSnapshot): string {
  const rv = data.reviewers;
  const latest = data.latestReviewer;
  return `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Reviewers</span>
        <span class="panel-badge">${rv.total} tracked</span>
      </div>
      <div class="panel-body">
        <div class="status-bar">
          <span class="status-item"><span class="status-dot idle"></span><span class="count">${rv.idle}</span> idle</span>
          <span class="status-item"><span class="status-dot assigned"></span><span class="count">${rv.assigned}</span> assigned</span>
          <span class="status-item"><span class="status-dot offline"></span><span class="count">${rv.offline}</span> offline</span>
        </div>
        ${latest ? renderLatestReviewer(latest) : '<div class="empty-state">No reviewers registered</div>'}
      </div>
    </div>`;
}

function renderLatestReviewer(r: OverviewLatestReviewer): string {
  return `
    <div class="section-title" style="padding-top:0.75rem;">Latest Reviewer</div>
    <div class="detail-row">
      <span class="detail-label">ID</span>
      <span class="detail-value">${escapeHtml(r.reviewerId)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Status</span>
      <span class="detail-value"><span class="status-dot ${r.status}"></span>${escapeHtml(r.status)}</span>
    </div>
    <div class="detail-row">
      <span class="detail-label">Command</span>
      <span class="detail-value">${escapeHtml(r.commandBasename)}</span>
    </div>
    ${r.currentReviewId ? `<div class="detail-row"><span class="detail-label">Review</span><span class="detail-value">${escapeHtml(r.currentReviewId)}</span></div>` : ''}
    ${r.offlineReason ? `<div class="detail-row"><span class="detail-label">Offline Reason</span><span class="detail-value">${escapeHtml(r.offlineReason)}</span></div>` : ''}
    <div class="detail-row">
      <span class="detail-label">Updated</span>
      <span class="detail-value timestamp">${formatTime(r.updatedAt)}</span>
    </div>`;
}

function renderRecoveryPanel(data: OverviewSnapshot): string {
  const rec = data.startupRecovery;
  const hasRecovery = rec.recoveredReviewerCount > 0 ||
    rec.reclaimedReviewCount > 0 ||
    rec.staleReviewCount > 0 ||
    rec.unrecoverableReviewCount > 0;

  return `
    <div class="panel">
      <div class="panel-header">
        <span class="panel-title">Startup Recovery</span>
      </div>
      <div class="panel-body">
        <div class="recovery-summary">
          <div class="recovery-stat">
            <div class="recovery-stat-value">${rec.recoveredReviewerCount}</div>
            <div class="recovery-stat-label">Recovered</div>
          </div>
          <div class="recovery-stat">
            <div class="recovery-stat-value">${rec.reclaimedReviewCount}</div>
            <div class="recovery-stat-label">Reclaimed</div>
          </div>
          <div class="recovery-stat">
            <div class="recovery-stat-value">${rec.staleReviewCount}</div>
            <div class="recovery-stat-label">Stale</div>
          </div>
          <div class="recovery-stat">
            <div class="recovery-stat-value">${rec.unrecoverableReviewCount}</div>
            <div class="recovery-stat-label">Unrecoverable</div>
          </div>
        </div>
        <div class="detail-row" style="margin-top:0.5rem;">
          <span class="detail-label">Completed</span>
          <span class="detail-value timestamp">${formatTime(rec.completedAt)}</span>
        </div>
        ${!hasRecovery ? '<div class="empty-state" style="padding:0.5rem 0 0;">Clean startup — no recovery needed</div>' : ''}
      </div>
    </div>`;
}

function renderLatestActivityPanel(data: OverviewSnapshot): string {
  const review = data.latestReview;
  const audit = data.latestAudit;
  if (!review && !audit) {
    return `
      <div class="panel">
        <div class="panel-header"><span class="panel-title">Latest Activity</span></div>
        <div class="panel-body"><div class="empty-state">No activity recorded</div></div>
      </div>`;
  }

  let body = '';
  if (review) {
    body += `
      <div class="section-title">Latest Review</div>
      <div class="detail-row">
        <span class="detail-label">Review</span>
        <span class="detail-value">${escapeHtml(review.reviewId)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Status</span>
        <span class="detail-value"><span class="status-dot ${review.status.replace('_', '-')}"></span>${escapeHtml(review.status)}</span>
      </div>
      <div class="detail-row">
        <span class="detail-label">Round</span>
        <span class="detail-value">${review.currentRound}</span>
      </div>
      ${review.lastActivityAt ? `<div class="detail-row"><span class="detail-label">Last Activity</span><span class="detail-value timestamp">${formatTime(review.lastActivityAt)}</span></div>` : ''}`;
  }

  if (audit) {
    body += `
      <div class="section-title" style="${review ? 'padding-top:0.75rem;' : ''}">Latest Audit Event</div>
      <div class="detail-row">
        <span class="detail-label">Event</span>
        <span class="detail-value">${escapeHtml(audit.eventType)}</span>
      </div>
      ${audit.summary ? `<div class="detail-row"><span class="detail-label">Summary</span><span class="detail-value">${escapeHtml(audit.summary)}</span></div>` : ''}
      <div class="detail-row">
        <span class="detail-label">Time</span>
        <span class="detail-value timestamp">${formatTime(audit.createdAt)}</span>
      </div>`;
  }

  return `
    <div class="panel">
      <div class="panel-header"><span class="panel-title">Latest Activity</span></div>
      <div class="panel-body">${body}</div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function fullReset(): Promise<void> {
  if (isResetting) return;
  const confirmed = window.confirm('Full reset clears reviews, discussion, events, and reviewers. Continue?');
  if (!confirmed) return;

  isResetting = true;
  if (currentSnapshot) {
    renderOverview(currentSnapshot);
  }

  try {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = (await res.json()) as DashboardResetResult;
    lastRefreshEl.title = `Reset cleared ${result.reviewsDeleted} reviews, ${result.eventsDeleted} events, ${result.reviewersDeleted} reviewers`;
    await fetchOverview();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error', message);
    window.alert(`Failed to reset broker: ${message}`);
  } finally {
    isResetting = false;
    if (currentSnapshot) {
      renderOverview(currentSnapshot);
    }
  }
}

async function toggleStandalonePool(): Promise<void> {
  if (isTogglingPool || !currentSnapshot?.pool.configured) return;

  isTogglingPool = true;
  renderOverview(currentSnapshot);

  try {
    const res = await fetch('/api/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !currentSnapshot.pool.enabled }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await fetchOverview();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error', message);
    window.alert(`Failed to update standalone pool: ${message}`);
  } finally {
    isTogglingPool = false;
    if (currentSnapshot) {
      renderOverview(currentSnapshot);
    }
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

overviewRoot.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.full-reset-btn');
  if (btn && !btn.disabled) {
    void fullReset();
    return;
  }

  const poolBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.pool-toggle-btn');
  if (poolBtn && !poolBtn.disabled) {
    void toggleStandalonePool();
  }
});

fetchOverview();
connectSSE();
