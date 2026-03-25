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
  fetchDetail(reviewId);
}

function navigateToList(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('id');
  history.pushState(null, '', url.toString());
  activeDetail = null;
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

async function fetchDetail(reviewId: string): Promise<void> {
  if (isFetching) return;
  isFetching = true;

  reviewsRoot.innerHTML = '<div class="loading-state">Loading review…</div>';

  try {
    const res = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}`);
    if (!res.ok) {
      if (res.status === 404) {
        reviewsRoot.innerHTML = `
          <div class="error-state">
            Review not found: ${escapeHtml(reviewId)}
            <div class="error-details"><a href="/reviews/" class="back-link">← Back to reviews</a></div>
          </div>`;
        isFetching = false;
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data: ReviewDetailResponse = await res.json();
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    activeDetail = data;
    renderDetailView(data);
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
      <span class="live-indicator" id="live-dot"><span class="pulse-dot"></span> Live</span>
    </div>`;

  if (filtered.length === 0 && !isFetching) {
    reviewsRoot.innerHTML = `
      ${filterBar}
      <div class="empty-state">No reviews${activeStatusFilter !== 'all' ? ` with status "${activeStatusFilter}"` : ''}</div>`;
    bindFilterChips();
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

  bindFilterChips();
  bindReviewRows();

  const moreBtn = document.getElementById('load-more-btn');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => {
      moreBtn.textContent = 'Loading…';
      moreBtn.setAttribute('disabled', 'true');
      fetchList();
    });
  }
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
        <span class="review-id">${escapeHtml(review.reviewId)}</span>
        <span class="event-actor">${escapeHtml(review.authorId)}</span>
        ${review.claimedBy ? `<span class="event-actor">claimed by ${escapeHtml(review.claimedBy)}</span>` : ''}
        ${review.latestVerdict ? `<span class="review-verdict">${escapeHtml(review.latestVerdict)}</span>` : ''}
      </div>
    </div>`;
}

function bindFilterChips(): void {
  for (const btn of reviewsRoot.querySelectorAll<HTMLButtonElement>('.filter-chip')) {
    btn.addEventListener('click', () => {
      setStatusFilter(btn.dataset.filter as StatusFilter);
    });
  }
}

function bindReviewRows(): void {
  for (const row of reviewsRoot.querySelectorAll<HTMLElement>('.review-row')) {
    row.addEventListener('click', () => {
      const reviewId = row.dataset.reviewId;
      if (reviewId) navigateToDetail(reviewId);
    });
  }
}

// ---------------------------------------------------------------------------
// Rendering — detail view
// ---------------------------------------------------------------------------

function renderDetailView(detail: ReviewDetailResponse): void {
  const { review, proposal, discussion, activity } = detail;
  const statusClass = review.status.replace(/_/g, '-');

  const backLink = `<a href="#" class="back-link" id="back-to-list">← Back to reviews</a>`;

  const header = `
    <div class="detail-header">
      <span class="status-chip ${statusClass}"><span class="status-dot ${statusClass}"></span>${escapeHtml(review.status)}</span>
      <h2 class="detail-title">${escapeHtml(review.title)}</h2>
      <div class="detail-meta">
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

  const proposalSection = `
    <div class="detail-section">
      <h3 class="section-title">Proposal</h3>
      <div class="panel">
        <div class="panel-body">
          <div class="proposal-title">${escapeHtml(proposal.title)}</div>
          <div class="proposal-description">${escapeHtml(proposal.description)}</div>
          ${proposal.affectedFiles.length > 0 ? `
            <div class="affected-files">
              <span class="detail-label">Affected files</span>
              <ul>${proposal.affectedFiles.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>
            </div>` : ''}
          <pre class="diff-block"><code>${escapeHtml(proposal.diff)}</code></pre>
        </div>
      </div>
    </div>`;

  const discussionSection = `
    <div class="detail-section">
      <h3 class="section-title">Discussion <span class="panel-badge">${discussion.length}</span></h3>
      ${discussion.length === 0
        ? '<div class="empty-state">No discussion yet.</div>'
        : `<div class="panel"><div class="panel-body">${discussion.map(renderDiscussionEntry).join('')}</div></div>`
      }
    </div>`;

  const activitySection = `
    <div class="detail-section">
      <h3 class="section-title">Activity <span class="panel-badge">${activity.length}</span></h3>
      ${activity.length === 0
        ? '<div class="empty-state">No activity yet.</div>'
        : `<div class="panel"><div class="panel-body">${activity.map(renderActivityEntry).join('')}</div></div>`
      }
    </div>`;

  reviewsRoot.innerHTML = `
    ${backLink}
    ${header}
    ${proposalSection}
    ${discussionSection}
    ${activitySection}`;

  const backBtn = document.getElementById('back-to-list');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.preventDefault();
      navigateToList();
    });
  }
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

// ---------------------------------------------------------------------------
// SSE subscription
// ---------------------------------------------------------------------------

function connectSSE(): void {
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('change', () => {
    refreshCurrentView();
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

async function refreshCurrentView(): Promise<void> {
  const reviewId = getActiveReviewId();
  if (reviewId) {
    await fetchDetail(reviewId);
  } else {
    await fetchList();
  }
}

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

function init(): void {
  const reviewId = getActiveReviewId();
  if (reviewId) {
    fetchDetail(reviewId);
  } else {
    fetchList();
  }
  connectSSE();
}

init();
