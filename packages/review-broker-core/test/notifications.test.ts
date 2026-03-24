import { describe, expect, it } from 'vitest';

import { VersionedNotificationBus } from '../src/notifications.js';

describe('review-broker-core notifications', () => {
  it('increments topic versions monotonically when notified', () => {
    const bus = new VersionedNotificationBus();

    expect(bus.currentVersion('reviews')).toBe(0);
    expect(bus.notify('reviews')).toBe(1);
    expect(bus.notify('reviews')).toBe(2);
    expect(bus.currentVersion('reviews')).toBe(2);
  });

  it('wakes waiters after a later version arrives', async () => {
    const bus = new VersionedNotificationBus();
    const waitForChange = bus.waitForChange('review-status', 0, { timeoutMs: 5_000 });

    bus.notify('review-status');

    await expect(waitForChange).resolves.toEqual({
      topic: 'review-status',
      version: 1,
      changed: true,
    });
  });

  it('resolves immediately when the caller already lags the current version', async () => {
    const bus = new VersionedNotificationBus();

    bus.notify('review-queue');
    bus.notify('review-queue');

    await expect(bus.waitForChange('review-queue', 0)).resolves.toEqual({
      topic: 'review-queue',
      version: 2,
      changed: true,
    });
  });

  it('returns the current version unchanged when the wait times out', async () => {
    const bus = new VersionedNotificationBus();

    await expect(bus.waitForChange('reviews', 0, { timeoutMs: 10 })).resolves.toEqual({
      topic: 'reviews',
      version: 0,
      changed: false,
    });
  });
});
