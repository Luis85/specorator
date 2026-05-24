---
feature: chat-core
area: CC
current_stage: design
status: active
last_updated: 2026-05-24
last_agent: architect (design)
epic: claudian-reboot
phase: P1
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (orchestrator bootstrapped P1 from charter + audits)
  research.md: skipped (charter §3 + frontend/backend audits serve as research)
  requirements.md: accepted (PRD-CC-001 — Claudian-grounded; ADR-CC-001 human-blessed 2026-05-24)
  design.md: complete (Parts A/B/C; ADR-CC-001 ACCEPTED — human-blessed 2026-05-24, charter §6a)
  spec.md: pending (unblocked — ADR-CC-001 accepted; next: /spec:specify)
  tasks.md: pending
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — chat-core (P1)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped (charter + audits stand in) |
| 2. Research | `research.md` | skipped (frontend/backend audits stand in) |
| 3. Requirements | `requirements.md` | in-progress (PRD-CC-001 revised to Claudian ground-truth; CLAR-CC-001 ADR drafted, awaiting human bless) |
| 4. Design | `design.md` | complete (Parts A/B/C; ADR-CC-001 proposed — CHECKPOINT) |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P1 (chat core)

P0 (plugin-shell-reboot) merged to `next` (#432). P1 is the first vertical chat
slice on the gutted shell. Scope (charter §4, P1 row): provider-agnostic
`ChatRuntime` port + Claude provider (CLI) + single-thread chat + streaming +
basic message render + minimal toolbar (send). Surfaces: core/runtime,
providers/claude, messages.css, input.css, container, variables, header.

Mandatory inputs (charter §6 + READ FIRST): `specs/claudian-reboot/parity-charter.md`
(§3 inventory, §4 phase map, §5 parity acceptance), the per-surface audits
`specs/claudian-reboot/claudian-audit-{frontend,backend}.md`, and `D:\Projects\claudian-main`
as the visual/parity truth. Reuse the discarded AUX/MPS chat design + `--sp-*` tokens
(on `develop`/history) as reference, not copy.

## Open clarifications — charter §6 decisions to bless BEFORE design/impl

- [~] CLAR-CC-001 — **`ChatRuntime` port shape. RESOLVED-IN-DESIGN (architect, 2026-05-24) —
  ADR-CC-001 DRAFTED (status: proposed). PENDING HUMAN BLESS (charter §6a checkpoint).**
  `docs/adr/ADR-CC-001-chatruntime-port-shape.md` blesses the overall shape: async-generator
  `query(turn, history?, opts?): AsyncGenerator<StreamChunk>` (no `Result`; streaming error is
  the `{type:'error';content}` union member, not a per-chunk `Result`) + the callback-setter
  extension pattern as the runtime grows per phase, mirroring `ChatRuntime.ts:20`. P1 surface =
  the streaming + lifecycle subset (REQ-CC-002a): `providerId`, `prepareTurn`, `ensureReady`,
  `query`, `cancel`, `getSessionId`, `resetSession`, `onReadyStateChange`, `isReady`. Callback
  setters (`ChatRuntime.ts:48-54`) / `rewind` / `steer` / subagent DEFERRED P2–P4/P9. The ADR
  weighed 3 alternatives (per-chunk Result; observable/listener `query`; chat-on-a-core-port) and
  rejected each. **The ADR is NOT accepted — a human must sign it off before `/spec:specify`.**
- [x] CLAR-CC-002 — **Secrets surface (SecretStorePort + `app.secretStorage`).**
  **RESOLVED for P1 (pm, 2026-05-24).** `app.secretStorage` verified present at
  `minAppVersion 1.12.7` (`obsidian.d.ts:458`) — no manifest bump, no NG6 escalation.
  P1's Claude CLI path uses the user's own `claude` login and stores **no secret**;
  `SecretStorePort` + its ADR **defer** to the first API-key transport (later phase).
  Encoded as NFR-CC-006 + NG10 in PRD-CC-001.
- [x] CLAR-CC-003 — **Provider/runtime scope for P1.** **RESOLVED (human-confirmed,
  2026-05-24).** P1 = Claude CLI single provider, single thread (threads = P3), no
  rich rendering (P2), no composer power (P4), no toolbar widgets (P6), no approvals
  (P7), no MCP (P8), no Codex/Opencode (P9). Encoded as Non-goals NG1–NG9 in PRD-CC-001.
- [x] CLAR-CC-004 *(design-time)* — **Welcome-state serif identity & microcopy.
  RESOLVED-IN-DESIGN (architect, Part A §A.6, 2026-05-24).** (1) Keep a **token-driven serif
  greeting** — `--sp-font-serif` already exists in `tokens.css:79` (AUX reuse); 28px/300/muted;
  perceptual parity (Georgia/serif fallback, not literal Copernicus). (2) **Neutralise microcopy
  under Specorator identity** — greeting is an i18n key (`agent.chat.welcome.greeting`), brand-
  neutral, no Claudian name/logo; final wording is a brand-reviewer call at review. (3) **Drop
  the "Baked for mm:ss" duration footer entirely from P1** (P2-adjacent; REQ-CC-011 needs only
  the empty/welcome state). No P1 component emits it.
- [x] CLAR-CC-005 *(design-time)* — **Minimal-markdown render seam.
  RESOLVED-IN-DESIGN (architect, Part B §B.4, 2026-05-24).** Ship a **minimal safe inline
  renderer behind a thin one-method `MarkdownRenderPort` seam in P1** (paragraphs / inline code /
  line breaks → structured nodes, rendered declaratively, no `v-html`/`innerHTML`); **defer the
  Obsidian `MarkdownRenderer.render` backing to P2** (re-back the same port, no shape change).
  Reason: REQ-CC-004 re-renders on every accumulated `text` chunk — Obsidian's heavy async
  renderer is overkill per chunk for three constructs; the cheap seam prevents a P2 churn. Both
  satisfy NFR-CC-008.

## Hand-off notes

```
2026-05-24 (orchestrator): P1 bootstrapped on feature/chat-core (off next, P0
                          merged via #432). workflow-state scaffolded. CHECKPOINT
                          pending with the human on the two charter §6 ADR
                          decisions (CLAR-CC-001 ChatRuntime port shape; CLAR-CC-002
                          SecretStorePort + app.secretStorage @ 1.12.7 verification)
                          before requirements/design. Next: /spec:idea (analyst)
                          reading the charter §3/§4/§5 + the frontend/backend audits
                          + claudian-main; then /spec:research → requirements → design
                          (A/B/C, file the P1 ADRs, add the audit-named ports).

2026-05-24 (pm, requirements): PRD-CC-001 drafted (specs/chat-core/requirements.md).
                          idea/research skipped — charter §3 + the frontend/backend
                          audits stand in (recorded in artifacts table). 15 functional
                          REQ-CC-001..015 (13 must, 2 should: CC-010 abort, CC-011 empty
                          state), all EARS + Given/When/Then, each mapped to a claudian-main
                          path + a testable acceptance for 1:1 test mapping. 14 NFR-CC-001..014
                          (DDD/ports, WCAG 2.2 AA, Result, <script setup>/no-v-html/no-confirm,
                          coverage 80/70/80/80, NO-SECRET, manifest-unchanged, no-migration,
                          SHA-pinned CI, and charter §5 parity: screenshots @ 320/520/720
                          light+dark + perceptual/token/interaction parity). Counter-metric =
                          scope leakage vs the NG list.

                          CLAR resolution: CLAR-CC-002 (secret-vacuous) + CLAR-CC-003 (P1
                          scope) RESOLVED. CLAR-CC-001 (ChatRuntime port shape) STILL OPEN —
                          blocks design proper; PM scoped the P1-minimal port surface, architect
                          to bless via ADR. Two new design-time CLARs opened: CLAR-CC-004
                          (welcome serif/microcopy → designer) and CLAR-CC-005 (markdown render
                          seam: MarkdownRenderPort now vs P2 → architect). requirements.md held
                          at status:draft until CLAR-CC-001 ADR is accepted, then → accepted.

                          HAND-OFF → design (/spec:design). Architect Part A/B/C:
                          (A) UX — reproduce the message-stream + send-composer + empty/loading/
                              streaming/error states (frontend audit §3.1 "Message stream" +
                              §3.3 "Composer core"); resolve CLAR-CC-004.
                          (B) UI — `--sp-*` token slice for messages.css + input.css + container/
                              variables/header (charter §4 P1 surfaces); perceptual parity, no
                              hardcoded hex; capture parity-screenshots.md (NFR-CC-011/012/013).
                          (C) ADRs/ports — FILE THE ChatRuntimePort SHAPE ADR (CLAR-CC-001,
                              charter §6a) and declare the audit-named ports per the backend
                              audit "Recommended new narrow ports": ChatRuntimePort (P1, Claude),
                              ProviderRegistryPort (seam stubbed P1), and the StreamChunk union
                              type. Resolve CLAR-CC-005 (MarkdownRenderPort timing). Keep the
                              ProviderHistory/HomeFs/Mcp*/Secret ports OUT of P1.

                          Recommended next command: /spec:clarify (close CLAR-CC-001 with the
                          architect's port-shape ADR) → then /spec:design.

2026-05-24 (pm, requirements REVISED to Claudian ground-truth): human said "look
                          carefully how Claudian solved this and adjust accordingly." The prior
                          draft invented a "text-delta / final / error" StreamChunk shape that
                          does NOT exist in claudian-main. Revised requirements.md to mirror the
                          REAL solution, citing exact claudian-main paths:
                          - Streaming contract = `query(turn, history?, opts?):
                            AsyncGenerator<StreamChunk>` (ChatRuntime.ts:33). NO text-delta,
                            NO final chunk. `done` is the terminator.
                          - `StreamChunk` = ONE normalized discriminated union (chat.ts:137);
                            P1 emits the SUBSET `{ assistant_message_start?, text, error, done,
                            usage }`, declared to mirror Claudian member names/shapes so P2+
                            (thinking/tool_use/tool_result/tool_output/context_compacted/subagent)
                            add members + handlers without redesign. (REQ-CC-001a)
                          - Assembly = StreamController.handleStreamChunk (StreamController.ts:116):
                            `text` → `msg.content += chunk.content` + incremental render;
                            `done` finalises (StreamController.ts:200); `error` rendered inline
                            (StreamController.ts:194); `usage` updates context (StreamController.ts:217).
                          - Port surface = streaming + lifecycle subset of ChatRuntime.ts:20
                            (providerId/prepareTurn/ensureReady/query/cancel/getSessionId/
                            resetSession/onReadyStateChange/isReady); callback setters
                            (ChatRuntime.ts:48–54) + rewind/steer/subagent DEFERRED P2–P4.
                            (REQ-CC-002a)
                          - Provider = Claude CLI subprocess runtime adapting stream-json/NDJSON
                            into the union (ProviderRegistration.createRuntime providers/types.ts:63
                            + deleted P0 ClaudeSubprocessAdapter/StreamDeltaReducer). Full
                            ProviderRegistration (capabilities/chatUIConfig/reconcilers/history)
                            is P9 registry scope; ProviderRegistryPort kept only if free.
                          - ChatMessage = chat.ts:39; P1 fields id/role/content/timestamp
                            (+ optional durationSeconds?/displayContent?); contentBlocks/toolCalls/
                            images EXCLUDED from P1 (regrow P2+). Single ChatMessage[] (no
                            Conversation/threads — P3).
                          Changed REQ items: REQ-CC-001 (rewritten: async-generator query, done
                          terminator), NEW REQ-CC-001a (StreamChunk union mirrors Claudian, P1
                          subset), NEW REQ-CC-002a (port surface subset), REQ-CC-003 (prepareTurn
                          + query dispatch), REQ-CC-004 (text-accumulate, not delta-reducer),
                          REQ-CC-005 (done finalises; no "final" chunk), NEW REQ-CC-005a (usage
                          seam, should), REQ-CC-006 (ChatMessage P1 field subset), REQ-CC-009
                          (isReady/onReadyStateChange paths), REQ-CC-010 (cancel() path),
                          REQ-CC-012 (error chunk inline render), REQ-CC-013 (CLI subprocess
                          adapter), REQ-CC-014 (AsyncGenerator<StreamChunk> bridges). CLAR-CC-001
                          note updated to bless the async-generator query + deferred callback-
                          setter shape; CLAR-CC-005 framing re-confirmed (render seam re-renders
                          on each accumulated text chunk). NFR-CC-003 reworded (error as union
                          member, not per-chunk Result). NG6 updated (registry defers to P9).
                          NO invented member names remain. status held at draft pending CLAR-CC-001
                          ADR.

                          HAND-OFF → architect design (/spec:design). Part C files: (1) the
                          ChatRuntimePort ADR mirroring ChatRuntime.ts:20 (CLAR-CC-001), (2) the
                          StreamChunk union type mirroring chat.ts:137 (P1 subset; additive
                          members documented for P2+), (3) the Claude-CLI subprocess runtime
                          adapter (stream-json/NDJSON → StreamChunk). Part A/B unchanged.

2026-05-24 (architect, design): design.md COMPLETE (Parts A/B/C) at specs/chat-core/design.md.
                          - Part A (UX): one flow (send → stream text → done); IA = scroll region
                            over bottom composer; the five states (empty/idle/streaming/error/
                            interrupt) with a state diagram; asymmetric user-bubble / transparent-
                            full-width-assistant parity; Enter/Shift+Enter/Esc + IME composer
                            contract; a11y (live region, reduced-motion, focus). Resolved CLAR-CC-004
                            (keep token-driven serif greeting; brand-neutral i18n microcopy; DROP
                            the duration footer from P1).
                          - Part B (UI): full Claudian-CSS → --sp-* token map for messages.css +
                            input.css + container/variables/header; the --sp-* layer SURVIVED P0
                            (AUX reuse) and already carries --sp-radius-bubble-tail-*, --sp-font-
                            serif, --sp-error, --sp-compact; only 8 new P1 surface tokens needed
                            (--sp-msg-gap, --sp-scrollbar-width, --sp-msg-user-bg, --sp-msg-user-
                            max-width, --sp-interrupt, --sp-input-min-h, --sp-textarea-min/max-h),
                            color literals confined to the token layer (no component hex). Parity-
                            screenshot plan stated (320/520/720 light+dark × 5 states → parity-
                            screenshots.md, human-run at review; pair with a baseline-capture task).
                            Resolved CLAR-CC-005 (minimal safe renderer + MarkdownRenderPort seam
                            now; Obsidian backing P2).
                          - Part C (Architecture): DDD placement — domain: ChatRuntimePort +
                            MarkdownRenderPort + StreamChunk union/ChatMessage/turn types + Result;
                            application: RunChatTurnUseCase turn orchestrator + safe markdown
                            transform; infrastructure: ClaudeCliChatRuntime (spawns claude CLI,
                            adapts stream-json/NDJSON; no stored secret) behind the port via a per-
                            bridge createChatRuntime() FACTORY + Mock/Fixture runtimes (3-bridge
                            story); ui: ChatSurface/MessageList/MessageTurn/MarkdownBlock/
                            WelcomeGreeting/ChatComposer + Pinia single-thread chatStore (DTOs) +
                            useChatRuntimePort(). DRAFTED docs/adr/ADR-CC-001-chatruntime-port-
                            shape.md (status: PROPOSED) + README index row. 16 edge cases + a 17-
                            scenario QA seam + observability + Result/streaming-error boundary
                            (NFR-CC-003: error = StreamChunk member, not per-chunk Result).
                          DECLARED P1 ports: ChatRuntimePort (Claude backing), StreamChunk union
                            (type), MarkdownRenderPort (minimal backing). DEFERRED: ProviderRegistry
                            Port → P9 (single provider, no capabilities needed, NG6 "only if free"
                            — it isn't free, so defer); ProviderHistory/HomeFs/Mcp*/Secret/Approval
                            ports OUT of P1.

                          >>> CHECKPOINT REQUIRED <<< A HUMAN MUST BLESS ADR-CC-001
                          (docs/adr/ADR-CC-001-chatruntime-port-shape.md, status: proposed) before
                          /spec:specify (charter §6a, CLAR-CC-001). The ADR blesses the async-
                          generator query + the deferred callback-setter extension pattern that
                          bends ADR-008's method-only style; weighed + rejected 3 alternatives.
                          Recommended: run /spec:clarify or /adr:new review to record the human
                          acceptance, flip ADR-CC-001 status → accepted, flip requirements.md
                          status → accepted, THEN /spec:specify (architect owns spec.md). spec.md
                          is BLOCKED until the bless. No production code, no tasks written here.

                          HAND-OFF → planner (Tasks) AFTER the bless: add a baseline-capture task
                          (NFR-CC-011, capture claudian-main P1 baseline before impl), the 8 new
                          --sp-* token additions, and note the open question for the spec: edge
                          case #5 (done with zero text chunks — recommend finalise-empty).
```
