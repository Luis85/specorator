# Implementation Log — `agent-sidepanel-mvp`

Per-PR record of what landed and which REQ-ASM IDs closed. Satisfies
SPEC-ASM-001 §13.1 (traceability).

---

## PR-ASM-1 — Subscription adapter + transport selector (#325)

**Scope.** Two-transport spawn surface (subscription vs. api-key), the
narrow `ClaudeCliPort` extension, the `selectTransport` policy, the
`buildSubprocessArgs` argv builder, `ClaudeBinaryResolver`, the
production `ClaudeSubprocessAdapter` (long-lived → short-lived
spawn-per-turn after Codex P1 #3), the `MockClaudeSubprocessAdapter`
mirror, settings + `ClaudeCliPathField`, the `degradedClaudeCliPort`
sentinel, and the plugin-side wiring in `main.ts`.

**REQ-ASM IDs closed:** REQ-ASM-001 (TransportKind), REQ-ASM-002
(transport selector), REQ-ASM-003 (subscription argv shape), REQ-ASM-004
(api-key argv shape), REQ-ASM-005 (binary resolver), REQ-ASM-006
(subscription adapter contract), REQ-ASM-007 (`~/.claude/` never read),
REQ-ASM-008 (transport pill data contract), REQ-ASM-009 (`isAvailable`
never throws), REQ-ASM-010 (one spawn per turn — short-lived per
Codex P1 #3 / spec §4.5), REQ-ASM-011 (no `--bare`), REQ-ASM-012 (resume
sessionId argv), REQ-ASM-013 (timeout budget), REQ-ASM-014 (settings
shape), REQ-ASM-015 (settings migration), REQ-ASM-031 (sessionId
capture callback contract).

**Codex P1 fixes.** SpecoratorView provide swapped to a Proxy ref
forwarder; `_handleClose` purges dead threads via `threadKey`; transport
arch changed to short-lived spawn-per-turn with `--resume` chaining;
`startup()` re-resolves the binary path when the resolver returns a new
result.

---

## PR-ASM-2 — Stage prompt + structured envelope (#345)

**Scope.** `assembleSystemPrompt` + `stagePromptMap`, the Zod 4
`createFileEnvelopeSchema` (with `z.toJSONSchema` instead of the
zod-to-json-schema package), `parseStructuredEnvelope`,
`validateProposalPath`, the `SubscriptionCapable` type seam and the
`queryStructured` wrapper with the `runStructured` capability check,
ChatSidebar stage-prompt wiring, and the `ChatResponse`
`structured-fail` state.

**REQ-ASM IDs closed:** REQ-ASM-013 (stage preamble lookup), REQ-ASM-014
(stage map keyed by workflow slug), REQ-ASM-018 (one-shot preamble
per send), REQ-ASM-019 (recomputed per send — no stale cache),
REQ-ASM-021 (structured argv invariants: `--output-format json
--json-schema`), REQ-ASM-022 (envelope schema strict), REQ-ASM-023
(envelope rejection mapped to EnvelopeParseError), REQ-ASM-024
(`structured-fail` state — never quote raw output), REQ-ASM-025
(parse-error UX — separate from CLI errors), REQ-ASM-049 (capability
check `isSubscriptionCapable`).

**Codex P1 fixes.** `..` backslash-form path-traversal rejection in
`validateProposalPath`.

---

## PR-ASM-3 — Session persistence + indicators (#346)

**Scope.** `resolveSessionLogPath` (deterministic per-feature),
`SessionLogWriter` with `appendUserAssistant` (fire-and-forget,
REQ-ASM-040) and `appendProposalDecision` (load-bearing,
REQ-ASM-046), `--resume <sessionId>` argv wiring + `onSessionId`
capture callback on the free-text path, `useChatStore` extensions for
`chatThreads` + `captureSessionId` + `proposals`, plugin-data
hydration for `chatThreads`, `SessionResumeIndicator` and
`SubprocessStartingPill` components, and the `ChatSidebar`
session-persistence wiring.

**REQ-ASM IDs closed:** REQ-ASM-027 (session-log file path scheme),
REQ-ASM-028 (per-feature session log), REQ-ASM-029 (NDJSON line-by-line
parser), REQ-ASM-030 (subprocess exit-code error mapping), REQ-ASM-031
(session id capture across both paths), REQ-ASM-032 (`--resume` argv
forwarded verbatim), REQ-ASM-033 (resumed-turn user-side suppression
in the log), REQ-ASM-034 (session id hot-restore on plugin reload),
REQ-ASM-035 (resumeSessionId forwarded via argv only — never env),
REQ-ASM-036 (no `fs` reads outside the vault), REQ-ASM-037
(session-log writer queueing model), REQ-ASM-038 (append-only writer
contract), REQ-ASM-039 (writer uses VaultPort exclusively), REQ-ASM-040
(fire-and-forget user-assistant turn mirror), REQ-ASM-046 (audit row
load-bearing on Accept).

**Codex P1 fixes.** `onunload()` now synchronously flushes the pending
chatThreads snapshot. `.sr-only` root-cause fix moved into AppRoot.vue
to survive `build:web`.

---

## PR-ASM-4 — FileWriteProposal flow (#347)

**Scope.** `ConfirmModalPort` + injection key, Obsidian + Mock confirm
modal adapters, `proposeFileWrite` (read-only existence/preview),
`commitFileWriteProposal` (the sole vault-mutation path for an LLM
proposal — NFR-ASM-011), `rejectFileWriteProposal`,
`FileWriteProposalCard.vue` (five mutually-exclusive render states),
`TransportStatusPill.vue`, ChatSidebar proposal-flow wiring with the
shared `inFlightDecisions` concurrency guard, i18n keys for every
proposal-flow surface, and `SpecoratorView` provision of
`CONFIRM_MODAL_PORT` + `TRANSPORT_KIND_KEY`.

**REQ-ASM IDs closed:** REQ-ASM-041 (proposal aggregate DTO),
REQ-ASM-042 (proposal lifecycle states), REQ-ASM-043 (Accept writes
exactly one file via VaultPort), REQ-ASM-044 (overwrite gate via
ConfirmModalPort), REQ-ASM-045 (Reject never mutates the vault),
REQ-ASM-046 (audit row mirrored to session log on every terminal
state), REQ-ASM-047 (folder creation derived from envelope path),
REQ-ASM-048 (path-invalid card state), REQ-ASM-049 (capability check
re-used at the structured call site), REQ-ASM-050 (Retry resubmits
the proposal-specific `originPrompt`).

**Codex feedback fixes.**
- P1: SessionLogWriter rethrows on failure; new `SessionLogNoSessionError`
  for missing session id; commit pipeline now surfaces `SESSION_LOG_FAILED`
  reliably.
- P1: structured branch now captures `session_id` via the `onSessionId`
  callback so `thread.sessionId !== null` before `appendProposalDecision`
  runs.
- P1: re-entrant Accept guard via module-scoped `inFlightDecisions: Set<string>`,
  shared with Reject so a cross-decision race produces exactly one terminal.
- P1: Reject blocked while Accept is in flight on the same proposal.
- P1: derive parent folder from `envelope.path` so REQ-ASM-047 is actually
  reachable for the strict structured schema; normalise `\` to `/` in the
  derivation.
- P2 cluster: every terminal-failure exit (`fileExists` reject, `createFolder`
  reject, `writeFile` reject) now mirrors a `decision: 'failed'` audit row;
  `inFlightDecisions` released via `Promise.finally` even on throw;
  `responseState` reorders so actionable pending proposals take precedence
  over `error`/`timeout`/`structuredFail` banners (with path-invalid
  proposals excluded since they have no Accept/Reject controls); structured
  proposal turns forward `buildPrompt`'s `truncated` flag instead of
  hardcoding `false`; subscription-transport degraded state shows
  CLI-install guidance instead of the API-key copy; `confirmModal` is
  optional in `CommitFileWriteDeps` (overwrite-gate only) so Accept on
  fresh paths succeeds without the port; `STRUCTURED_OUTPUT_GUARD_SUFFIX`
  appended in `queryStructured` so every structured call inherits the
  JSON-only instruction.

---

## PR-ASM-5 — ESLint rule + integration tests + release polish

**Scope.** Custom ESLint rule `local/no-claude-home-reads` (wired into
`eslint.config.js` and validated by `npm run lint:rules`), the runtime
no-`~/.claude/`-fs-reads integration test, the static grep audit
(`.credentials.json`, `~/.claude/`, `CLAUDE_CODE_OAUTH_TOKEN`), the
`ClaudeSubprocessAdapter` completion-telemetry shape test (with the
matching emission added in the adapter), the CCS-inheritance audit, and
the final pre-PR gate sweep against the SPEC §13.4 release-blockers
checklist.

**REQ-ASM IDs closed:** REQ-ASM-007 (now lint-enforced by the new rule),
REQ-ASM-036 (now also runtime-enforced via `tests/integration/no-claude-home.test.ts`),
REQ-ASM-051 (auto-context populated under subscription transport),
REQ-ASM-052 (auto-context cleared on `setActiveFile(null)`),
REQ-ASM-053 (file-menu action uses the same store action).

**Cross-references — ADRs that govern this scope.**
- ADR-0027 — Subscription-via-CLI architecture (read by PR-ASM-1).
- ADR-0028 — Stage-prompt assembly + structured envelope schema (PR-ASM-2).
- ADR-0029 — Session-log file scheme + load-bearing audit row (PR-ASM-3).
- ADR-0030 — Trust-first vault-mutation invariant (PR-ASM-4).
- ADR-0031 — `~/.claude/` never read (NFR-ASM-004); enforced by
  `local/no-claude-home-reads` + the static grep audit (PR-ASM-5).
- ADR-0032 — Telemetry-shape contract (NFR-ASM-005, NFR-ASM-012);
  verified by `ClaudeSubprocessAdapter.telemetry.test.ts` (PR-ASM-5).

**Release-blockers checklist (§13.4) — verified in this PR.**
1. `'--bare'` never appears in argv (TEST-ASM-006). ✅
2. Vault writes only from `commitFileWriteProposal` (TEST-ASM-047 + grep). ✅
3. `STRUCTURED_PARSE_FAILED` never surfaces raw output (TEST-ASM-029, TEST-ASM-082). ✅
4. Session-log writes are fire-and-forget on the critical path; only
   `appendProposalDecision` is awaited. ✅
5. Forbidden i18n terms absent (T-ASM-074 forbidden-terms test). ✅
