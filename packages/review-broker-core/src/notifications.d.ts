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
export declare class VersionedNotificationBus {
    private readonly topics;
    currentVersion(topic: NotificationTopic | string): number;
    notify(topic: NotificationTopic | string): number;
    waitForChange(topic: NotificationTopic | string, sinceVersion: number, options?: WaitForChangeOptions): Promise<WaitForChangeResult>;
    private getTopicState;
}
//# sourceMappingURL=notifications.d.ts.map