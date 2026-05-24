---
feature: chat-core
area: CC
current_stage: tasks
status: active
last_updated: 2026-05-24
last_agent: dev (implement — UI + wire-in batch)
epic: claudian-reboot
phase: P1
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (orchestrator bootstrapped P1 from charter + audits)
  research.md: skipped (charter §3 + frontend/backend audits serve as research)
  requirements.md: accepted (PRD-CC-001 — Claudian-grounded; ADR-CC-001 human-blessed 2026-05-24)
  design.md: complete (Parts A/B/C; ADR-CC-001 ACCEPTED — human-blessed 2026-05-24, charter §6a)
  spec.md: complete (SPEC-CC-001..023; 23 spec items + 17 TEST-CC scenarios)
  tasks.md: complete (TASKS-CC-001 — 32 T-CC tasks, TDD-ordered; next: /spec:implement)
  implementation-log.md: in-progress (domain-foundation + infra-runtimes/keys/factory + application/markdown + UI + wire-in done: T-CC-001..029, 027; the chat surface now mounts statically in the sidebar + `npm run dev`; remaining: T-CC-030 npm-run-dev smoke, T-CC-031 manual real-CLI [human], T-CC-032 verify+parity+draft-PR)
  test-plan.md: in-progress (T-CC-001 baseline reference + streaming-feel note recorded; manual legs scheduled)
  parity-screenshots.md: in-progress (T-CC-001 baseline column scaffolded; Specorator column at /spec:review)
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
| 3. Requirements | `requirements.md` | accepted (PRD-CC-001 — Claudian ground-truth; ADR-CC-001 human-blessed 2026-05-24) |
| 4. Design | `design.md` | complete (Parts A/B/C; ADR-CC-001 ACCEPTED — human-blessed) |
| 5. Specification | `spec.md` | complete (SPEC-CC-001..023; 17 TEST-CC; 15 auto + 2 manual) |
| 6. Tasks | `tasks.md` | complete (TASKS-CC-001 — 32 T-CC tasks) |
| 7. Implementation | `implementation-log.md` + code | in-progress (domain-foundation + infra-runtimes/keys/factory + application/markdown + UI + wire-in complete: T-CC-001..029, 027; the chat surface mounts statically in the agent sidebar + standalone `npm run dev`; remaining: T-CC-030 smoke, T-CC-031 manual real-CLI [human], T-CC-032 verify+parity+draft-PR) |
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

- [x] CLAR-CC-001 — **`ChatRuntime` port shape. RESOLVED (architect 2026-05-24; ADR-CC-001
  ACCEPTED — human-blessed at the charter §6a checkpoint). Pinned implementation-ready in
  spec.md SPEC-CC-001 (exact 9-member interface) + SPEC-CC-002 (StreamChunk union).**
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
- [x] CLAR-CC-007 *(implementation-time)* — **RESOLVED (2026-05-24).** The `DELETED_SUBSYSTEM_BAN`
  (eslint.config.js, ADR-PSR-001) was relaxed per the "regrow per phase" clause: `DELETED_SUBSYSTEM_BAN.group`
  no longer lists `@/application/chat` / `@/application/chat/**` / `@/domain/ports/MarkdownRenderPort`, and
  `DELETED_INJECTION_KEYS.importNames` no longer lists `MARKDOWN_RENDER_PORT`. The exact paths SPEC-CC-008/009/014
  regrow are now importable directly (`@/domain/chat/**` stays banned outside `src/domain/**` — chat types are
  consumed via the `@/domain/ports` barrel). The application+markdown batch (dev, 2026-05-24) closed the blocked
  legs: T-CC-013 RED → T-CC-014 `safeMarkdownRender`, T-CC-015 `safeMarkdownRenderPort` adapter + the
  `createMarkdownRenderPort()` markdown leg of T-CC-012 on all three bridges, and T-CC-016 RED → T-CC-017
  `RunChatTurnUseCase`. Commits `0f02a93`, `b617142`, `7185de0`, `b3bab93`, `96ff568`. The downstream UI
  consumers (`useMarkdownRenderPort` T-CC-018, the `MARKDOWN_RENDER_PORT` provide wiring T-CC-029) are
  unblocked for the next (UI) batch.
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

