import { z } from 'zod';

import {
  AcceptCounterPatchRequestSchema,
  AcceptCounterPatchResponseSchema,
  AddMessageRequestSchema,
  AddMessageResponseSchema,
  ClaimReviewRequestSchema,
  ClaimReviewResponseSchema,
  CloseReviewRequestSchema,
  CloseReviewResponseSchema,
  CreateReviewRequestSchema,
  CreateReviewResponseSchema,
  GetActivityFeedRequestSchema,
  GetActivityFeedResponseSchema,
  GetDiscussionRequestSchema,
  GetDiscussionResponseSchema,
  GetProposalRequestSchema,
  GetProposalResponseSchema,
  GetReviewStatusRequestSchema,
  GetReviewStatusResponseSchema,
  KillReviewerRequestSchema,
  KillReviewerResponseSchema,
  ListReviewersRequestSchema,
  ListReviewersResponseSchema,
  ListReviewsRequestSchema,
  ListReviewsResponseSchema,
  RejectCounterPatchRequestSchema,
  RejectCounterPatchResponseSchema,
  ReclaimReviewRequestSchema,
  ReclaimReviewResponseSchema,
  SpawnReviewerRequestSchema,
  SpawnReviewerResponseSchema,
  SubmitVerdictRequestSchema,
  SubmitVerdictResponseSchema,
} from './contracts.js';

export interface BrokerOperationDefinition<
  TMethodName extends string = string,
  TMcpToolName extends string = string,
  TRequestSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TResponseSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly methodName: TMethodName;
  readonly mcpToolName: TMcpToolName;
  readonly requestSchema: TRequestSchema;
  readonly responseSchema: TResponseSchema;
}

function defineBrokerOperation<
  TMethodName extends string,
  TMcpToolName extends string,
  TRequestSchema extends z.ZodTypeAny,
  TResponseSchema extends z.ZodTypeAny,
>(
  definition: BrokerOperationDefinition<TMethodName, TMcpToolName, TRequestSchema, TResponseSchema>,
): BrokerOperationDefinition<TMethodName, TMcpToolName, TRequestSchema, TResponseSchema> {
  return Object.freeze(definition);
}

export const BROKER_OPERATIONS = Object.freeze([
  defineBrokerOperation({
    methodName: 'createReview',
    mcpToolName: 'create_review',
    requestSchema: CreateReviewRequestSchema,
    responseSchema: CreateReviewResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'listReviews',
    mcpToolName: 'list_reviews',
    requestSchema: ListReviewsRequestSchema,
    responseSchema: ListReviewsResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'spawnReviewer',
    mcpToolName: 'spawn_reviewer',
    requestSchema: SpawnReviewerRequestSchema,
    responseSchema: SpawnReviewerResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'listReviewers',
    mcpToolName: 'list_reviewers',
    requestSchema: ListReviewersRequestSchema,
    responseSchema: ListReviewersResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'killReviewer',
    mcpToolName: 'kill_reviewer',
    requestSchema: KillReviewerRequestSchema,
    responseSchema: KillReviewerResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'claimReview',
    mcpToolName: 'claim_review',
    requestSchema: ClaimReviewRequestSchema,
    responseSchema: ClaimReviewResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'getReviewStatus',
    mcpToolName: 'get_review_status',
    requestSchema: GetReviewStatusRequestSchema,
    responseSchema: GetReviewStatusResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'getProposal',
    mcpToolName: 'get_proposal',
    requestSchema: GetProposalRequestSchema,
    responseSchema: GetProposalResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'reclaimReview',
    mcpToolName: 'reclaim_review',
    requestSchema: ReclaimReviewRequestSchema,
    responseSchema: ReclaimReviewResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'submitVerdict',
    mcpToolName: 'submit_verdict',
    requestSchema: SubmitVerdictRequestSchema,
    responseSchema: SubmitVerdictResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'closeReview',
    mcpToolName: 'close_review',
    requestSchema: CloseReviewRequestSchema,
    responseSchema: CloseReviewResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'addMessage',
    mcpToolName: 'add_message',
    requestSchema: AddMessageRequestSchema,
    responseSchema: AddMessageResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'getDiscussion',
    mcpToolName: 'get_discussion',
    requestSchema: GetDiscussionRequestSchema,
    responseSchema: GetDiscussionResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'getActivityFeed',
    mcpToolName: 'get_activity_feed',
    requestSchema: GetActivityFeedRequestSchema,
    responseSchema: GetActivityFeedResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'acceptCounterPatch',
    mcpToolName: 'accept_counter_patch',
    requestSchema: AcceptCounterPatchRequestSchema,
    responseSchema: AcceptCounterPatchResponseSchema,
  }),
  defineBrokerOperation({
    methodName: 'rejectCounterPatch',
    mcpToolName: 'reject_counter_patch',
    requestSchema: RejectCounterPatchRequestSchema,
    responseSchema: RejectCounterPatchResponseSchema,
  }),
] as const);

