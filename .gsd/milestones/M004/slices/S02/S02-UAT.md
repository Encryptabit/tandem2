# S02: Live operator event/log surface — UAT

**Milestone:** M004
**Written:** 2026-03-25

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The slice proves a broker-served event feed rendering real audit data from a live SQLite-backed broker. Live-runtime UAT exercises the actual operator experience through the browser, including live follow, filtering, pagination, and redaction safety.

## Preconditions

1. The dashboard is built: `corepack pnpm --filter review-broker-dashboard build`
2. A broker process is running with the dashboard: `corepack pnpm broker:dashboard` (or `corepack pnpm --filter review-broker-server exec tsx src/cli/start-broker.ts --dashboard --db-path /tmp/s02-uat.db`)
3. Note the dashboard URL from the `broker.dashboard_ready` JSON event on stdout
4. A browser is open to that dashboard URL
5. At least one review exists (create via typed client or MCP if the database is fresh)

## Test Cases

### TC-01: Event feed route returns structured data

**Steps:**
1. In a terminal, `curl <dashboard-url>/api/events/feed`
2. Verify the response is valid JSON with shape `{ events: [...], hasMore: boolean }`
3. Each event entry has: `auditEventId`, `eventType`, `createdAt`, and optionally `reviewId`, `actorId`, `summary`, `previousStatus`, `newStatus`
4. Verify no entry contains `command`, `args`, `cwd`, `workspaceRoot`, or `metadata` keys

**Expected:** HTTP 200 with `EventFeedResponse` JSON. All entries are redaction-safe.

### TC-02: Event feed pagination via cursor

**Steps:**
1. Create 3+ reviews to generate multiple audit events
2. `curl <dashboard-url>/api/events/feed?limit=2`
3. Note `hasMore` should be `true` if more than 2 events exist
4. Take the `auditEventId` of the last event in the array
5. `curl <dashboard-url>/api/events/feed?limit=2&before=<that-id>`
6. Verify the second page contains older events not present in the first page

**Expected:** Pages are disjoint, events are in reverse chronological order, `hasMore` correctly indicates whether more pages exist.

### TC-03: Event type filtering

**Steps:**
1. `curl <dashboard-url>/api/events/feed?eventType=review.created`
2. Verify all returned events have `eventType: "review.created"`
3. `curl <dashboard-url>/api/events/feed?eventType=nonexistent.type`
4. Verify response is `{ events: [], hasMore: false }`

**Expected:** Filter restricts to exact event type. Unknown types return empty array, not an error.

### TC-04: Events page renders in browser

**Steps:**
1. Navigate to `<dashboard-url>/events/`
2. Verify the page title is "Events — Review Broker Dashboard"
3. Verify a nav bar exists with "Overview" and "Events" links, with "Events" marked active
4. Verify the connection status badge shows "connected" after initial load
5. Verify event entries are visible in the list with event type badges, timestamps, and summaries

**Expected:** The events page renders a populated, styled event list with active navigation and connection state.

### TC-05: Cross-page navigation

**Steps:**
1. From the events page, click the "Overview" link in the nav bar
2. Verify the overview page loads with the Overview link now marked active
3. Click the "Events" link to return
4. Verify the events page loads with the Events link marked active

**Expected:** Navigation works in both directions. Active state is correct on each page.

### TC-06: Client-side group filtering

**Steps:**
1. On the events page, verify filter chips for "All", "Review", and "Reviewer" are visible
2. Click "Review" — verify only events with `eventType` starting with `review.` are shown
3. Click "Reviewer" — verify only events with `eventType` starting with `reviewer.` are shown
4. Click "All" — verify all events are shown again

**Expected:** Filter chips toggle visibility of events by type prefix. No fetch to the server on filter change (client-side only).

### TC-07: Live follow via SSE

**Steps:**
1. Open the events page in a browser
2. Note the current event list
3. In a separate terminal, create a new review via the typed client or MCP
4. Within a few seconds, observe that the new event appears at the top of the list without page reload
5. Verify the "Live" pulsing indicator is visible

**Expected:** New broker events appear in the events page in real time via SSE-triggered re-fetch. No manual refresh required.

### TC-08: Load more pagination in browser

**Steps:**
1. Generate more than 50 audit events (the default page size)
2. Open the events page
3. Scroll to the bottom of the event list
4. Click the "Load more" button
5. Verify older events are appended below the existing list

**Expected:** "Load more" fetches the next page of events and appends them. Button disappears when no more events exist (`hasMore: false`).

### TC-09: Redaction safety — belt and suspenders

**Steps:**
1. Start a broker with a reviewer that has known `command` and `args` values
2. Create a review so the reviewer generates audit events with metadata
3. `curl <dashboard-url>/api/events/feed | grep -i 'command\|"args"\|"cwd"\|workspaceRoot\|"metadata"'`
4. Verify the grep returns no matches

**Expected:** No event in the feed response contains raw process metadata. Only the `summary` field from metadata is projected.

### TC-10: Error and empty states

**Steps:**
1. On the events page, if no events exist, verify a "No events" or loading message is shown
2. Stop the broker while the events page is open
3. Verify the connection status badge changes to "reconnecting" or "error"
4. Verify the event list remains readable (last known state) with a degraded status indicator

**Expected:** Empty state and error state are handled gracefully without blank pages or unhandled exceptions.

## Edge Cases

- **Fresh database with no events:** The events page should show an empty state message, not crash.
- **Concurrent mutations during pagination:** If new events arrive while paginating with "Load more", the dedup `Set<number>` prevents duplicate entries.
- **SSE reconnect:** If the SSE connection drops and reconnects, the client re-fetches the full event list and deduplicates, so no events are lost or duplicated.
- **Very long summary strings:** The projection passes the summary through unchanged; the UI should truncate or wrap gracefully.
