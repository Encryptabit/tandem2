# M002 Discussion Log

## Exchange — 2026-03-22T00:42:55.534Z

### Done shape

What should make M002 count as complete in practice?

- **Auto gate required (Recommended)** — M002 is not done until review-before-progression works in the real auto pipeline.
- **Both manual and gate** — M002 must ship manual review commands/status plus the automatic progression gate.
- **Manual flows first** — M002 can stop at manual review trigger/status/config flows and leave the auto gate later.

**Selected:** Both manual and gate

### Broker link

How should `gsd-2` connect to the standalone broker in the first integrated version?

- **Separate broker process (Recommended)** — Keep the broker standalone and let `gsd-2` talk to it over an explicit client/transport seam.
- **In-process broker** — Let `gsd-2` host the broker runtime directly for the first integration pass.
- **Either is fine** — Choose whichever path is simpler as long as the host boundary stays conceptually separate.

**Selected:** Separate broker process (Recommended)

### Rejected flow

When a review blocks progression, what should the first version of the workflow do?

- **Pause for fixes (Recommended)** — Stop progression, surface the review result clearly, and leave the worktree/session ready for follow-up fixes.
- **Blocked and exit** — Stop progression and fail hard without shaping the next fix step.
- **Auto-fix loop** — Immediately turn the rejection into an automatic follow-up fix cycle inside the workflow.

**Selected:** None of the above
**Notes:** Either 1 or 3

---
## Exchange — 2026-03-22T00:46:15.200Z

### Who for

Who should M002 optimize for first?

- **Your workflow (Recommended)** — Optimize M002 first for your real auto/human GSD usage before generalizing.
- **Small team use** — Design the first version for a few operators sharing the same workflow.
- **Broad users** — Bias toward a more general product surface from the start.

**Selected:** Your workflow (Recommended)

### Patch style

For hard review gating, are you okay with a thin explicit patch to the bundled `gsd` extension?

- **Thin core patch (Recommended)** — Allow a small explicit patch in the bundled `gsd` extension where hard gating needs it.
- **External first** — Avoid patching core flow even if the first gate is weaker or more awkward.
- **Pragmatic mix** — Use the smallest reliable integration, even if that means some core patching.

**Selected:** Thin core patch (Recommended)

### Manual flow

Alongside the auto gate, what manual review surface has to ship in M002?

- **Trigger and status (Recommended)** — Manual review submission plus status/decision visibility are enough for v1.
- **More commands** — Also include richer manual controls in the first milestone.
- **Gate only** — Manual command UX can wait if the automatic gate lands first.

**Selected:** Trigger and status (Recommended)

---
## Exchange — 2026-03-22T00:46:56.076Z

### Depth Check

Did I capture the depth right?

- **Yes, you got it (Recommended)** — This captures the milestone direction well enough to write the context file.
- **Not quite — let me clarify** — Something important is off or missing and I want to correct it first.

**Selected:** Yes, you got it (Recommended)

---
