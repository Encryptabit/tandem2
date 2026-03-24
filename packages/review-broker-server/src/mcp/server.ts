import { McpServer, type RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';

import { BROKER_OPERATIONS } from 'review-broker-core';

import type { BrokerService } from '../runtime/broker-service.js';
import { dispatchBrokerMcpTool } from './tool-dispatch.js';

export interface CreateBrokerMcpServerOptions {
  service: BrokerService;
  name?: string;
  version?: string;
  description?: string;
}

export function createBrokerMcpServer(options: CreateBrokerMcpServerOptions): McpServer {
  const server = new McpServer({
    name: options.name ?? 'review-broker',
    version: options.version ?? '0.1.0',
    description: options.description ?? 'Registry-driven MCP surface for the standalone review broker.',
  });

  registerBrokerMcpTools(server, options.service);
  return server;
}

export function registerBrokerMcpTools(server: McpServer, service: BrokerService): readonly RegisteredTool[] {
  return BROKER_OPERATIONS.map((operation) =>
    server.registerTool(
      operation.mcpToolName,
      {
        title: operation.mcpToolName,
        description: `Invoke broker operation ${operation.methodName}.`,
        inputSchema: operation.requestSchema,
        outputSchema: operation.responseSchema,
      },
      (input: unknown) => dispatchBrokerMcpTool(service, operation.mcpToolName, input),
    ),
  );
}