export type BrokerOperation = (typeof BROKER_OPERATIONS)[number];
export type BrokerOperationMethodName = BrokerOperation['methodName'];
export type BrokerOperationMcpToolName = BrokerOperation['mcpToolName'];
export type BrokerOperationByMethodName<TMethodName extends BrokerOperationMethodName> = Extract<
  BrokerOperation,
  { methodName: TMethodName }
>;
export type BrokerOperationByMcpToolName<TMcpToolName extends BrokerOperationMcpToolName> = Extract<
  BrokerOperation,
  { mcpToolName: TMcpToolName }
>;
export type BrokerOperationRequest<TMethodName extends BrokerOperationMethodName> = z.infer<
  BrokerOperationByMethodName<TMethodName>['requestSchema']
>;
export type BrokerOperationResponse<TMethodName extends BrokerOperationMethodName> = z.infer<
  BrokerOperationByMethodName<TMethodName>['responseSchema']
>;
export type BrokerOperationRequestByToolName<TMcpToolName extends BrokerOperationMcpToolName> = z.infer<
  BrokerOperationByMcpToolName<TMcpToolName>['requestSchema']
>;
export type BrokerOperationResponseByToolName<TMcpToolName extends BrokerOperationMcpToolName> = z.infer<
  BrokerOperationByMcpToolName<TMcpToolName>['responseSchema']
>;

type BrokerOperationMapByMethodName = {
  readonly [TMethodName in BrokerOperationMethodName]: BrokerOperationByMethodName<TMethodName>;
};

type BrokerOperationMapByMcpToolName = {
  readonly [TMcpToolName in BrokerOperationMcpToolName]: BrokerOperationByMcpToolName<TMcpToolName>;
};

export const BROKER_OPERATION_METHOD_NAMES = Object.freeze(
  BROKER_OPERATIONS.map((operation) => operation.methodName),
) as readonly BrokerOperationMethodName[];

export const BROKER_OPERATION_MCP_TOOL_NAMES = Object.freeze(
  BROKER_OPERATIONS.map((operation) => operation.mcpToolName),
) as readonly BrokerOperationMcpToolName[];

export const BROKER_OPERATIONS_BY_METHOD_NAME: BrokerOperationMapByMethodName = Object.freeze(
  Object.fromEntries(BROKER_OPERATIONS.map((operation) => [operation.methodName, operation])) as BrokerOperationMapByMethodName,
);

export const BROKER_OPERATIONS_BY_MCP_TOOL_NAME: BrokerOperationMapByMcpToolName = Object.freeze(
  Object.fromEntries(BROKER_OPERATIONS.map((operation) => [operation.mcpToolName, operation])) as BrokerOperationMapByMcpToolName,
);

export function getBrokerOperationByMethodName<TMethodName extends BrokerOperationMethodName>(
  methodName: TMethodName,
): BrokerOperationByMethodName<TMethodName> {
  return BROKER_OPERATIONS_BY_METHOD_NAME[methodName];
}

export function getBrokerOperationByMcpToolName<TMcpToolName extends BrokerOperationMcpToolName>(
  mcpToolName: TMcpToolName,
): BrokerOperationByMcpToolName<TMcpToolName> {
  return BROKER_OPERATIONS_BY_MCP_TOOL_NAME[mcpToolName];
}

export function parseBrokerOperationRequest<TMethodName extends BrokerOperationMethodName>(
  methodName: TMethodName,
  input: unknown,
): BrokerOperationRequest<TMethodName> {
  return getBrokerOperationByMethodName(methodName).requestSchema.parse(input) as BrokerOperationRequest<TMethodName>;
}

export function parseBrokerOperationResponse<TMethodName extends BrokerOperationMethodName>(
  methodName: TMethodName,
  input: unknown,
): BrokerOperationResponse<TMethodName> {
  return getBrokerOperationByMethodName(methodName).responseSchema.parse(input) as BrokerOperationResponse<TMethodName>;
}

export function parseBrokerOperationRequestByMcpToolName<TMcpToolName extends BrokerOperationMcpToolName>(
  mcpToolName: TMcpToolName,
  input: unknown,
): BrokerOperationRequestByToolName<TMcpToolName> {
  return getBrokerOperationByMcpToolName(mcpToolName).requestSchema.parse(input) as BrokerOperationRequestByToolName<TMcpToolName>;
}

export function parseBrokerOperationResponseByMcpToolName<TMcpToolName extends BrokerOperationMcpToolName>(
  mcpToolName: TMcpToolName,
  input: unknown,
): BrokerOperationResponseByToolName<TMcpToolName> {
  return getBrokerOperationByMcpToolName(mcpToolName).responseSchema.parse(input) as BrokerOperationResponseByToolName<TMcpToolName>;
}
