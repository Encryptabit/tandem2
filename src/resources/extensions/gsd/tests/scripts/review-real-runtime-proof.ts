import path from 'node:path';
import { runReviewRealRuntimeProof } from '../review-real-runtime-flow.ts';

const proofRoot = path.join(process.cwd(), '.tmp-review-runtime-proof');
const summary = await runReviewRealRuntimeProof(proofRoot);

console.log(`proofRoot: ${summary.proofRoot}`);
console.log(`brokerDb: ${summary.broker.dbPath}`);
console.log(`waitReviewId: ${summary.waitContinuity.initialSubmit.reviewId}`);
console.log(`blockedReviewId: ${summary.blockedVisibility.finalize.reviewId}`);
console.log(`errorDecision: ${summary.errorVisibility.manualSubmit.decision}`);
console.log(`brokerRows: ${summary.broker.persistedRows.length}`);
console.log(`summaryPath: ${path.join(proofRoot, 'proof-summary.json')}`);