2026-05-24 (architect, specification): spec.md COMPLETE at specs/chat-core/spec.md
                          (SPEC-CC-001..023 — 23 implementation-ready spec items). Grounded in
                          design.md + ACCEPTED ADR-CC-001 + claudian-main paths (cited inline).
                          - DOMAIN (SPEC-CC-001..009): ChatRuntimePort (exact 9-member interface
                            = the streaming+lifecycle subset of ChatRuntime.ts:20, per-method
                            pre/post/errors; setters/rewind/steer/subagent EXPLICITLY excluded —
                            grow per phase); StreamChunk union mirroring chat.ts:137 (P1 emits
                            assistant_message_start?/text/error/done/usage; full union declared
                            additive, no text-delta/no final); UsageInfo (chat.ts:165 P1 fields);
                            ChatMessage (chat.ts:39 subset, per-field validation; streaming/
                            interrupted live on the store, NOT the DTO); ChatTurnRequest/
                            PreparedChatTurn/ChatRuntimeQueryOptions/EnsureReadyOptions
                            (runtime/types.ts:45/56/64/73 subset); ProviderId='claude';
                            MarkdownRenderPort (one-method safe seam → MarkdownNode DTO, no HTML
                            sink, CLAR-CC-005); CHAT_RUNTIME_PORT + MARKDOWN_RENDER_PORT
                            InjectionKeys (ports.ts); @/domain/ports barrel re-exports.
                          - INFRA (SPEC-CC-010..013): ClaudeCliChatRuntime (spawn contract +
                            NDJSON→StreamChunk reduce referencing the deleted ClaudeSubprocess
                            Adapter/StreamDeltaReducer; cancel()→manual child.kill Electron gotcha;
                            ensureReady→CLI resolvable+login; session id from CLI; NO stored
                            secret); MockChatRuntime (scripted text…done, per-chunk yield tick);
                            FixtureChatRuntime (replay); createChatRuntime() factory on all 3
                            bridges (ADR-CC-001 §6).
                          - APPLICATION (SPEC-CC-014..015): safeMarkdownRender (pure ¶/inline-code/
                            breaks, total, no HTML); RunChatTurnUseCase (prepareTurn→ensureReady→
                            query→ChatTurnSink dispatch; Result<void,ChatTurnError> at boundary;
                            streaming error = error chunk forwarded, NOT per-chunk Result —
                            NFR-CC-003; usage session guard; generator-throw→synthetic error+done).
                          - UI (SPEC-CC-016..022): Pinia chatStore (single-thread DTOs, 5-status
                            machine, sink actions); useChatRuntimePort()/useMarkdownRenderPort();
                            ChatSurface + MessageList/MessageTurn/MarkdownBlock (declarative nodes,
                            no v-html) + WelcomeGreeting (serif token + i18n key, no duration
                            footer) + ChatComposer (Enter/Shift+Enter/Esc/IME, send/stop);
                            AgentSidebarView + ui/main.ts mount/provide (replaces AgentPanelRoot
                            placeholder; provides the 2 new ports + 6 core); data-testid PageObjects
                            named per component (ADR-009).
                          - STYLES (SPEC-CC-023): the 8 new --sp-* tokens (color literals confined
                            to the token layer; no component hex).
                          - 16 edge cases (EC-1..16; EC-5 'done with zero text' RESOLVED →
                            finalise-empty); 17 TEST-CC scenarios with U/A/M split (15 automatable
                            U/A; 2 with a manual leg: TEST-CC-016 npm run dev smoke, TEST-CC-017
                            real-CLI no-secret review). Full REQ↔spec↔test coverage table; quality
                            gate green. NO production code, NO tasks written.

                          HAND-OFF → planner (/spec:tasks). Decompose SPEC-CC-001..023 into
                          T-CC-NNN. Open items for the task list:
                          (1) baseline-capture task FIRST (NFR-CC-011, capture claudian-main P1
                              baseline before any impl);
                          (2) the 8 new --sp-* token additions (SPEC-CC-023);
                          (3) MARKDOWN_RENDER_PORT wiring (SPEC-CC-008/022) — the per-bridge factory
                              implies it; enumerate as its own task;
                          (4) ClaudeCliChatRuntime is coverage-excluded infra → its only gate is the
                              MANUAL TEST-CC-017 (real CLI + data.json no-secret review) — schedule
                              it as a reviewer/SRE manual check, not a CI unit.
                          No remaining open clarifications block tasks (CLAR-CC-001..005 all
                          resolved; EC-5 resolved in spec).

                          Recommended next command: /spec:tasks (planner).

