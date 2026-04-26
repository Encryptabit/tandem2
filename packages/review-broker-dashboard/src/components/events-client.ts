/**
 * events-client.ts — Browser-side event feed with live follow, filtering,
 * and cursor-based pagination.
 *
 * Design contract: /api/events/feed returns the authoritative event list.
 * SSE change notifications only signal "re-fetch latest" — they carry no
 * event data. Group filtering (Review, Reviewer) is client-side because
 * the route only supports exact eventType matching.
 */

// ---------------------------------------------------------------------------
// Types — mirrors OperatorEventEntry and EventFeedResponse from core.
// Inlined to avoid a build-time dependency on review-broker-core.
// ---------------------------------------------------------------------------

interface OperatorEventEntry {
  auditEventId: number;
  reviewId: string | null;
  eventType: string;
  actorId: string | null;
  statusFrom: string | null;
  statusTo: string | null;
  errorCode: string | null;
  summary: string | null;
  createdAt: string;
}

interface EventFeedResponse {
  events: OperatorEventEntry[];
  hasMore: boolean;
}

interface DashboardResetResult {
  reviewsDeleted: number;
  messagesDeleted: number;
  eventsDeleted: number;
  reviewersDeleted: number;
}

type ConnectionState = 'loading' | 'connected' | 'error' | 'reconnecting';

type FilterGroup = 'all' | 'review' | 'reviewer';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const statusBadge = document.getElementById('connection-status') as HTMLElement;
const lastRefreshEl = document.getElementById('last-refresh') as HTMLElement;
const filterRoot = document.getElementById('events-filter') as HTMLElement;
const listRoot = document.getElementById('events-list') as HTMLElement;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const MAX_EVENTS = 500;
let events: OperatorEventEntry[] = [];
let hasMore = false;
let oldestEventId: number | null = null;
let connectionState: ConnectionState = 'loading';
let lastRefreshAt: Date | null = null;
let activeFilter: FilterGroup = 'all';
const knownIds = new Set<number>();
let eventSource: EventSource | null = null;
let isFetching = false;
let isClearingEvents = false;

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
// Data fetching
// ---------------------------------------------------------------------------

