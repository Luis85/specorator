---
feature: context-attachments
area: CA
current_stage: tasks
status: active
last_updated: 2026-05-25
last_agent: planner (tasks)
epic: claudian-reboot
phase: P5
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.4 + audits + claudian-main stand in, mirrors P1-P4)
  research.md: skipped
  requirements.md: accepted (PRD-CA-001; CLAR-CA-001..004 resolved by ADR-CA-001..004)
  design.md: complete (DESIGN-CA-001; Parts A/B/C; ADR-CA-001..004 accepted)
  spec.md: complete (SPEC-CA-001..030; 6 layer groups; TEST-CA-001..032 + M1/M2/M3; full coverage)
  tasks.md: complete (TASKS-CA-001; 48 tasks T-CA-001..048; 8 batches; full SPEC/REQ/NFR/TEST coverage)
  implementation-log.md: pending
  test-plan.md: pending
  test-report.md: pending
  review.md: pending
  traceability.md: pending
  release-notes.md: pending
  retrospective.md: pending
---

# Workflow state — context-attachments (P5)

## Stage progress

| Stage | Artifact | Status |
|---|---|---|
| 1. Idea | `idea.md` | skipped |
| 2. Research | `research.md` | skipped |
| 3. Requirements | `requirements.md` | accepted |
| 4. Design | `design.md` | complete |
| 5. Specification | `spec.md` | complete |
| 6. Tasks | `tasks.md` | complete |
| 7. Implementation | `implementation-log.md` + code | pending |
| 8. Testing | `test-plan.md`, `test-report.md` | pending |
| 9. Review | `review.md`, `traceability.md` | pending |
| 10. Release | `release-notes.md` | pending |
| 11. Learning | `retrospective.md` | pending |

## Epic context — claudian-reboot P5 (context & attachments)

P0-P4 merged to `next`. P5 = context & attachments on the P1-P4 chat surface.

**Scope (charter §4 P5 row + §3.4):**
- **File context / chips** (`FileContext`, `FileChipsView`, `FileContextState`, `utils/fileLink`) — attach
  vault files as context chips on the composer; the chip view + state.
- **Image context / embed / modal** (`ImageContext`, `utils/imageEmbed`, image-modal) — attach/preview images.
- **External context + selection** (`BrowserSelectionController`, `CanvasSelectionController`,
  `SelectionController`, `SelectionHighlight`) — capture a selection (editor/canvas/browser) as context.
- **Inline Edit modal + word-level diff** (`features/inline-edit/ui/InlineEditModal`, `utils/inlineEdit`,
  `core/prompt/inlineEdit`, `QueryBackedInlineEditService`, `ClaudeInlineEditService`) — select text in a
  note, ask for an edit, preview a word-level diff (REUSES the P2 `computeDiff`/`DiffView`), apply.

**Out of P5 (later phases):** toolbar widget selectors + usage meter (P6); approval rules (P7); MCP (P8);
Codex/Opencode providers + their inline-edit services (P9 — P5 builds the SEAMS, wires only Claude);
settings UX (P10). The `@mention` of files (P4) already exists — P5 adds the richer chip/attachment +
selection-as-context + the inline-edit modal flow.

**Likely P5 ADR decisions (autonomous — record each):**
- Attachment/context model: how file chips + images + selections attach to a turn (a per-turn context
  list on the composer/store; image data transport — base64 vs vault-path reference; the `ChatTurnRequest`
  grows a context/attachments field additively, or a separate context port).
- Selection capture ports: editor selection (Obsidian editor), canvas selection (Obsidian canvas — the W13
  canvas mock exists in fake-ports), browser selection (an embedded webview? likely Obsidian-specific /
  capability-gated; may defer the browser leg). Decide which selection sources are P5-feasible vs deferred.
