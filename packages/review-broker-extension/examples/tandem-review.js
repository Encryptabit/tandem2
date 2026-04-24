/**
 * Sample gsd-2 extension entry point.
 *
 * Drop this file (or a version of it) into .gsd/extensions/ of any project
 * where you want the broker review gate active during auto-mode.
 *
 * Prerequisites:
 *   1. The review-broker-extension and review-broker-client packages installed
 *   2. `tandem` and `gsd` commands available on PATH for pooled reviewer workers
 *
 * Workflow (Fix 1 — worktree-diff model):
 *   - Agents do NOT commit during a unit. Leave changes uncommitted in the
 *     worktree.
 *   - The before_next_dispatch hook submits `git diff HEAD` to the broker.
 *   - On approval, the broker transport runs `git add -A && git commit -m ...`
 *     so each approved unit lands as one commit attributed to the agent.
 *   - On a "changes_requested" verdict, both policies retry the same unit and
 *     keep the same reviewId. The difference is guidance mode:
 *       - `intervene` injects explicit user-guidance instructions before remediation.
 *       - `auto-loop` remediates directly from reviewer guidance.
 *   - After a revision is submitted, the review moves back to pending/claimed
 *     on the same review id while waiting for the next verdict.
 *   - By default, review state is stored in the global Tandem broker database.
 *     Set TANDEM_BROKER_DB=.gsd/review-broker/broker.db to opt into a
 *     project-local database.
 *
 * Usage:
 *   tandem-review-install --cwd .
 *   # optional: set TANDEM_BROKER_DB / TANDEM_AUTHOR_ID / TANDEM_REVIEW_BLOCKED_POLICY
 *   # start auto-mode — the extension hooks in automatically
 */

import {
  createTandemReviewExtension,
  createBrokerTransportAdapter,
  ensureReviewBrokerConfigDefaults,
} from 'review-broker-extension';
import { startInProcessBrokerClient } from 'review-broker-client';

const BROKER_DB_PATH = process.env.TANDEM_BROKER_DB?.trim() || undefined;
const AUTHOR_ID = process.env.TANDEM_AUTHOR_ID ?? 'auto-agent';
const BLOCKED_POLICY = process.env.TANDEM_REVIEW_BLOCKED_POLICY === 'intervene'
  ? 'intervene'
  : 'auto-loop';
const REVIEW_WAIT_TIMEOUT_MS = Number.parseInt(process.env.TANDEM_REVIEW_WAIT_TIMEOUT_MS ?? '', 10);
const REVIEW_WAIT_POLL_INTERVAL_MS = Number.parseInt(process.env.TANDEM_REVIEW_WAIT_POLL_INTERVAL_MS ?? '', 10);

function optionalNonNegativeMs(value) {
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalPositiveMs(value) {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

ensureReviewBrokerConfigDefaults({
  projectRoot: process.cwd(),
});

const { client } = startInProcessBrokerClient({
  ...(BROKER_DB_PATH ? { dbPath: BROKER_DB_PATH } : {}),
  cwd: process.cwd(),
  handleSignals: false,
});

export default createTandemReviewExtension({
  blockedPolicy: BLOCKED_POLICY,
  reviewWaitTimeoutMs: optionalNonNegativeMs(REVIEW_WAIT_TIMEOUT_MS),
  reviewWaitPollIntervalMs: optionalPositiveMs(REVIEW_WAIT_POLL_INTERVAL_MS),
  transport: createBrokerTransportAdapter({
    client,
    cwd: process.cwd(),
    authorId: AUTHOR_ID,
  }),
});
