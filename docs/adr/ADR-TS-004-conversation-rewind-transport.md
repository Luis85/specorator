---
id: ADR-TS-004
title: Gate conversation-rewind execution off the subprocess CLI transport; true rewind-to-turn is an Agent-SDK-transport capability deferred to a later phase
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
accepted: 2026-05-25    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - reviewer
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, runtime, transport, rewind, threads-sessions, claudian-reboot, P3]
---

# ADR-TS-004 — Conversation-rewind transport: gate rewind-to-turn off the subprocess CLI

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves review finding **R-TS-002** (the only
remaining P1 blocker in `REVIEW-TS-001`). Amends the realised behaviour of **REQ-TS-021** and the
Claude-CLI `getCapabilities()` contract (SPEC-TS-003/009). Refines, does not supersede, **ADR-TS-002
§3** (which decided the *port shape* `setResumeCheckpoint`; this ADR decides what the **subprocess
transport** does with it).

## Context

P3 ships conversation-only rewind (REQ-TS-021): the user rewinds a tab to an earlier user message and
the next turn is supposed to continue *from that earlier point* rather than from the latest session
state. The reviewer (`REVIEW-TS-001`, R-TS-002) found this is a **silent no-op on the real
`claude`-CLI path** — the R-RR-001 failure class (unit-green via Mock/Fixture, dead on the production
transport):

- `ClaudeCliChatRuntime.setResumeCheckpoint(assistantMessageId)` stores `this.resumeCheckpoint`
  (`src/infrastructure/obsidian/ClaudeCliChatRuntime.ts:169-173`);
- `query()` only **logs and clears** it (`:80-85`);
- `_buildArgs` emits **only** `--resume <sessionId>` (`:193-206`) — the checkpoint never reaches the CLI.

So the UI truncates the displayed transcript (`tabsStore.truncateTo`) and it *looks* rewound, but the
model continues from where the session actually left off. The spec's SPEC-TS-009 claim that the
Claude-CLI `setResumeCheckpoint` "maps to the CLI session/resume seam" was never realised — the
implementation log itself flagged it as a manual-leg-only, unproven seam.

### Parity truth — how Claudian rewinds (read-only reference, `D:\Projects\claudian-main`)

Claudian's rewind-to-turn is an **Agent-SDK** capability:

1. `ClaudeRewindService.executeClaudeRewind` `mode === 'conversation'` (`ClaudeRewindService.ts:172-176`)
   calls `setPendingResumeAt(assistantMessageId)` then `closePersistentQuery('conversation rewind')`.
2. On the next turn, `ClaudeChatRuntime` reads `this.pendingResumeAt` (`ClaudeChatRuntime.ts:500`) and
   threads it into the SDK query options as `resume.sessionAt` (`:501-507`).
3. `QueryOptionsBuilder.buildPersistentQueryOptions` sets the **SDK `Options` field**
   `options.resumeSessionAt = ctx.resume.sessionAt` (`ClaudeQueryOptionsBuilder.ts:162-166`), alongside
   `options.resume = sessionId` and (for fork) `options.forkSession = true`.
4. The query runs via `agentQuery({ prompt: this.messageChannel, options })` (`ClaudeChatRuntime.ts:509`)
   — i.e. the **Agent SDK driving a persistent, bidirectional `MessageChannel`** session
   (`--input-format stream-json`), **not** a one-shot `--print` spawn.

The SDK `Options.resumeSessionAt` is documented (`@anthropic-ai/claude-agent-sdk` `sdk.d.ts:1569-1574`)
as: *"When resuming, only resume messages up to and including the message with this UUID. Use with
`resume`. … The message ID should be from `SDKAssistantMessage.uuid`."* It is a **resume-shaping option
on the SDK's interactive resume path**.

### Does the raw `claude --print` CLI our P1 runtime uses expose an equivalent?