2026-05-24 (planner, tasks): tasks.md COMPLETE at specs/chat-core/tasks.md
                          (TASKS-CC-001 — 32 tasks T-CC-001..032). TDD-ordered: every RED test
                          task (owner qa) precedes the impl task (owner dev) that greens it; each
                          dev task's first DoD line is "the prior RED test(s) now pass". Ordered by
                          DDD inward layering: domain types/ports (T-CC-002..005) → infrastructure
                          ClaudeCliChatRuntime + Mock/Fixture runtimes + per-bridge createChatRuntime
                          factory + markdown port (T-CC-006..012) → application safeMarkdownRender +
                          MarkdownRenderPort + RunChatTurnUseCase (T-CC-013..017) → ui composables +
                          chatStore + ChatComposer/MessageList/MessageTurn/MarkdownBlock/Welcome +
                          ChatSurface (T-CC-018..026) → --sp-* tokens (T-CC-027) → wire into
                          AgentSidebarView + ui/main.ts (T-CC-028..029) → smoke/manual/gate
                          (T-CC-030..032). Each Vue component task pairs a data-testid PageObject
                          (ADR-009). Picked up the architect's open items: (1) baseline-capture FIRST
                          (T-CC-001, NFR-CC-011); (2) the 8 new --sp-* tokens (T-CC-027); (3)
                          MARKDOWN_RENDER_PORT wiring enumerated (T-CC-005 keys, T-CC-015 adapter,
                          T-CC-012 bridge expose, T-CC-029 provide); (4) ClaudeCliChatRuntime
                          coverage-excluded → its sole gate is the MANUAL human-run TEST-CC-017
                          (T-CC-031, never self-claimed). Coverage table proves all 23 SPEC-CC + all
                          15 REQ-CC + 14 NFR-CC + all 17 TEST-CC map to >=1 task. Parity screenshots
                          (320/520/720 x light+dark x 5 states) flagged as a review-stage human task
                          inside the Feature-DoD gate (T-CC-032, draft PR into next). No production
                          code written; no commit. No open clarifications block implementation
                          (CLAR-CC-001..005 resolved; EC-5 finalise-empty resolved in spec).

                          HAND-OFF → /spec:implement. First ready task (qa): T-CC-002 (RED —
                          StreamChunk union + ChatRuntimePort 9-member structural tests; no deps).
                          First dev task: T-CC-003 (domain chat types, greens TEST-CC-002, depends
                          on T-CC-002). T-CC-001 (baseline, dev) and T-CC-027 (tokens, dev) have no
                          deps and may run in parallel anytime before the T-CC-032 gate.
                          Recommended next command: /spec:implement (qa picks up T-CC-002).

