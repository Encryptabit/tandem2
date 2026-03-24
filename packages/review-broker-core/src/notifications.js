function createTopicState() {
    return {
        version: 0,
        waiters: new Set(),
    };
}
export class VersionedNotificationBus {
    topics = new Map();
    currentVersion(topic) {
        return this.getTopicState(topic).version;
    }
    notify(topic) {
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
    waitForChange(topic, sinceVersion, options = {}) {
        const state = this.getTopicState(topic);
        if (state.version > sinceVersion) {
            return Promise.resolve({ topic, version: state.version, changed: true });
        }
        if (options.signal?.aborted) {
            return Promise.resolve({ topic, version: state.version, changed: false });
        }
        return new Promise((resolve) => {
            const waiter = { sinceVersion, resolve: finish };
            let timeout;
            const onAbort = () => {
                finish({ topic, version: state.version, changed: false });
            };
            function cleanup() {
                state.waiters.delete(waiter);
                if (timeout) {
                    clearTimeout(timeout);
                }
                options.signal?.removeEventListener('abort', onAbort);
            }
            function finish(result) {
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
    getTopicState(topic) {
        let state = this.topics.get(topic);
        if (!state) {
            state = createTopicState();
            this.topics.set(topic, state);
        }
        return state;
    }
}
//# sourceMappingURL=notifications.js.map