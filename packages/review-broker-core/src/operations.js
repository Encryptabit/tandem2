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
function defineBrokerOperation(definition) {
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
]);
export const BROKER_OPERATION_METHOD_NAMES = Object.freeze(BROKER_OPERATIONS.map((operation) => operation.methodName));
export const BROKER_OPERATION_MCP_TOOL_NAMES = Object.freeze(BROKER_OPERATIONS.map((operation) => operation.mcpToolName));
export const BROKER_OPERATIONS_BY_METHOD_NAME = Object.freeze(Object.fromEntries(BROKER_OPERATIONS.map((operation) => [operation.methodName, operation])));
export const BROKER_OPERATIONS_BY_MCP_TOOL_NAME = Object.freeze(Object.fromEntries(BROKER_OPERATIONS.map((operation) => [operation.mcpToolName, operation])));
export function getBrokerOperationByMethodName(methodName) {
  return BROKER_OPERATIONS_BY_METHOD_NAME[methodName];
}
export function getBrokerOperationByMcpToolName(mcpToolName) {
  return BROKER_OPERATIONS_BY_MCP_TOOL_NAME[mcpToolName];
}
export function parseBrokerOperationRequest(methodName, input) {
  return getBrokerOperationByMethodName(methodName).requestSchema.parse(input);
}
export function parseBrokerOperationResponse(methodName, input) {
  return getBrokerOperationByMethodName(methodName).responseSchema.parse(input);
}
export function parseBrokerOperationRequestByMcpToolName(mcpToolName, input) {
  return getBrokerOperationByMcpToolName(mcpToolName).requestSchema.parse(input);
}
export function parseBrokerOperationResponseByMcpToolName(mcpToolName, input) {
  return getBrokerOperationByMcpToolName(mcpToolName).responseSchema.parse(input);
}