- Inline-edit seam: reuse the cold-start side-query (ADR-TS-003/CP-003 pattern; inline-edit is the 3rd
  side-query consumer — the ADR-CP-003 named re-eval point for extracting `AuxModelPort`). DECIDE: extract
  `AuxModelPort` now (title-gen + instruction-refine + inline-edit all want the same one-shot shape) or keep
  the per-use-case side-query. The inline-edit modal reuses the P2 word-diff (`computeDiff`/`DiffView`).
- Image transport + the no-secret/size constraints; vault-file reads via `VaultPort`.

**Epic constraints (every phase):** secrets→`app.secretStorage` behind `SecretStorePort`, never
`data.json`; device/user settings→device-local; NO backwards compat; DDD inward imports + narrow ports + 3
bridges; Vue never imports `obsidian`; no `innerHTML`/`v-html`/`window.confirm` (Obsidian `Modal` via
modalSeam for the inline-edit modal); `<script setup>`; `Result<T,E>`; tests mirror `src/` + `data-testid`
PageObjects; coverage 80/70/80/80; perceptual `--sp-*` parity; identity stays Specorator; WCAG 2.2 AA;
manifest untouched; CI SHA-pinned + actionlint. VERIFY GATE (`npm run verify` + `npm run test:all` exit zero).

**Operating mode (human directive 2026-05-25):** AUTONOMOUS DRIVE — no per-phase human checkpoint;
self-parity-review vs claudian after each big chunk; merge P5 to `next` autonomously; manual-Obsidian +
parity-screenshot legs accumulate for the SINGLE FINAL human review gate.

**Mandatory inputs:** `specs/claudian-reboot/parity-charter.md` §3.4/§4/§5/§6 +
`claudian-audit-{frontend,backend}.md` + `D:\Projects\claudian-main` (§3.4 sources:
`features/chat/ui/{FileContext,ImageContext}.ts`, `features/chat/ui/file-context/{state/FileContextState,view/FileChipsView}.ts`,
`features/chat/controllers/{BrowserSelectionController,CanvasSelectionController,SelectionController}.ts`,
`features/inline-edit/ui/InlineEditModal.ts`, `shared/components/SelectionHighlight.ts`,
`utils/{fileLink,imageEmbed,inlineEdit}.ts`, `core/prompt/inlineEdit.ts`, `core/auxiliary/QueryBackedInlineEditService.ts`,
`providers/claude/auxiliary/ClaudeInlineEditService.ts`).

## Hand-off notes

