# Retrospective — Agent Sidepanel MVP (Increment 1)

**Date:** 2026-05-15
**Scope:** PR-ASM-1 (#325) → PR-ASM-2 (#345) → PR-ASM-3 (#346) → PR-ASM-4 (#347) → PR-ASM-5 (#348). All merged to `develop`.

## What shipped

A single-day full-stack agent sidepanel: subscription-via-CLI transport (no `~/.claude/` reads, plugin shells out to the user's own `claude` binary), stage-aware system prompts, `--output-format json --json-schema` structured envelopes for the `/create-file` command, per-feature session persistence with `--resume` chaining, the trust-first `FileWriteProposal` flow with the `ConfirmModalPort` overwrite gate, the `local/no-claude-home-reads` ESLint rule, and an integration-test sweep that pins the §13.4 release-blockers.

67/67 REQ-ASM closed; 1375/1375 unit tests green.

## What worked

1. **Spec-first paid off.** The 85-task plan with TDD pairing meant every PR shipped with its test surface already drafted. Every Codex P1 was a real defect (not a missing test) and most had a fix in under 30 lines.
2. **Trust-first invariant survived contact with the model.** `commitFileWriteProposal` as the *only* `VaultPort.writeFile` caller for LLM proposals never wavered through five rounds of refactoring. The NFR-ASM-011 invariant is now physically enforceable by grep.
3. **Centralised guard in `queryStructured`.** Putting `STRUCTURED_OUTPUT_GUARD_SUFFIX` inside the wrapper instead of the UI call site meant new callers automatically inherit the JSON-only contract. Same pattern for `_emitCompletionTelemetry` — telemetry shape concentrated at the point of emission, not split across paths.
4. **Codex review cadence (2 passes per commit).** Every PR went through ≥2 review rounds. The second pass consistently surfaced second-order bypasses (template literals after fixing concatenations, optional chaining after fixing dot access). Worth the wait every time.
5. **The CCS reuse contract held.** Active-file auto-context (REQ-ASM-051..053) inherited from REQ-CCS-005/006 with zero new production code in PR-ASM-5 — verification-only test.

## What hurt

1. **Repeated Codex P1 bypass surfacing on the ESLint rule.** Four review rounds on the same file (`no-claude-home-reads.cjs`) — template literals, bare `~/.claude`, optional chaining, then `path.posix.join`. Each was a legitimate gap, but the cumulative cost was high. **Lesson:** for any structural lint rule, the initial design should walk the full `unwrapChain` → `isPropertyNamed` shape from the start; the test surface should include bracket-property + optional-chaining + alias variants on day one.
2. **`build:web` scoped-style hash churn polluted history.** Two commits dedicated to refreshing `styles.css` after Vue component edits because the file is tracked. **Lesson:** consider whether `styles.css` actually needs to be in-tree, or if the build artifact belongs in CI only. (Out of scope for this increment — file an issue if we want to revisit.)
3. **The `node:fs` module-mock dance in `tests/integration/no-claude-home.test.ts`.** Took two iterations to land because `vi.spyOn` on `node:fs` exports fails silently (non-configurable). **Lesson:** module-level `vi.mock` with `importActual` is the only reliable shape for spying on Node built-ins.
4. **Cyclomatic-complexity ceiling triggered late.** The folder-derivation fix pushed `commitFileWriteProposal` from 10 to 11 and broke lint in CI after green tests locally. **Lesson:** when adding a control-flow branch to a function already near the limit, extract proactively, don't wait for the lint failure.
5. **`zod-to-json-schema` import was wrong.** Used the npm package; the repo is on Zod 4 which has built-in `z.toJSONSchema`. Cost a typecheck round-trip. **Lesson:** check the Zod major version before reaching for adjacent packages.

## Architectural decisions worth keeping

- **ADR-0027** — subscription-via-CLI: validated under load (5 PRs, 1375 tests, real Codex reviews). The plugin never touched `~/.claude/`; the user always brought their own `claude` binary.
- **ADR-0028** — JSON discipline + `STRUCTURED_OUTPUT_GUARD_SUFFIX`: the suffix-in-wrapper pattern is reusable for any future structured-output capability.
- **ADR-0029** — `--resume` argv chaining + per-feature session log: the audit row contract held; `appendProposalDecision` is the only awaited path and `SessionLogNoSessionError` makes the "no session yet" case loud.
- **ADR-0030** — `commitFileWriteProposal` as the sole LLM-proposal vault-mutation path: enforced by NFR-ASM-011 in-file invariant, by `local/no-claude-home-reads` adjacency, and by the `credentials-grep-audit` test. Triple-belt.
- **ADR-0031** — `local/no-claude-home-reads`: structural ban on every shape that resolves to `process.env.HOME` or `os.homedir()` adjacent to `.claude`. Five tightening rounds left a robust rule.
- **ADR-0032** — `_emitCompletionTelemetry`: canonical `{ transport, sessionId: '<redacted>' | null, durationMs, exitCode }` shape with NFR-ASM-005 redaction.

## Open items carrying forward (non-blocking)

- **OQ-ASM-T2** — proposal-card unmount focus target. Returns to `ChatInput` textarea today; revisit if real a11y testing shows a better target.
- **OQ-ASM-T3** — opt-in eager-flush for `appendUserAssistant`. Not needed for Increment 1; add only when a real workflow demands it.
- **Telemetry redaction strategy.** Currently emits the literal `'<redacted>'`. If aggregation tooling needs to count distinct sessions, a hashed prefix would be better. File an ADR if the need arises.

## Improvements for next increment

1. **Bypass-class checklist for AST rules.** When designing any structural ESLint rule, pre-enumerate: bracket-property access, optional chaining, alias members (`path.posix.x`, `path.win32.x`), destructured imports, deeper member chains (`globalThis.x`), template literals vs concatenation. Land them all in the first commit, not over four review rounds.
2. **Pre-commit lint check, not just CI lint check.** All cyclomatic-complexity surprises this increment surfaced in CI. A pre-commit hook running `npm run lint` (already wired? — verify) would catch them at commit time.
3. **Telemetry parity for the api-key transport.** This increment shipped completion telemetry for the subscription transport only. Add the same emission shape to the api-key path so a single dashboard works across both.
4. **Document the test-mock pattern for `node:*` modules.** A small `docs/testing/mocking-node-builtins.md` would save the next person an hour. (Could be a follow-up issue.)
