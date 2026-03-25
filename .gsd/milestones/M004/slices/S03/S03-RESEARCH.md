# S03 Research: Read-only review browser

**Depth:** Light — well-understood work using established S01/S02 patterns on existing broker read APIs.

## Summary

S03 adds a read-only review browser to the dashboard: a review list page and a review detail view showing status, proposal, discussion, and activity. Every data surface already exists as a broker-service method (`listReviews`, `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed`). The work is dashboard routes + projections + browser pages following the exact patterns S01 and S02 established.

The one non-trivial design point is **activity feed redaction**: the existing `getActivityFeed` broker API returns `ReviewActivityEntry` with a raw `metadata: Record<string, unknown>` field. The dashboard must strip this, projecting only the `summary` string — same pattern as S02's `projectOperatorEvent`.

## Recommendation

Three tasks:

1. **Dashboard contracts + route handlers** — add review list and review detail Zod schemas in `review-broker-core/src/dashboard.ts`, add route methods to `DashboardRouteHandler` and `createDashboardRoutes`, wire HTTP routes in `dashboard-server.ts`. Contract + route tests.

2. **Review browser pages** — add `reviews.astro` page with `reviews-client.ts` for list + detail rendering. Client-side view switching (list ↔ detail via query param or hash). Extend nav bar on all pages. CSS additions.

3. **Integration tests + browser verification** — integration tests exercising review routes through the full HTTP stack with real SQLite data. Build verification.

## Implementation Landscape

### Existing broker read APIs (server-side, ready to use)

| Broker method | Input | Returns | Dashboard use |
|---|---|---|---|
| `listReviews({ status?, limit? })` | `ListReviewsRequest` | `{ reviews: ReviewSummary[], version }` | Review list page |
| `getReviewStatus({ reviewId })` | `GetReviewStatusRequest` | `{ review: ReviewSummary, version }` | Review detail header |
| `getProposal({ reviewId })` | `GetProposalRequest` | `{ proposal: ReviewProposal, version }` | Proposal tab/section |
| `getDiscussion({ reviewId })` | `GetDiscussionRequest` | `{ review: ReviewSummary, messages: ReviewDiscussionMessage[], version }` | Discussion tab/section |
| `getActivityFeed({ reviewId, limit? })` | `GetActivityFeedRequest` | `{ review: ReviewSummary, activity: ReviewActivityEntry[], version }` | Activity tab/section |

All methods validate inputs through Zod schemas and throw `BrokerServiceError` with code `REVIEW_NOT_FOUND` for missing reviews.

### Domain types (from `review-broker-core/src/contracts.ts`)

**ReviewSummary** — `reviewId, title, status, priority, authorId, createdAt, updatedAt, claimedBy, claimedAt, claimGeneration` + lifecycle snapshot fields (`currentRound, latestVerdict, verdictReason, counterPatchStatus, lastMessageAt, lastActivityAt`). Already redaction-safe — no raw process data.

**ReviewProposal** — extends ReviewSummary with `description, diff, affectedFiles`. The `diff` field contains the full patch text. For the dashboard list, only summary fields are needed; proposal detail shows the full diff.

**ReviewDiscussionMessage** — `messageId, reviewId, actorId, authorRole, body, createdAt`. Clean — no redaction needed.

**ReviewActivityEntry** — `auditEventId, reviewId, eventType, actorId, statusFrom, statusTo, errorCode, summary, metadata, createdAt`. **The `metadata` field is the redaction concern** — it can contain `command`, `args`, `cwd`, `workspaceRoot` from reviewer operations. Dashboard projection must strip it, keeping only `summary`.

### Dashboard contracts to add (`review-broker-core/src/dashboard.ts`)

New schemas needed:

- `DashboardReviewListItemSchema` — projection of `ReviewSummary` for the list view (all fields are already safe, but a dashboard-specific schema keeps the transport contract explicit)
- `ReviewListResponseSchema` — `{ reviews: DashboardReviewListItem[], hasMore: boolean }`
- `DashboardReviewActivityEntrySchema` — like `OperatorEventEntrySchema` but review-scoped: strips `metadata`, keeps `summary`
- `ReviewDetailResponseSchema` — composite payload: `{ review: ReviewSummary, proposal: { title, description, diff, affectedFiles, priority }, discussion: ReviewDiscussionMessage[], activity: DashboardReviewActivityEntry[] }`

### Route handler additions (`dashboard-routes.ts`)

New methods on `DashboardRouteHandler`:

- `getReviewList(options: { status?, limit? })` → calls `runtime.service.listReviews()`, projects into `ReviewListResponse`
- `getReviewDetail(reviewId: string)` → calls `getReviewStatus`, `getProposal`, `getDiscussion`, `getActivityFeed` in sequence, projects into `ReviewDetailResponse` with redacted activity

The `getReviewDetail` method composes four broker calls. These are all synchronous SQLite reads behind the scenes, so no parallelism concern.

### HTTP routes (`dashboard-server.ts`)

New routes:

- `GET /api/reviews` — query params: `status`, `limit`. Returns `ReviewListResponse`.
- `GET /api/reviews/:reviewId` — returns `ReviewDetailResponse`. URL param extraction from pathname.

The URL param extraction for `:reviewId` requires a small pathname parser. The existing server uses exact pathname matching (`pathname === '/api/overview'`). For `/api/reviews/:id`, match `pathname.startsWith('/api/reviews/') && segments.length === 3`.

### Dashboard pages

**Astro is in static mode** (`output: 'static'`). No dynamic `[id]` routes at build time. Two approaches:

1. **Single `reviews.astro` page** with client-side view switching (query param `?review=<id>` toggles list ↔ detail). Simpler — one page, one client module.
2. **Two pages** (`reviews/index.astro` for list, detail handled via query param on same page). Effectively the same since detail data is all runtime-fetched.

**Recommended:** Single `reviews.astro` page at `/reviews/` with a `reviews-client.ts` module that handles both list and detail views. Query param `?id=<reviewId>` switches to detail. Back button returns to list. This matches the pattern of `events-client.ts` (single page, all data runtime-fetched).

### Navigation

All three pages (`index.astro`, `events.astro`, `reviews.astro`) need the nav updated:

```html
<nav class="nav">
  <a href="/">Overview</a>
  <a href="/events/">Events</a>
  <a href="/reviews/">Reviews</a>
</nav>
```

Active state via `class="active" aria-current="page"` on the current page.

### Client module pattern (`reviews-client.ts`)

Follow `events-client.ts` structure:
- Inline types (mirror Zod schemas, no build-time import)
- Fetch from `/api/reviews` for list, `/api/reviews/<id>` for detail
- SSE subscription for live updates (re-fetch on `change` events)
- Connection state badge (reuses same DOM elements as other pages)
- Status filter chips for the list view (pending/claimed/submitted/etc.)
- Review row click → switch to detail view
- Detail view: status header, proposal section (with diff in `<pre>`), discussion thread, activity timeline
- Back button → return to list

### CSS additions

New styles for:
- Review list rows (similar to event rows)
- Status badges with color coding per review status
- Proposal section with diff display (`<pre>` with monospace, horizontal scroll)
- Discussion thread (message bubbles or simple stacked entries)
- Activity timeline (reuse event row styling from S02)
- Detail view layout

### Test structure

**Contract tests** (in `review-broker-core/test/dashboard-contracts.test.ts`):
- `DashboardReviewListItemSchema` parse/reject
- `ReviewListResponseSchema` parse/reject
- `DashboardReviewActivityEntrySchema` parse/reject
- `ReviewDetailResponseSchema` parse/reject

**Route tests** (new file `packages/review-broker-server/test/http-review-routes.test.ts`):
- `GET /api/reviews` returns list with schema-valid items
- `GET /api/reviews?status=pending` filters correctly
- `GET /api/reviews/:id` returns composite detail
- `GET /api/reviews/:id` returns 404 for unknown review
- Activity entries in detail response have no `metadata` field (redaction belt-and-suspenders test)

**Integration tests** (extend `broker-mounted-dashboard.integration.test.ts`):
- Review list after creating reviews
- Review detail with proposal, discussion, and activity after creating a review + adding messages + submitting a verdict
- Reviews page served from mounted dashboard

### Redaction approach

**Activity feed redaction** follows the S02 pattern exactly:

```typescript
function projectDashboardActivityEntry(entry: ReviewActivityEntry): DashboardReviewActivityEntry {
  return {
    auditEventId: entry.auditEventId,
    reviewId: entry.reviewId,
    eventType: entry.eventType,
    actorId: entry.actorId,
    statusFrom: entry.statusFrom,
    statusTo: entry.statusTo,
    errorCode: entry.errorCode,
    summary: typeof entry.summary === 'string' && entry.summary.trim().length > 0 ? entry.summary : null,
    createdAt: entry.createdAt,
  };
}
```

The belt-and-suspenders test should stringify the entire detail response and assert absence of metadata-related keys (`command`, `args`, `cwd`, `workspaceRoot`).

### Requirement coverage

- **R014 primary**: delivers the read-only review browser portion
- **R011 support**: extends the operator dashboard with review inspection
- **R002 preserved**: uses shared Zod schemas in `review-broker-core`, reuses canonical domain vocabulary
- **R010 support**: review activity visibility in the browser

### Build and verify commands

- `corepack pnpm --filter review-broker-core exec vitest run test/dashboard-contracts.test.ts`
- `corepack pnpm --filter review-broker-server exec vitest run test/http-review-routes.test.ts`
- `corepack pnpm --filter review-broker-server exec vitest run test/broker-mounted-dashboard.integration.test.ts`
- `corepack pnpm --filter review-broker-dashboard build`
- `corepack pnpm --filter review-broker-core build`

### Skill discovery

No new skills needed. The work uses established patterns (TypeScript, Zod, Astro static, vanilla client JS). No external libraries to add.
