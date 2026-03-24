import {
  BROKER_OPERATIONS,
  parseBrokerOperationRequest,
  parseBrokerOperationResponse,
  type BrokerOperationMethodName,
  type BrokerOperationRequest,
  type BrokerOperationResponse,
} from 'review-broker-core';

export type BrokerClient = {
  [TMethodName in BrokerOperationMethodName]: (
    input: BrokerOperationRequest<TMethodName>,
  ) => Promise<BrokerOperationResponse<TMethodName>>;
};

export type BrokerServiceLike = BrokerClient;

export interface BrokerClientTransport {
  call<TMethodName extends BrokerOperationMethodName>(
    methodName: TMethodName,
    request: BrokerOperationRequest<TMethodName>,
  ): Promise<unknown>;
}

export function createBrokerClient(transport: BrokerClientTransport): BrokerClient {
  const client = Object.fromEntries(
    BROKER_OPERATIONS.map((operation) => {
      const methodName = operation.methodName;
      const call = async (input: BrokerOperationRequest<typeof methodName>) => {
        const request = parseBrokerOperationRequest(methodName, input);
        const response = await transport.call(methodName, request);
        return parseBrokerOperationResponse(methodName, response);
      };

      return [methodName, call] as const;
    }),
  ) as BrokerClient;

  return Object.freeze(client);
}
