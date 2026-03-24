import type { NotificationTopic } from './domain.js';

export interface WaitForChangeOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface WaitForChangeResult {
  topic: NotificationTopic | string;
  version: number;
  changed: boolean;
}

type Waiter = {
  sinceVersion: number;
  resolve: (result: WaitForChangeResult) => void;
};

type TopicState = {
  version: number;
  waiters: Set<Waiter>;
};

function createTopicState(): TopicState {
  return {
    version: 0,
    waiters: new Set(),
  };
}

export class VersionedNotificationBus {
  private readonly topics = new Map<string, TopicState>();

  currentVersion(topic: NotificationTopic | string): number {
    return this.getTopicState(topic).version;
  }

  notify(topic: NotificationTopic | string): number {
    const state = this.getTopicState(topic);
    state.version += 1;

    for (const waiter of [...state.waiters]) {
      if (state.version > waiter.sinceVersion) {
        state.waiters.delete(waiter);
        waiter.resolve({ topic, version: state.version, changed: true });
      }
    }

    return state.version;
  }

  waitForChange(topic: NotificationTopic | string, sinceVersion: number, options: WaitForChangeOptions = {}): Promise<WaitForChangeResult> {
    const state = this.getTopicState(topic);

    if (state.version > sinceVersion) {
      return Promise.resolve({ topic, version: state.version, changed: true });
    }

    if (options.signal?.aborted) {
      return Promise.resolve({ topic, version: state.version, changed: false });
    }

    return new Promise<WaitForChangeResult>((resolve) => {
      const waiter: Waiter = { sinceVersion, resolve: finish };
      let timeout: ReturnType<typeof setTimeout> | undefined;

      const onAbort = (): void => {
        finish({ topic, version: state.version, changed: false });
      };

      function cleanup(): void {
        state.waiters.delete(waiter);

        if (timeout) {
          clearTimeout(timeout);
        }

        options.signal?.removeEventListener('abort', onAbort);
      }

      function finish(result: WaitForChangeResult): void {
        cleanup();
        resolve(result);
      }

      state.waiters.add(waiter);

      if (options.timeoutMs) {
        timeout = setTimeout(() => {
          finish({ topic, version: state.version, changed: false });
        }, options.timeoutMs);
      }

      options.signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private getTopicState(topic: NotificationTopic | string): TopicState {
    let state = this.topics.get(topic);

    if (!state) {
      state = createTopicState();
      this.topics.set(topic, state);
    }

    return state;
  }
}
