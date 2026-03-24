import type { StartBrokerOptions, StartedBrokerRuntime } from 'review-broker-server';
import { startBroker } from 'review-broker-server';

import { createBrokerClient, type BrokerClient, type BrokerServiceLike } from './client.js';

export function createInProcessBrokerClient(service: BrokerServiceLike): BrokerClient {
  return createBrokerClient({
    call(methodName, request) {
      const handler = service[methodName] as (input: typeof request) => Promise<unknown>;
      return handler(request);
    },
  });
}

export interface StartedInProcessBrokerClient {
  readonly client: BrokerClient;
  readonly runtime: StartedBrokerRuntime;
  close(): void;
  waitUntilStopped(): Promise<void>;
}

export function startInProcessBrokerClient(options: StartBrokerOptions = {}): StartedInProcessBrokerClient {
  const runtime = startBroker(options);
  const client = createInProcessBrokerClient(runtime.service as BrokerServiceLike);

  return {
    client,
    runtime,
    close: () => runtime.close(),
    waitUntilStopped: () => runtime.waitUntilStopped(),
  };
}
