# S03 Source Handoff

## Purpose

T02 restores the missing `src/resources/extensions/gsd/...` subtree inside this assigned tandem worktree so S03 can execute using only local relative paths.

## Provenance

- **Handoff mode:** local reconstruction inside the sandboxed worktree
- **Authoritative external snapshot available in-worktree:** no
- **External commit/snapshot identity:** unknown from local evidence
- **Reconstruction inputs:**
  - `.gsd/milestones/M002/slices/S03/S03-PLAN.md`
  - `.gsd/milestones/M002/slices/S03/S03-REPLAN.md`
  - `.gsd/milestones/M002/slices/S03/tasks/T01-SUMMARY.md`
  - `.gsd/milestones/M002/slices/S02/tasks/T01-SUMMARY.md`
  - `.gsd/milestones/M002/slices/S02/tasks/T02-SUMMARY.md`
  - `.gsd/milestones/M002/slices/S01/tasks/T01-SUMMARY.md`
  - `.gsd/milestones/M002/slices/S01/tasks/T02-SUMMARY.md`
- **Decision record:** `D014` in `.gsd/DECISIONS.md`

## Notes

This handoff is intentionally explicit about not being a byte-for-byte copy from an external `gsd-2` checkout. The assigned worktree contained planning artifacts only, so the local extension subtree below was reconstructed to provide an inspectable, runnable S03 substrate without leaving the sandbox.

Future agents should treat this file as the source-of-truth manifest for drift detection. If a later sandbox receives a real `gsd-2` snapshot, compare file paths and checksums before merging or replacing anything.

## Local Manifest

| Path | SHA-256 |
|---|---|
| `src/resources/extensions/gsd/auto-loop.ts` | `2bb11ececb7d8b1ab74c454a55fc67b94d653eff8f0bb91e84b6be7d75ab1558` |
| `src/resources/extensions/gsd/auto-verification.ts` | `2061e501264682b6cde829953d91a836b2ff5c8f4ca8e0c1935ff1c90bc38883` |
| `src/resources/extensions/gsd/auto.ts` | `f3b78efdc6b2e70c95b3c475151452bef84bdb56209bf2b787575e6890d90bd3` |
| `src/resources/extensions/gsd/auto/session.ts` | `9e2882c82d57d8793f84797ca0461d5202b06030fc85b72914a5213df05e06af` |
| `src/resources/extensions/gsd/commands/handlers/review.ts` | `21048660326eba1e837c876bc1bd8b1b9afed56ada0aceb2961ccba58bf50efd` |
| `src/resources/extensions/gsd/preferences.ts` | `789d77bf9640b94d835d288c6f627916d76d87d2d03168ebda6a8fd9edc70639` |
| `src/resources/extensions/gsd/review/gate.ts` | `45fe844f89de237c2e8d9b35399b33834d25d230f7c276a5d50cda6d89e3d638` |
| `src/resources/extensions/gsd/review/pause-state.ts` | `fd63b19ae0f67ccce6355ed677243fc4f861b3f6d1491af1d8772e619f057d71` |
| `src/resources/extensions/gsd/review/runtime.ts` | `0325b02f86f648c15985d05e642ed3801b65a4a1bde1e847017159ab521a8a46` |
| `src/resources/extensions/gsd/review/types.ts` | `b43850153d0fbf152def6e28f29145927ebe323aa8feeb92b0e84c3ecc324051` |
| `src/resources/extensions/gsd/tests/auto-loop.test.ts` | `75d83f43bec79c86e53212645c4835a12cb65a5d1790423bcaabf4e5cd720995` |
| `src/resources/extensions/gsd/tests/auto-review-gate.test.ts` | `87b3f7915d325b81661c37ed26f9b2c68cbb98ba2b75bd5bd72db8e4fb7b028e` |
| `src/resources/extensions/gsd/tests/resolve-ts.mjs` | `8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881` |
| `src/resources/extensions/gsd/tests/review-pause-state.test.ts` | `53db167e7709f60eef88c97d1e7310aaa1a0efc0fb2bd32674d07dec87592af2` |
| `src/resources/extensions/gsd/tests/review-preferences.test.ts` | `9fd9e37987e352f8e3fea5a4ff335bf4752b04b1ce5a8aaf6ca97b06e030c011` |
| `src/resources/extensions/gsd/tests/review-status-command.test.ts` | `b9f014f09824b8ff247c35ac2a7b6387074b1d3ff1ce0edfaf32a82cbfcbe850` |

## Local Verification Snapshot

These checks passed against the in-worktree subtree during T02:

- `test -f src/resources/extensions/gsd/auto-loop.ts && test -f src/resources/extensions/gsd/auto.ts && test -f src/resources/extensions/gsd/auto/session.ts && test -f src/resources/extensions/gsd/auto-verification.ts`
- `test -f src/resources/extensions/gsd/review/gate.ts && test -f src/resources/extensions/gsd/review/runtime.ts && test -f src/resources/extensions/gsd/review/types.ts && test -f src/resources/extensions/gsd/commands/handlers/review.ts`
- `test -f src/resources/extensions/gsd/tests/resolve-ts.mjs && test -f src/resources/extensions/gsd/tests/auto-loop.test.ts && test -f src/resources/extensions/gsd/tests/review-status-command.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-preferences.test.ts ./src/resources/extensions/gsd/tests/auto-review-gate.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/auto-loop.test.ts`
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test ./src/resources/extensions/gsd/tests/review-status-command.test.ts ./src/resources/extensions/gsd/tests/review-pause-state.test.ts`
