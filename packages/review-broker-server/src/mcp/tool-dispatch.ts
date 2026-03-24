import { ZodError } from 'zod';

import {
  getBrokerOperationByMcpToolName,
  parseBrokerOperationRequestByMcpToolName,
  parseBrokerOperationResponseByMcpToolName,
  type BrokerOperationMcpToolName,
  type BrokerOperationResponseByToolName,
} from 'review-broker-core';

import { ErrorCode, McpError, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { BrokerServiceError, type BrokerService } from '../runtime/broker-service.js';

export async function dispatchBrokerMcpTool<TMcpToolName extends BrokerOperationMcpToolName>(
  service: BrokerService,
  toolName: TMcpToolName,
  input: unknown,
): Promise<CallToolResult> {
  const operation = getBrokerOperationByMcpToolName(toolName);

  let request;
  try {
    request = parseBrokerOperationRequestByMcpToolName(toolName, input);
  } catch (error) {
    logToolFailure(toolName, 'request_invalid', error);
    throw toProtocolError(toolName, error, 'request');
  }

  let response;
  try {
    const handler = service[operation.methodName] as (request: unknown) => Promise<unknown>;
    response = await handler(request);
  } catch (error) {
    logToolFailure(toolName, 'dispatch_failed', error);
    throw toProtocolError(toolName, error, 'dispatch');
  }

  try {
    const structuredContent = parseBrokerOperationResponseByMcpToolName(toolName, response);
    return {
      content: [{ type: 'text', text: summarizeToolResult(toolName, structuredContent) }],
      structuredContent: structuredContent as Record<string, unknown>,
    } satisfies CallToolResult;
  } catch (error) {
    logToolFailure(toolName, 'response_invalid', error);
    throw toProtocolError(toolName, error, 'response');
  }
}

function summarizeToolResult<TMcpToolName extends BrokerOperationMcpToolName>(
  toolName: TMcpToolName,
  response: BrokerOperationResponseByToolName<TMcpToolName>,
): string {
  const maybeVersion =
    typeof response === 'object' && response !== null && 'version' in response && typeof response.version === 'number'
      ? ` Version ${response.version}.`
      : '';

  return `${toolName} succeeded.${maybeVersion}`;
}

function toProtocolError(
  toolName: BrokerOperationMcpToolName,
  error: unknown,
  phase: 'request' | 'dispatch' | 'response',
): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new McpError(
      phase === 'response' ? ErrorCode.InternalError : ErrorCode.InvalidParams,
      phase === 'response'
        ? `Broker operation ${toolName} returned an invalid response payload.`
        : `Invalid arguments for ${toolName}.`,
      {
        phase,
        issues: error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path,
          message: issue.message,
        })),
      },
    );
  }

  if (error instanceof BrokerServiceError) {
    return new McpError(ErrorCode.InvalidParams, error.message, {
      phase,
      brokerCode: error.code,
      reviewId: error.reviewId ?? null,
    });
  }

  return new McpError(ErrorCode.InternalError, `Broker operation ${toolName} failed.`, {
    phase,
    cause: error instanceof Error ? error.name : typeof error,
  });
}

function logToolFailure(
  toolName: BrokerOperationMcpToolName,
  phase: 'request_invalid' | 'dispatch_failed' | 'response_invalid',
  error: unknown,
): void {
  const payload =
    error instanceof ZodError
      ? {
          event: 'mcp.tool_failed',
          toolName,
          phase,
          errorType: 'ZodError',
          issues: error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path,
            message: issue.message,
          })),
        }
      : error instanceof BrokerServiceError
        ? {
            event: 'mcp.tool_failed',
            toolName,
            phase,
            errorType: 'BrokerServiceError',
            brokerCode: error.code,
            reviewId: error.reviewId ?? null,
            message: error.message,
          }
        : {
            event: 'mcp.tool_failed',
            toolName,
            phase,
            errorType: error instanceof Error ? error.name : typeof error,
            message: error instanceof Error ? error.message : String(error),
          };

  console.error(JSON.stringify(payload));
}
