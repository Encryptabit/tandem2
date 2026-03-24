import type Database from 'better-sqlite3';
import { VersionedNotificationBus } from 'review-broker-core';

import type { AuditRepository } from '../db/audit-repository.js';
import { createAuditRepository } from '../db/audit-repository.js';
import type { MessagesRepository } from '../db/messages-repository.js';
import { createMessagesRepository } from '../db/messages-repository.js';
import type { AppliedMigration, DatabasePragmas } from '../db/open-database.js';
import { openDatabase } from '../db/open-database.js';
import type { ReviewersRepository } from '../db/reviewers-repository.js';
import { createReviewersRepository } from '../db/reviewers-repository.js';
import type { ReviewsRepository } from '../db/reviews-repository.js';
import { createReviewsRepository } from '../db/reviews-repository.js';
import type { ReviewerManager, ReviewerShutdownSummary } from './reviewer-manager.js';
import { createReviewerManager } from './reviewer-manager.js';
import type { ResolveBrokerPathsOptions } from './path-resolution.js';
import { resolveBrokerPaths } from './path-resolution.js';

export interface CreateAppContextOptions extends ResolveBrokerPathsOptions {
  busyTimeoutMs?: number;
  notifications?: VersionedNotificationBus;
}

export interface AppContext {
  db: Database.Database;
  dbPath: string;
  dbPathSource: 'argument' | 'env' | 'default';
  configPath: string;
  configPathSource: 'env' | 'default';
  workspaceRoot: string;
  pragmas: DatabasePragmas;
  appliedMigrations: AppliedMigration[];
  notifications: VersionedNotificationBus;
  reviews: ReviewsRepository;
  reviewers: ReviewersRepository;
  messages: MessagesRepository;
  audit: AuditRepository;
  reviewerManager: ReviewerManager;
  close: () => void;
  shutdown: () => Promise<ReviewerShutdownSummary>;
}

export function createAppContext(options: CreateAppContextOptions = {}): AppContext {
  const resolved = resolveBrokerPaths(options);
  const opened = openDatabase({
    dbPath: resolved.dbPath,
    ...(options.busyTimeoutMs !== undefined ? { busyTimeoutMs: options.busyTimeoutMs } : {}),
  });
  const notifications = options.notifications ?? new VersionedNotificationBus();
  const reviews = createReviewsRepository(opened.db);
  const reviewers = createReviewersRepository(opened.db);
  const audit = createAuditRepository(opened.db);
  const reviewerManager = createReviewerManager({
    reviewers,
    audit,
    workspaceRoot: resolved.workspaceRoot,
    notifications,
  });

  let closingState: 'open' | 'closing' | 'closed' = 'open';
  let shutdownPromise: Promise<ReviewerShutdownSummary> | null = null;

  return {
    db: opened.db,
    dbPath: opened.dbPath,
    dbPathSource: resolved.dbPathSource,
    configPath: resolved.configPath,
    configPathSource: resolved.configPathSource,
    workspaceRoot: resolved.workspaceRoot,
    pragmas: opened.pragmas,
    appliedMigrations: opened.appliedMigrations,
    notifications,
    reviews,
    reviewers,
    messages: createMessagesRepository(opened.db),
    audit,
    reviewerManager,
    close: () => {
      if (shutdownPromise || closingState === 'closed') {
        return;
      }

      closingState = 'closed';
      reviewerManager.close();
      opened.close();
    },
    shutdown: async () => {
      if (shutdownPromise) {
        return shutdownPromise;
      }

      if (closingState === 'closed') {
        return {
          requestedReviewerIds: [],
          outcomes: {
            killed: 0,
            already_offline: 0,
            not_found: 0,
          },
        };
      }

      closingState = 'closing';
      shutdownPromise = (async () => {
        try {
          return await reviewerManager.shutdown();
        } finally {
          closingState = 'closed';
          opened.close();
        }
      })();

      return shutdownPromise;
    },
  };
}
