/**
 * Pool configuration schema and loader.
 *
 * Validates the `reviewer_pool` section of the broker config file using Zod.
 * Returns `null` when the section is absent (pool disabled), throws with
 * user-friendly field-path errors on invalid values.
 */

import { z } from 'zod';

import { readConfig } from '../cli/config.js';

export const PoolConfigSchema = z
  .object({
    max_pool_size: z.number().int().min(1).max(10).default(3),
    idle_timeout_seconds: z.number().int().min(60).default(300),
    max_ttl_seconds: z.number().int().min(300).default(3600),
    claim_timeout_seconds: z.number().int().min(60).default(1200),
    spawn_cooldown_seconds: z.number().int().min(1).default(10),
    scaling_ratio: z.number().min(1.0).default(3.0),
    background_check_interval_seconds: z.number().int().min(5).default(30),
  })
  .strict();

export type PoolConfig = z.infer<typeof PoolConfigSchema>;

/**
 * Load and validate pool configuration from the broker config file.
 *
 * @returns Validated `PoolConfig` when `reviewer_pool` section exists,
 *          `null` when section is absent or the config file doesn't exist.
 * @throws  Error with field-path information when values are invalid.
 */
export function loadPoolConfig(configPath: string): PoolConfig | null {
  const config = readConfig(configPath);

  const reviewerPool = config.reviewer_pool;

  // Section absent or not an object → pool disabled
  if (reviewerPool === undefined || reviewerPool === null) {
    return null;
  }
  if (typeof reviewerPool !== 'object' || Array.isArray(reviewerPool)) {
    return null;
  }

  try {
    return PoolConfigSchema.parse(reviewerPool);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((issue) => {
        const fieldPath = issue.path.join('.');
        return `${fieldPath}: ${issue.message}`;
      });
      throw new Error(`Invalid pool config: ${messages.join('; ')}`);
    }
    throw err;
  }
}