async function fetchEvents(
  options?: { before?: number; eventType?: string },
): Promise<EventFeedResponse | null> {
  const params = new URLSearchParams();
  params.set('limit', '50');
  if (options?.before !== undefined) params.set('before', String(options.before));
  if (options?.eventType) params.set('eventType', options.eventType);

  try {
    const res = await fetch(`/api/events/feed?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: EventFeedResponse = await res.json();
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    return data;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error');
    if (events.length === 0) {
      listRoot.innerHTML = `
        <div class="error-state">
          Failed to load events: ${escapeHtml(message)}
          <div class="error-details">The broker may not be running. Check the server logs.</div>
        </div>`;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Initial load
// ---------------------------------------------------------------------------

async function loadInitial(): Promise<void> {
  isFetching = true;
  const data = await fetchEvents();
  isFetching = false;
  if (!data) return;

  events = data.events;
  hasMore = data.hasMore;
  for (const e of events) knownIds.add(e.auditEventId);
  if (events.length > 0) {
    oldestEventId = events[events.length - 1].auditEventId;
  }
  renderEventList();
}

// ---------------------------------------------------------------------------
// Load more (older events)
// ---------------------------------------------------------------------------

async function loadMore(): Promise<void> {
  if (!hasMore || oldestEventId === null || isFetching) return;
  isFetching = true;
  const data = await fetchEvents({ before: oldestEventId });
  isFetching = false;
  if (!data) return;

  for (const e of data.events) {
    if (!knownIds.has(e.auditEventId)) {
      knownIds.add(e.auditEventId);
      events.push(e);
    }
  }
  hasMore = data.hasMore;
  if (data.events.length > 0) {
    oldestEventId = data.events[data.events.length - 1].auditEventId;
  }
  renderEventList();
}

// ---------------------------------------------------------------------------
// Live follow — SSE-triggered re-fetch
// ---------------------------------------------------------------------------

function connectSSE(): void {
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('change', () => {
    fetchLatest();
  });

  eventSource.addEventListener('heartbeat', () => {
    if (connectionState !== 'connected' && events.length > 0) {
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

async function fetchLatest(): Promise<void> {
  if (isFetching) return;
  isFetching = true;
  const data = await fetchEvents();
  isFetching = false;
  if (!data) return;

  let prepended = 0;
  const newEvents: OperatorEventEntry[] = [];
  for (const e of data.events) {
    if (!knownIds.has(e.auditEventId)) {
      knownIds.add(e.auditEventId);
      newEvents.push(e);
      prepended++;
    }
  }
  if (prepended > 0) {
    events = [...newEvents, ...events];
    if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
    renderEventList();
  }
}

// ---------------------------------------------------------------------------
// Filtering (client-side group matching)
// ---------------------------------------------------------------------------

function matchesFilter(entry: OperatorEventEntry): boolean {
  if (activeFilter === 'all') return true;
  if (activeFilter === 'review') return entry.eventType.startsWith('review.');
  if (activeFilter === 'reviewer') return entry.eventType.startsWith('reviewer.');
  return true;
}

function setFilter(group: FilterGroup): void {
  if (group === activeFilter) return;
  activeFilter = group;
  renderFilterBar();
  renderEventList();
}

// ---------------------------------------------------------------------------
// Rendering — filter bar
// ---------------------------------------------------------------------------

const FILTER_OPTIONS: { group: FilterGroup; label: string }[] = [
  { group: 'all', label: 'All' },
  { group: 'review', label: 'Review' },
  { group: 'reviewer', label: 'Reviewer' },
];

function renderFilterBar(): void {
  filterRoot.innerHTML = `
    <div class="filter-bar">
      ${FILTER_OPTIONS.map(
        (f) =>
          `<button class="filter-chip${f.group === activeFilter ? ' active' : ''}" data-filter="${f.group}">${f.label}</button>`,
      ).join('')}
      <button class="action-btn danger clear-events-btn" type="button" ${isClearingEvents ? 'disabled' : ''}>
        ${isClearingEvents ? 'Clearing...' : 'Clear Events'}
      </button>
      <span class="live-indicator" id="live-dot"><span class="pulse-dot"></span> Live</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// Rendering — event list
// ---------------------------------------------------------------------------

function renderEventList(): void {
  const filtered = events.filter(matchesFilter);

  if (filtered.length === 0 && !isFetching) {
    listRoot.innerHTML = `<div class="empty-state">No events${activeFilter !== 'all' ? ` matching "${activeFilter}"` : ''}</div>`;
    return;
  }

  const rows = filtered.map(renderEventRow).join('');
  const loadMoreBtn =
    hasMore && activeFilter === 'all'
      ? `<div class="load-more-container"><button class="load-more-btn" id="load-more-btn">Load more</button></div>`
      : '';

  listRoot.innerHTML = rows + loadMoreBtn;
}

function renderEventRow(entry: OperatorEventEntry): string {
  const badgeClass = entry.eventType.startsWith('reviewer.')
    ? 'event-type-badge reviewer'
    : 'event-type-badge review';

  const reviewIdPart = entry.reviewId
    ? `<span class="event-review-id">${escapeHtml(entry.reviewId)}</span>`
    : '';

  const actorPart = entry.actorId
    ? `<span class="event-actor">${escapeHtml(entry.actorId)}</span>`
    : '';

  const transitionPart =
    entry.statusFrom || entry.statusTo
      ? `<span class="event-transition">${escapeHtml(entry.statusFrom ?? '?')} → ${escapeHtml(entry.statusTo ?? '?')}</span>`
      : '';

  const summaryPart = entry.summary
    ? `<div class="event-summary">${escapeHtml(entry.summary)}</div>`
    : '';

  return `
    <div class="event-row">
      <div class="event-row-header">
        <span class="${badgeClass}">${escapeHtml(entry.eventType)}</span>
        ${reviewIdPart}
        ${actorPart}
        ${transitionPart}
        <span class="event-meta timestamp">${formatTime(entry.createdAt)}</span>
      </div>
      ${summaryPart}
    </div>`;
}

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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function clearEvents(): Promise<void> {
  if (isClearingEvents) return;
  const confirmed = window.confirm('Clear all event rows?');
  if (!confirmed) return;

  isClearingEvents = true;
  renderFilterBar();

  try {
    const res = await fetch('/api/events/clear', { method: 'POST' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = (await res.json()) as DashboardResetResult;

    events = [];
    knownIds.clear();
    hasMore = false;
    oldestEventId = null;
    lastRefreshAt = new Date();
    setConnectionState('connected');
    updateLastRefresh();
    lastRefreshEl.title = `Cleared ${result.eventsDeleted} events`;
    renderEventList();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    setConnectionState('error');
    window.alert(`Failed to clear events: ${message}`);
  } finally {
    isClearingEvents = false;
    renderFilterBar();
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

// Event delegation — single listeners on stable parent containers
filterRoot.addEventListener('click', (e) => {
  const clearBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.clear-events-btn');
  if (clearBtn && !clearBtn.disabled) {
    void clearEvents();
    return;
  }

  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.filter-chip');
  if (btn?.dataset.filter) setFilter(btn.dataset.filter as FilterGroup);
});

listRoot.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.load-more-btn');
  if (btn && !btn.hasAttribute('disabled')) {
    btn.textContent = 'Loading…';
    btn.setAttribute('disabled', 'true');
    loadMore();
  }
});

renderFilterBar();
loadInitial();
connectSSE();