Our P1 runtime (`ClaudeCliChatRuntime`, ADR-CC-001 / ADR-014) is deliberately **not** the SDK: it
spawns the raw `claude` binary in one-shot `--print --output-format stream-json --verbose` mode, pipes
a single prompt to stdin, closes stdin, and reads stdout to EOF. `--resume <sessionId>` resumes the
*whole* persisted session; there is no per-turn persistent channel.

Evidence that rewind-to-turn is an SDK-transport capability, not a faithful raw-`--print` one:

- **The SDK doc-comments name a CLI-flag equivalent for the options that have one** ("Equivalent to the
  `--agent` CLI flag", "`--settings`", "`--debug`", "`--debug-file`"). `resumeSessionAt` carries **no**
  such equivalence note — it is described only as a resume-shaping option used *with* the SDK resume
  path.
- **Claudian itself never feeds a resume-at to a raw CLI.** Its only resume-at path is the SDK
  (`agentQuery` → `options.resumeSessionAt`); its cold-start path (`buildColdStartQueryOptions`) sets
  only `options.resume`, never `resumeSessionAt`. There is no `customSpawn`/`--print` rewind-at code in
  Claudian to mirror.
- **Even if a `--resume-session-at`-style flag string exists in the binary, our transport cannot honour
  it honestly.** The SDK's resume-at relies on its persistent session and on the message UUID being one
  the CLI itself wrote to the session's JSONL transcript. On a conversation **resumed from our vault
  history**, the `assistantMessageId` we hold is the envelope `uuid` we observed and persisted in our
  own `ConversationRecord`; we cannot guarantee it equals the CLI's internal transcript UUID for that
  session on the coverage-excluded path. A flag we cannot feed a guaranteed-valid value to is not a
  faithful seam — it is a different shape of silent no-op.

**Conclusion:** rewind-to-turn (`resumeSessionAt`) is a capability of the **Agent-SDK transport**
(persistent interactive session), **not** of the one-shot `--print` subprocess transport our P1 runtime
uses. This is review-brief **Option (B)** — a genuine transport limitation of the P1 subprocess
runtime — not Option (A).

### Why not Option (b2) — "truncate + re-send the kept transcript as a fresh continuation"?

b2 would redefine REQ-TS-021 on the CLI as: truncate the tab, then re-send the kept context to the
model on the next turn. This is **not faithful and not feasible without distortion**:

- It is **not how Claudian rewinds** — Claudian resumes the *same* session at an earlier point; it does
  not start a fresh continuation that re-sends history.
- Our `ClaudeCliChatRuntime.query()` **ignores** its `_conversationHistory` parameter (it pipes only
  `turn.prompt`); honouring it would be new behaviour, not a wiring fix.
- Re-sending the kept transcript **on top of** `--resume <sessionId>` (the session the CLI still holds
  in full) **double-counts context** — the resumed session already contains the later turns we are
  pretending to drop. We would either have to abandon `--resume` (losing all session continuity) or
  duplicate context (corrupting the model's view). Both are worse than honestly gating the affordance.

So b2 is rejected: it would be a fake dressed as a behaviour. The honest choice is **(b1)**.

## Decision

**We gate conversation-rewind execution OFF on the Claude subprocess-CLI transport.** Specifically:

1. **`ClaudeCliChatRuntime.getCapabilities()` returns `supportsRewind: false`** (it keeps
   `supportsFork: true`). Because the rewind hover affordance is capability-gated (REQ-TS-019, gated on
   `getCapabilities().supportsRewind`, SPEC-TS-025), the rewind control **does not render** on the
   Claude-CLI path — the surface makes no promise the transport cannot keep.

2. **`setResumeCheckpoint` stays on the port (ADR-TS-002 §3 unchanged) but is documented on the CLI
   runtime as a no-op-by-transport.** It remains a recorded no-op on `MockChatRuntime` /
   `FixtureChatRuntime` (so the *eligibility/menu/truncate* logic stays unit-testable and the SDK-runtime
   future has a wired seam), and on `ClaudeCliChatRuntime` it must NOT pretend to checkpoint: it either
   does nothing or, preferably, is unreachable because `supportsRewind` gates the UI off. The
   stored-then-discarded `resumeCheckpoint` field and its misleading `debug`-log/clear in `query()` are
   removed (the dev follow-up) so no reader believes a checkpoint is applied.

3. **True rewind-to-turn is deferred to the Agent-SDK transport phase.** When a later phase introduces
   an SDK-backed `ChatRuntimePort` implementation (persistent `MessageChannel`, `options.resume` +
   `options.resumeSessionAt`), that implementation reports `supportsRewind: true` and wires
   `setResumeCheckpoint` → `resumeSessionAt` exactly as Claudian does. The UI affordance then renders
   automatically for that runtime — **no UI change needed**, because the gate is capability-driven, not
   provider-branched (REQ-TS-026).

4. **Conversation-only rewind remains fully functional on the Mock/Fixture runtimes** (which model the
   eventual SDK capability), so `npm run dev`, the GitHub Pages demo, and the unit suite continue to
   exercise the truncate + checkpoint flow end-to-end. Only the *production Claude-CLI* path gates it off.

This mirrors how the epic already handled an analogous transport-honesty case (R-RR-008 / the
code-and-conversation rewind dual mechanism, and REQ-TS-022 / NG7): the affordance exists where the
transport can keep it, and is explicitly gated where it cannot — documented, not silent.

## Considered options

### Option A — Wire `setResumeCheckpoint` → a CLI resume-at flag in `_buildArgs`
- Pros: would be the smallest change *if* the flag existed and were faithful.
- Cons: the `--print` one-shot transport is not the SDK's persistent resume-at path; we cannot
  guarantee the message UUID we hold matches the CLI's transcript UUID on the resumed-from-history path;
  no Claudian precedent feeds resume-at to a raw CLI. Would be a second silent no-op (or worse, a
  wrong-point resume). **Rejected** — the capability is SDK-transport, not raw-`--print`.

### Option B1 — Gate rewind off on the CLI transport (`supportsRewind: false`); defer true rewind to the SDK runtime *(chosen)*
- Pros: honest (no dead path, no false UI promise); capability-gated so the affordance auto-enables on a
  future SDK runtime with zero UI/branch change (REQ-TS-026); keeps the full rewind flow live on
  Mock/Fixture; mirrors the already-accepted gated-affordance pattern (REQ-TS-022/NG7); smallest honest
  surface area. Cons: the user gets no rewind on the Claude-CLI path in P3 — a real capability gap, but
  a *declared* one, not a broken feature.

### Option B2 — Redefine REQ-TS-021 on the CLI as "truncate + re-send kept transcript as a fresh continuation"
- Pros: would let the affordance render on the CLI path.
- Cons: not how Claudian rewinds; our runtime ignores `_conversationHistory`; re-sending on top of
  `--resume` double-counts context, and dropping `--resume` loses session continuity. A fake behaviour.
  **Rejected.**

### Option C — Switch the whole P3 rewind seam to the Agent SDK now
- Pros: full parity rewind in P3.
- Cons: replacing the subprocess transport with the Agent SDK is a large, cross-cutting transport change
  (new dependency, new spawn/lifecycle model, re-proving ADR-CC-001's streaming/error-as-chunk and
  cancel contracts) well beyond a P3 rewind fix. The SDK transport is its own future ADR. **Rejected for
  P3.**

## Consequences

### Positive
- No silent dead path: the Claude-CLI rewind affordance is gated off (`supportsRewind: false`) rather
  than rendering a control that does nothing real (resolves R-TS-002).
- The truncate/eligibility/menu logic and the `setResumeCheckpoint` port seam stay intact and
  unit-tested on Mock/Fixture — the SDK-runtime future plugs in with no UI or application change
  (capability-gated, REQ-TS-026; additive, REQ-TS-028).
- The decision is faithful to the parity reference (Claudian rewinds via the SDK) and to the
  constitution (Article I: a physically-unachievable requirement is resolved at the spec/ADR layer, not
  papered over in code).

### Negative
- Conversation-only rewind is **not available to end users on the production Claude-CLI path in P3** —
  a genuine, declared capability gap until the SDK-transport runtime lands.
- REQ-TS-021's acceptance ("the runtime's resume checkpoint is set at M3 for the next turn") holds only
  on a `supportsRewind: true` runtime; on the Claude-CLI runtime the precondition (the affordance
  renders) is false, so the requirement is **satisfied-by-gating** there. The requirement text is
  amended accordingly (requirements delta).

### Neutral
- Fork is unaffected: `supportsFork: true` stays on the CLI runtime; fork derives lineage via
  `ProviderHistoryPort.buildForkPlan` + `--resume <forkSource.sessionId>` (ADR-TS-001 §1, R-TS-003 fix)
  — it does not need resume-at.
- The eventual SDK-transport runtime is a future ADR (not opened here); this ADR only declares the seam
  and the capability gate that future runtime will satisfy.

## Compliance

- A test asserts `ClaudeCliChatRuntime.getCapabilities().supportsRewind === false` (and
  `supportsFork === true`).
- A test asserts the rewind hover affordance does **not** render when `getCapabilities().supportsRewind`
  is false (capability gate, SPEC-TS-025), and **does** render on a `supportsRewind: true` runtime
  (Mock).
- A code check confirms `ClaudeCliChatRuntime` no longer carries a stored-then-discarded
  `resumeCheckpoint` that `query()` logs-and-clears (no misleading "checkpoint applied" debug log).
- The capability gate stays provider-addressed: no `if (provider === 'claude')` branch is introduced to
  toggle rewind (REQ-TS-026) — the gate reads `getCapabilities()` only.
- The Mock/Fixture runtimes keep `supportsRewind: true` and the conversation-rewind truncate +
  `setResumeCheckpoint` flow stays green in the unit suite and `npm run dev`.

## References

- `REVIEW-TS-001` (`specs/threads-sessions/review.md`) — finding **R-TS-002** (the resolved blocker).
- PRD-TS-001 (`specs/threads-sessions/requirements.md`) — **REQ-TS-019/020/021/022** (rewind),
  REQ-TS-026 (provider-addressed gate), REQ-TS-028 (additive); NFR-TS-013 (no message content logged).
- `specs/threads-sessions/spec.md` — SPEC-TS-003 (`getCapabilities`/`setResumeCheckpoint`),
  SPEC-TS-009 (Claude-CLI runtime), SPEC-TS-014 (`RewindConversationUseCase`), SPEC-TS-018
  (`rewindEligibility`), SPEC-TS-025 (capability-gated affordance).
- `specs/threads-sessions/design.md` Part C — C.4 #4 (rewind flow), C.5 (three-bridge runtime cell).
- ADR-TS-002 §3 (the additive `setResumeCheckpoint`/`getCapabilities` port shape this ADR's transport
  decision sits behind), ADR-CC-001 (`ChatRuntime` subprocess shape, error-as-chunk), ADR-014 (Claude
  CLI as a narrow port).
- Claudian reference (read-only, MIT): `providers/claude/runtime/ClaudeRewindService.ts:168-220`
  (`executeClaudeRewind` conversation mode → `setPendingResumeAt` + `closePersistentQuery`),
  `providers/claude/runtime/ClaudeChatRuntime.ts:500-512` (`pendingResumeAt` → SDK options →
  `agentQuery`), `providers/claude/runtime/ClaudeQueryOptionsBuilder.ts:162-170`
  (`options.resumeSessionAt = ctx.resume.sessionAt`), `providers/claude/runtime/customSpawn.ts` (the
  SDK's spawn path — no raw resume-at flag), `@anthropic-ai/claude-agent-sdk` `sdk.d.ts:1560-1574`
  (`Options.resume` / `Options.resumeSessionAt` docs).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