2026-05-24 (dev, implement — domain-foundation batch): executed the domain-foundation
                          batch of TASKS-CC-001 with strict TDD, one Conventional commit per task,
                          on feature/chat-core. Completed T-CC-001 (baseline-capture docs:
                          parity-screenshots.md + test-plan.md, no src change), T-CC-002 (RED
                          StreamChunk + ChatRuntimePort structural tests, watched RED via typecheck),
                          T-CC-003 (domain chat types — StreamChunk/UsageInfo/ChatMessage/ChatTurn/
                          ProviderId, greens TEST-CC-002), T-CC-004 (ChatRuntimePort 9-member +
                          MarkdownRenderPort + @/domain/ports barrel re-exports, greens TEST-CC-003),
                          T-CC-006 (RED MockChatRuntime tests, watched RED), T-CC-007 (MockChatRuntime
                          scripted runtime, greens TEST-CC-001 — 11 cases), T-CC-027 (8 --sp-* chat
                          tokens, lint:style-tokens clean). Commits 31a4a4e, ff35058, b0e0fea,
                          8bcb017, 08a99c3, a5fb990, 5dda4f6.
                          Verification at batch end: `npm run typecheck` exit 0 (no intended-RED
                          remaining — every batch RED test was greened by its paired impl within the
                          batch); 51 domain+mock unit tests pass; eslint + prettier + lint:style-tokens
                          green on all changed files. Not run yet (deferred to T-CC-032): npm run
                          verify / build / build:web. manifest.json untouched. NOT pushed.
                          Two documented deviations (both in implementation-log.md): (1) MarkdownNode
                          declared as `interface` not `type {…}` to satisfy
                          @typescript-eslint/consistent-type-definitions (structurally identical);
                          (2) MockChatRuntime imports chat types via the @/domain/ports barrel
                          (SPEC-CC-009 one-stop import) because the P0 DELETED_SUBSYSTEM_BAN still
                          forbids deep `@/domain/chat/**` imports outside src/domain/** — a later
                          infra/ui batch that needs a deep chat import would update that ESLint ban
                          (flagged, not done here). Also: --sp-textarea-max-h set to `none` per
                          claudian-main parity (spec left it unspecified).

                          HAND-OFF → /spec:implement (next batch: infrastructure runtimes). Owner: dev
                          (RED tasks: qa). First task of the NEXT batch: T-CC-008 (qa, RED —
                          FixtureChatRuntime replays bundled transcript; depends on T-CC-004, done) →
                          T-CC-009 (dev, FixtureChatRuntime). T-CC-010 (dev, ClaudeCliChatRuntime —
                          coverage-excluded infra, structural+lint+typecheck gate, manual TEST-CC-017
                          only) may start in parallel (depends on T-CC-004, done). Then the
                          markdown/application batch (T-CC-013→015, T-CC-016→017) and the createChatRuntime
                          factory (T-CC-011→012, after T-CC-010). NOTE for the next batch: T-CC-005
                          (InjectionKeys CHAT_RUNTIME_PORT/MARKDOWN_RENDER_PORT) was OUT of this batch's
                          scope and is still pending — it blocks T-CC-018 (composables); pick it up
                          before the ui-foundation batch.

2026-05-24 (dev, implement — infra-runtimes + InjectionKeys + bridge-factory batch):
                          executed the infra batch of TASKS-CC-001 with strict TDD, one Conventional
                          commit per task, on feature/chat-core. Completed:
                          - T-CC-005 (CHAT_RUNTIME_PORT + MARKDOWN_RENDER_PORT InjectionKeys in
                            ports.ts; no aggregate; commit ccfdfa4) — unblocks the UI batch composables.
                          - T-CC-008 RED (FixtureChatRuntime tests, watched RED — module unresolved;
                            aff9f5f) → T-CC-009 (FixtureChatRuntime replays a canned text…usage…done
                            transcript, per-chunk yield, no node:*/subprocess; 9/9; a361e4f).
                          - T-CC-010 (ClaudeCliChatRuntime — coverage-excluded infra under
                            src/infrastructure/obsidian/**; spawns the resolved claude CLI via
                            node:child_process, prompt→stdin, stdout lines→pure ClaudeStreamReducer;
                            cancel() kills the child manually; query never throws across the port
                            (synthetic error+done on fault); _resolveBinary scans PATH+common dirs so
                            ensureReady can report false; NO secret read/written. The pure NDJSON→
                            StreamChunk reducer is extracted (reduceClaudeStream.ts) + unit-tested with
                            9 canned-event fixtures (RED→GREEN). 72ee148).
                          - T-CC-011 RED (createChatRuntime factory tests, watched RED — 4 failed;
                            a914d4c) → T-CC-012 runtime leg (createChatRuntime() on all 3 bridges:
                            Mock→MockChatRuntime, LocalStorage→FixtureChatRuntime, Obsidian→
                            ClaudeCliChatRuntime; fresh per call; 4/4 + 62 infra tests green; 07e27f8).
                          Verification at batch end: `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0;
                          62 chat-infra unit tests pass (mock + localstorage + reducer); eslint +
                          prettier green on all changed files. Not run (deferred to T-CC-032): npm run
                          verify / build / build:web. manifest.json untouched. NOT pushed.

                          >>> BLOCKER ESCALATED — CLAR-CC-007 (see Open clarifications + implementation-
                          log "Hand-back / clarification"). The MarkdownRenderPort leg of SPEC-CC-013
                          (T-CC-013/014/015 + the markdown half of T-CC-011/012) is BLOCKED by the
                          DELETED_SUBSYSTEM_BAN in eslint.config.js, which still bans @/application/chat/**,
                          @/domain/ports/MarkdownRenderPort, and the MARKDOWN_RENDER_PORT importName — the
                          exact paths the spec regrows. Editing eslint.config.js is out of this batch's
                          scope; handed back to architect/pm. The runtime-factory half is complete + green.

                          HAND-OFF → architect/pm to resolve CLAR-CC-007 (drop the three regrown paths
                          from the ban lists), THEN → /spec:implement for the application batch. First
                          task of the NEXT batch: T-CC-016 (qa, RED — RunChatTurnUseCase orchestration:
                          dispatch/usage-guard/error/done/cancel/throw; depends on T-CC-007, done) →
                          T-CC-017 (dev, RunChatTurnUseCase + ChatTurnError). NOTE: RunChatTurnUseCase
                          lives in @/application/chat/** — also under the CLAR-CC-007 ban; the use case
                          itself + its test are fine to author (the ban fires on *importers* of
                          @/application/chat/**, and a co-located test under tests/application/chat/ is
                          base-config too, so verify the test-file import is permitted or fold CLAR-CC-007's
                          fix to cover it). T-CC-013-015 (markdown) resume once CLAR-CC-007 is resolved.

2026-05-24 (dev, implement — application + markdown batch): CLAR-CC-007 RESOLVED upstream (ban lists
                          relaxed). Executed the application + markdown batch of TASKS-CC-001 with strict TDD,
                          one Conventional commit per task, on feature/chat-core. Completed:
                          - T-CC-013 RED (safeMarkdownRender TEST-CC-014 suite, watched RED; 0f02a93) ->
                            T-CC-014 (safeMarkdownRender pure transform: paragraphs/inline-code/line breaks ->
                            SafeRenderResult; no HTML in any field; never throws; 13/13; b617142).
                          - T-CC-015 (safeMarkdownRenderPort MarkdownRenderPort adapter delegating to
                            safeMarkdownRender + createMarkdownRenderPort() on all three bridges; closes the
                            previously-blocked markdown leg of T-CC-011/012; extended createChatRuntime suite
                            with the TEST-CC-016 markdown leg; 7185de0).
                          - T-CC-016 RED (RunChatTurnUseCase orchestration suite vs a scriptable ScriptedRuntime +
                            stub ChatTurnSink; dispatch/usage-guard/error-continue/not-ready/cancel/generator-throw/
                            queryOptions/finalise-empty; watched RED; b3bab93) -> T-CC-017 (RunChatTurnUseCase +
                            ChatTurnError: prepareTurn->ensureReady->onAssistantStart->drainStream dispatch;
                            Result<void,ChatTurnError> at the discrete boundary; streaming error = forwarded error
                            chunk, not per-chunk Result; EC-5/6/7/11/13; tryAsync drain so an unexpected throw
                            becomes a synthetic error+done + err('runtime-throw'), never rethrown; 10/10; 96ff568).
                          Verification: npx vue-tsc --noEmit -p tsconfig.lint.json exit 0 (no intended-RED
                          remaining); 82 chat application+infra unit tests pass; eslint + prettier green on all
                          changed files. Not run (deferred to T-CC-032): npm run verify / build / build:web.
                          manifest.json untouched. NOT pushed. One documented deviation (implementation-log.md
                          T-CC-017): the dispatch loop factored into private drainStream/dispatchChunk/
                          isForeignSession helpers + tryAsync (vs an inline try/catch) to satisfy the
                          complexity<=10 + application-layer no-restricted-syntax lint rules; behaviour identical
                          to the spec's inline for-await switch, no assertion changed.

                          HAND-OFF -> /spec:implement (next batch: UI foundation). First task of the NEXT batch:
                          T-CC-018 (dev — composables useChatRuntimePort()/useMarkdownRenderPort(), inject-or-throw,
                          depends on T-CC-005 done) in parallel with T-CC-019 (qa, RED — chatStore state machine +
                          sink actions, depends on T-CC-017 done) -> T-CC-020 (dev — chatStore). The
                          MARKDOWN_RENDER_PORT key + @/application/chat/** are now importable (CLAR-CC-007
                          resolved), so the UI composables and store can wire the ports and the RunChatTurnUseCase
                          directly. Then UI components (T-CC-021/022 composer, T-CC-023/024 render), surface
                          (T-CC-025/026), wiring (T-CC-028/029), and smoke/manual/gate (T-CC-030..032).

2026-05-24 (dev, implement — UI + wire-in batch): executed the UI + wire-in batch of TASKS-CC-001
                          with strict TDD, one Conventional commit per task, on feature/chat-core. Completed
                          T-CC-018..026, 028, 029 (T-CC-027 tokens already landed in an earlier batch):
                          - T-CC-018: useChatRuntimePort()/useMarkdownRenderPort() inject-or-throw composables
                            (mirror useLoggerPort); 4/4 (97efe46).
                          - T-CC-019 RED -> T-CC-020: Pinia chatStore — single-thread ChatMessage[] DTOs, the
                            5-status machine, the ChatTurnSink legs + sendMessage/cancelTurn/$reset driving a
                            bound RunChatTurnUseCase; EC-1/4/5/7/8/9/10/15; runner+notifier held off reactive
                            state (WeakMap) so only DTOs cross the boundary; 17/17 (01ccd9d, bab9e44).
                          - T-CC-021 RED -> T-CC-022: ChatComposer.vue (auto-grow textarea via :style, send/stop,
                            Enter/Shift+Enter/IME/Esc contract); + the P1 chat i18n keys (welcome/composer/busy/
                            interrupted) in en+de; 12/12 (1808552, aaa0868).
                          - T-CC-023 RED -> T-CC-024: MarkdownBlock (declarative nodes, no v-html, EC-14 safe),
                            MessageTurn (role-distinct + data-streaming + --sp-interrupt badge + dir=auto),
                            MessageList (keyed v-for + auto-scroll), WelcomeGreeting (serif greeting, no footer);
                            18/18 (ef07550, 69131df).
                          - T-CC-025 RED -> T-CC-026: ChatSurface.vue (data-provider=claude; welcome vs list;
                            busy aria-live=polite; builds RunChatTurnUseCase from useChatRuntimePort() + binds the
                            store with a sticky-notice start-fail notifier; onBeforeUnmount $reset cancels in-flight
                            — EC-15); 7/7 (25feb7b, b5bdb41).
                          - T-CC-028 RED -> T-CC-029: wired ChatSurface into AgentSidebarView.onOpen + src/ui/main.ts
                            (provide CHAT_RUNTIME_PORT from bridge.createChatRuntime() + MARKDOWN_RENDER_PORT from
                            bridge.createMarkdownRenderPort() alongside the six core ports; ErrorBoundary kept;
                            onClose unmount cancels the turn via the surface's onBeforeUnmount); updated the P0
                            standalone test (TEST-PSR-022) to assert chat-surface; greens TEST-CC-015 (698bcc7,
                            2b5bf06). The agent-panel-empty placeholder is gone from both live views.
                          Verification at batch end: `npx vue-tsc --noEmit -p tsconfig.lint.json` exit 0 (no
                          intended-RED remaining); targeted chat-UI surface 13 files / 71 tests pass; full unit
                          suite 39 files / 291 tests pass (18 vitest worker-startup *timeout* errors under whole-
                          suite parallelism — environmental, exit code 0, all files passed; targeted chat suites
                          independently green). eslint + prettier + lint:style-tokens green on all changed files.
                          No v-html/innerHTML/window.confirm; no obsidian/node:* under src/ui/**; tokens only.
                          Not run (deferred to the final batch per the brief): T-CC-030 (npm run dev smoke),
                          T-CC-031 (manual real-CLI — human-owned), T-CC-032 (npm run verify / build / build:web +
                          parity sign-off + draft PR). manifest.json untouched. NOT pushed.
                          Documented deviations (implementation-log.md): (1) chatStore runner/notifier held in a
                          WeakMap off reactive state (DTO-only boundary) + EC-7 surfaces the start-fail via the
                          notice, not an extra assistant message; (2) ChatComposer auto-grow via :style binding
                          (obsidianmd no-static-styles rule); (3) MessageTurn takes streaming/interrupted booleans
                          from the parent (presentational); (4) EC-15 cancel-then-unmount honoured via
                          onBeforeUnmount->$reset (no duplicate onClose wiring); (5) AgentPanelRoot.vue + its
                          direct test left in place (no longer mounted; still test-exercised) — removal flagged
                          for reviewer follow-up.

                          HAND-OFF -> /spec:implement (final batch: smoke/manual/gate). T-CC-030 (qa — npm run dev
                          standalone smoke, manual-assisted; record in test-plan.md), T-CC-031 (human — manual
                          real-CLI in Obsidian + no-secret review, never agent-self-claimed), T-CC-032 (dev —
                          full npm run verify + npm run test:all + parity sign-off at review + draft PR into next).
                          The plugin mounts the chat surface statically today (sidebar + npm run dev); the smoke
                          leg confirms the streaming feel against MockBridge.
```