```
2026-05-25 (orchestrator): P5 bootstrapped on feature/context-attachments (off next; P0-P4 merged).
                          Scope = charter §4 P5 / §3.4 (file chips, images, browser/canvas selection,
                          inline-edit + word-diff). Autonomous drive. Next: /spec:requirements (pm)
                          grounded in charter §3.4 + audits + the claudian §3.4 sources; then design
                          A/B/C with the P5 ADRs (attachment/context model + image transport; selection
                          capture ports incl. which selection sources are feasible; the AuxModelPort
                          extract-now decision [3rd side-query consumer]; inline-edit reusing the P2
                          word-diff). EARS reqs each mapped to a claudian path + test. Inline-edit modal
                          via the modalSeam (Obsidian Modal). Reuse P2 computeDiff/DiffView for the
                          inline-edit preview.

2026-05-25 (pm, requirements): PRD-CA-001 drafted (specs/context-attachments/requirements.md), status
                          draft (HELD for the P5 ADRs — autonomous drive, no human gate). 28 EARS reqs
                          REQ-CA-001..028 grouped by sub-surface, each mapped 1:1 to a claudian §3.4 path
                          + Given/When/Then: A file chips REQ-CA-001..006 (FileContextState/fileLink),
                          B images REQ-CA-007..012 (ImageContext/imageEmbed), C selection REQ-CA-013..019
                          (Selection/Canvas/BrowserSelectionController + SelectionHighlight),
                          D inline-edit REQ-CA-020..028 (InlineEditModal/prompt/QueryBackedInlineEditService).
                          NFR-CA-001..013 (DDD/ports/3-bridges, Vue-no-obsidian, no v-html/innerHTML +
                          Obsidian Modal via modalSeam, <script setup>, Result, tests-mirror-src +
                          data-testid POs, coverage 80/70/80/80, --sp-* parity, WCAG 2.2 AA, image
                          size/no-secret [NEW threshold], manifest untouched, no migration). Counter-metric
                          = scope leakage vs NG1-NG8.

                          HAND-OFF → /spec:design (architect). Four ADR-worthy CLARs flagged (PM gave
                          options + constraints + a recommendation; PM did NOT decide):
                          - CLAR-CA-001 attachment/context model + image transport. PM rec: additive
                            ChatTurnRequest fields (already reserved at ChatTurn.ts:12-13); image transport
                            decided by what the Claude CLI subprocess accepts (base64 vs vault-ref), bounded
                            by a size limit (the one NEW threshold).
                          - CLAR-CA-002 selection-capture ports + feasibility. PM rec: ship EDITOR (CM6,
                            clean) + CANVAS (mock exists in fake-ports) behind the selection port(s);
                            CAPABILITY-GATE the BROWSER leg (REQ-CA-018 'could' — webview.executeJavaScript/
                            iframe.contentDocument is Electron-specific/fragile), defer if the bridge can't
                            read it; do not silently drop.
                          - CLAR-CA-003 inline-edit modal-seam shape. PM rec: an OpenInlineEditFn modal-seam
                            handle resolving {decision, editedText?} (mirrors InstructionConfirmFn), preview
                            via DiffView inside the Obsidian Modal.
                          - CLAR-CA-004 AuxModelPort extract-now + diff-reuse seam. PM rec: EXTRACT
                            AuxModelPort NOW (inline-edit is the 3rd cold-start side-query consumer after
                            GenerateTitleUseCase + RefineInstructionUseCase; ADR-CP-003 named this the
                            re-eval point; claudian's AuxQueryRunner validates the shape). DIFF SEAM: the P2
                            computeDiff is LINE-level (DiffLine[] from tool results) — inline edit needs a
                            WORD-level diff; reuse the DiffView RENDERER only, add a small in-repo word-level
                            diff fn (no new dep, NFR-CA-011). NOTE the brief's "reuse computeDiff" needs this
                            line-vs-word correction — confirm in the ADR.

                          PRD held at draft until the P5 ADRs resolve CLAR-CA-001..004; then /spec:clarify
                          gate closes and status → accepted.

2026-05-25 (architect, design): DESIGN-CA-001 complete (specs/context-attachments/design.md, Parts
                          A/B/C). CLAR-CA-001..004 RESOLVED by four accepted ADRs; PRD-CA-001 → accepted;
                          /spec:clarify gate closed.

                          ADR DECISIONS (all accepted, autonomous-drive):
                          - ADR-CA-001 (CLAR-CA-001): regrow the reserved ChatTurnRequest fields
                            additively (attachedFiles?/images?/editorSelection?/canvasSelection?/
                            browserSelection? — all optional, P1 send path byte-identical when empty).
                            NO AttachmentPort — one additive VaultPort.readBinary for the only missing
                            capability (binary read). Image transport = BOUNDED BASE64-INLINE (self-
                            contained, matches the claude --print CLI turn; vault-path-ref rejected for
                            transport, kept only for thumbnail display). 8 MiB limit + png/jpeg/webp/gif
                            allow-list; no secret; no data.json.
                          - ADR-CA-002 (CLAR-CA-004 port half): EXTRACT AuxModelPort NOW
                            (run(prompt,{systemPrompt?,model?,signal?})→Result<string>), delegating to the
                            runtime's cold-start query. Third consumer (inline-edit) + two new aux concerns
                            (abort signal + continue-conversation) cross the ADR-CP-003 threshold. REFACTOR:
                            re-point GenerateTitleUseCase (P3) + RefineInstructionUseCase (P4) onto it,
                            delete their drain loops, keep their tests green (inject the aux stub); grow
                            fake-ports with an auxModel member. Bounded churn, pre-paid by ADR-TS-003/CP-003.
                          - ADR-CA-003 (CLAR-CA-002): two ports — SelectionSourcePort (union DTO over
                            editor/canvas/browser + supportsBrowserSelection flag) + SelectionHighlightPort.
                            SHIP editor + canvas (canvas mock exists). CAPABILITY-GATE the browser leg
                            (ADR-TS-004 honesty) — render the affordance only where supportsBrowserSelection;
                            DTO + request slot ship now so it lights up additively; never silently dropped.
                          - ADR-CA-004 (CLAR-CA-003 + CLAR-CA-004 diff half): inline edit via an
                            OpenInlineEditFn modal seam (mirrors InstructionConfirmFn) → Obsidian
                            InlineEditModal; cold-start aux query via AuxModelPort; parseInlineEditResponse
                            (ported pure). DIFF SEAM: reuse the DiffView RENDERER ONLY, fed by a NEW pure
                            computeWordDiff (DP/LCS over split(/(\s+)/) → DiffLine[] → ToolDiffData) — NOT
                            line-level computeDiff (the brief's line-vs-word correction); no new dep.

                          NEW PORTS/TYPES/COMPONENTS: ports AuxModelPort, SelectionSourcePort,
                          SelectionHighlightPort (+ AUX_MODEL_PORT/SELECTION_SOURCE_PORT/
                          SELECTION_HIGHLIGHT_PORT keys, three-bridge impls); VaultPort.readBinary
                          (additive); ChatTurnRequest grows five optional fields; domain DTOs
                          AttachedFileRef/AttachedImage + the CapturedSelection union; app fns
                          parseInlineEditResponse/computeWordDiff/inlineEditPrompt; use cases
                          AddFileContext/AddImage/CaptureSelection/InlineEdit + the title/refine re-point;
                          ui FileChips/ImageContext/SelectionIndicator + ChatComposer context bar + the
                          OpenInlineEditFn seam; plugin InlineEditModal + ImagePreviewModal. DiffView
                          REUSED UNCHANGED. Everything additive + claudian-grounded.

                          HAND-OFF → /spec:specify (architect). Write spec.md: full DTO/port contracts +
                          field validation (pin EditorSelectionContext.startLine 0/1-based + the wikilink
                          display format — spec-level, not architecture), the inline-edit state machine,
                          edge cases (C.5), observability, per-interface REQ links. Sequence the AuxModelPort
                          re-point (ADR-CA-002 §3) as an early task so inline-edit builds on the unified seam.
                          NO open clarifications blocking.

2026-05-25 (architect, specification): SPEC-CA-001..030 complete (specs/context-attachments/spec.md),
                          status complete. 30 spec items in 6 layer groups: DOMAIN SPEC-CA-001..006
                          (the 5 additive optional ChatTurnRequest fields; AttachedFileRef/AttachedImage
                          DTOs; CapturedSelection editor/canvas/browser union; AuxModelPort + key +
                          barrel; SelectionSourcePort + SelectionHighlightPort + supportsBrowserSelection
                          + keys + barrel; additive VaultPort.readBinary); INFRA SPEC-CA-007..010
                          (3-bridge AuxModelPort/selection/readBinary impls + the bounded base64
                          image-encode, 8 MiB + MIME allow-list); APPLICATION SPEC-CA-011..018 (pure
                          computeWordDiff/parseInlineEditResponse/inlineEditPrompt; AddFileContext/
                          AddImage/CaptureSelection/InlineEdit use cases; the behaviour-preserving
                          re-point of GenerateTitle + RefineInstruction onto AuxModelPort, drains
                          deleted); UI SPEC-CA-019..026 (FileChips/ImageContextBar+ImageThumb/
                          SelectionIndicator + the ChatComposer context-bar slot; OpenInlineEditFn +
                          OpenImagePreviewFn modal-seam handles; InlineEditModal reusing the UNCHANGED
                          DiffView for the word-diff + ImagePreviewModal; useAuxModelPort/
                          useSelectionSourcePort/useSelectionHighlightPort composables; AgentSidebarView +
                          ui/main.ts wiring); STYLES SPEC-CA-027 (8 minted --sp-* tokens, word-diff rides
                          the P2 diff tokens); CROSS-CUTTING SPEC-CA-028..030 (additivity / no-provider-
                          branch + capability-gate / Result-no-secret-DOM-observability). EC-CA-1..16 +
                          TEST-CA-001..032 + M1/M2/M3 (U≈18 / A≈9 / M≈8). Full REQ-CA↔SPEC-CA↔TEST-CA
                          coverage table (all 28 REQ + 13 NFR). Two design open items RESOLVED in the
                          spec: EditorSelectionContext.startLine = 0-based (CM6 verbatim); chip
                          displayName = basename-without-extension, wikilink-form via a declarative
                          element + WorkspacePort.openFile (no raw HTML, no app.workspace). Everything
                          additive + claudian-grounded. No new ADR needed.

                          HAND-OFF → /spec:tasks (planner). TDD-ordering hints:
                          1) DOMAIN FIRST — the 5 ChatTurnRequest fields (SPEC-CA-001), the DTOs
                             (SPEC-CA-002/003), the three ports + keys + barrels (SPEC-CA-004/005), and
                             VaultPort.readBinary (SPEC-CA-006). Pure type-shape contracts; unblock
                             everything downstream.
                          2) AuxModelPort + THE RE-POINT EARLY (SPEC-CA-004/008/018, ADR-CA-002 §3):
                             grow fake-ports with the `auxModel` member, then re-point GenerateTitleUseCase
                             (P3) + RefineInstructionUseCase (P4) onto it and migrate their tests to inject
                             the Mock aux — keep P3/P4 GREEN before inline-edit lands. Behaviour-preserving
                             seam swap; the pure transforms (titleGeneration/instructionRefine) stay
                             byte-identical.
                          3) PURE TRANSFORMS BEFORE THE MODAL — computeWordDiff + parseInlineEditResponse
                             + inlineEditPrompt (SPEC-CA-011/012/013) are total/never-throw; test in
                             isolation (incl. the identical-text no-op EC-CA-10) before InlineEditUseCase
                             (SPEC-CA-017) and well before the InlineEditModal (SPEC-CA-024).
                          4) USE CASES over the Mock ports (SPEC-CA-014/015/016/017) — AddImage's gate
                             order (MIME → readBinary → 8 MiB → encode) and the Result-err legs
                             (EC-CA-1/2/8/9) are unit-coverage; the word-diff→DiffView reuse is asserted by
                             mounting the UNCHANGED DiffView with a word-diff ToolDiffData.
                          5) UI components + composables (SPEC-CA-019..025) each with a co-located
                             data-testid PageObject; the ChatComposer context-bar slot is ADDITIVE (no
                             context → byte-identical to P4).
                          6) COVERAGE-EXCLUDED → MANUAL LEGS — the ObsidianBridge AuxModelPort (real
                             cold-start subprocess), the CM6 editor + Obsidian canvas selection, the real
                             VaultPort.readBinary, the InlineEditModal/ImagePreviewModal, and the real-CLI
                             image turn are src/infrastructure/obsidian/** + src/plugin/** (excluded from
                             coverage); they accumulate as TEST-CA-M1/M2/M3 + the parity screenshots for
                             the SINGLE FINAL human review gate.
                          7) BROWSER-SELECTION CAPABILITY-GATED — ship the DTO + the request slot +
                             SelectionSourcePort.supportsBrowserSelection now (ObsidianBridge may ship it
                             false — an honest defer, REQ-CA-018); the SelectionIndicator renders the
                             browser affordance ONLY where the flag is true. Never silently dropped.
                          NO open clarifications blocking.

2026-05-25 (planner, tasks): TASKS-CA-001 complete (specs/context-attachments/tasks.md), status
                          complete. 48 tasks T-CA-001..048 decomposing SPEC-CA-001..030, TDD-ordered
                          (RED qa-owned before green dev-owned; every dev task's first DoD line = "the
                          prior RED test(s) now pass"), one commit per task, DDD inward layering across
                          8 batches: (0) baseline+guard-verify T-CA-001; (1) DOMAIN T-CA-002..006 (5
                          ChatTurnRequest fields, AttachedFileRef/AttachedImage + CapturedSelection union,
                          3 ports+keys+barrels, VaultPort.readBinary); (2) AUX IMPL + RE-POINT EARLY
                          T-CA-007..011 (Mock/LS/Obsidian AuxModelPort + fake-ports.auxModel, then
                          behaviour-preserving re-point of GenerateTitle (P3) + RefineInstruction (P4) —
                          sequenced BEFORE inline-edit per ADR-CA-002 §3 so P3/P4 stay green); (3) INFRA
                          T-CA-012..016 (Mock/LS/Obsidian selection ports + readBinary; bounded base64
                          encode + 8 MiB/MIME gates); (4) APPLICATION T-CA-017..028 (pure computeWordDiff
                          + parseInlineEditResponse + inlineEditPrompt BEFORE AddFileContext/AddImage/
                          CaptureSelection/InlineEdit use cases); (5) UI T-CA-029..041 (4 composables;
                          FileChips/ImageContextBar+ImageThumb/SelectionIndicator each + data-testid PO;
                          modalSeam OpenInlineEdit/OpenImagePreview handles; InlineEditModal reusing the
                          UNCHANGED DiffView + ImagePreviewModal as Obsidian Modal subclasses; ChatComposer
                          context-bar slot); (6) STYLES T-CA-042 (8 --sp-* tokens + tokens.test); (7)
                          WIRE-IN T-CA-043..045 (provide 3 ports + 2 launchers in AgentSidebarView +
                          ui/main.ts; mount context bar; npm run dev smoke); (8) GATE T-CA-046/047 (manual
                          legs M1/M3/017 + M2/024/025/029 + parity screenshots, human-owned) + T-CA-048
                          (full verify + grep gates + draft PR to next, orchestrator merges).

                          GUARD-RELAX TASK: NONE. Verified against eslint.config.js — no P5 symbol was
                          P0-deleted; AUX_MODEL_PORT/SELECTION_SOURCE_PORT/SELECTION_HIGHLIGHT_PORT are
                          not in DELETED_INJECTION_KEYS; @/domain/chat/attachments/**, the 3 new ports,
                          @/application/chat/{attachments,inlineEdit}/**, and the new UI paths match no
                          DELETED_SUBSYSTEM_BAN glob (@/domain/chat regrew in P1; VaultPort is a live core
                          port). T-CA-001 + T-CA-006 + T-CA-048 carry the lint-confirm DoD lines.

                          Coverage: full SPEC-CA-001..030 + 28 REQ-CA + 13 NFR-CA + 32 TEST-CA (incl.
                          018b/023b/026b) + 3 manual legs (M1/M2/M3) → ≥1 task (§ coverage table).
                          Stability-loop NFRs: none in scope (no "0 flakes across N runs" requirement).

                          HAND-OFF → /spec:implement (dev) + /spec:test (qa). FIRST READY TASK:
                          T-CA-002 (qa, RED) — the domain DTOs + CapturedSelection union + the five
                          additive ChatTurnRequest fields structural/serialisation tests (naming
                          TEST-CA-001/002/003 + the TEST-CA-013 type-shape leg) — its green pair is
                          T-CA-003 (dev). NO-DEP PARALLEL TASKS (Batch 0, run anytime): T-CA-001 (dev,
                          baseline + guard-verify), T-CA-002 (qa, domain RED), T-CA-042 (dev, --sp-*
                          tokens). The aux re-point chain (T-CA-007→T-CA-011) must land before the
                          inline-edit chain (T-CA-027/028) + the InlineEditModal (T-CA-039). Manual legs
                          T-CA-046/047 are human-owned — never agent-self-claimed; they ride the single
                          final epic-review gate. Critical path (12 tasks): T-CA-002→003→005→006→007→008
                          →027→028→039→044→047→048.
```
