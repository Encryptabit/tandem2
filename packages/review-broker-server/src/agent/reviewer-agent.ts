import { Agent } from '@gsd/pi-agent-core';
import type { AgentTool, StreamFn } from '@gsd/pi-agent-core';
import { getModel, streamSimple } from '@gsd/pi-ai';
import type { Model } from '@gsd/pi-ai';

import type { BrokerService } from '../runtime/broker-service.js';
import { REVIEWER_SYSTEM_PROMPT } from './reviewer-prompt.js';
import { createReviewerAgentTools } from './reviewer-tools.js';

export interface CreateReviewerAgentOptions {
  /** The BrokerService instance the agent's tools will call through. */
  brokerService: BrokerService;
  /** Unique identifier for this reviewer — injected into tool closures as claimantId/actorId. */
  reviewerId: string;
  /** LLM model to use. Defaults to claude-sonnet-4-20250514 via Anthropic. */
  model?: Model<any>;
  /** Stream function for LLM communication. Defaults to streamSimple from @gsd/pi-ai. */
  streamFn?: StreamFn;
}

/**
 * Creates a fully configured reviewer Agent with 6 tools wrapping BrokerService methods.
 *
 * The returned Agent is ready to accept a prompt — call `agent.prompt(message)` to start
 * a review cycle. The agent's system prompt instructs it to list, claim, analyze, and
 * submit verdicts on code reviews.
 *
 * Observable via `agent.subscribe()` — emits `tool_execution_start`, `tool_execution_end`,
 * and `agent_end` events for lifecycle tracking.
 */
export function createReviewerAgent(options: CreateReviewerAgentOptions): Agent {
  const {
    brokerService,
    reviewerId,
    model = getModel('anthropic', 'claude-sonnet-4-20250514'),
    streamFn = streamSimple,
  } = options;

  const tools: AgentTool<any>[] = createReviewerAgentTools(brokerService, reviewerId);
  const systemPrompt = REVIEWER_SYSTEM_PROMPT.replace(/{reviewerId}/g, reviewerId);

  return new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
    },
    streamFn,
  });
}
