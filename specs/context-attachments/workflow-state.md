---
feature: context-attachments
area: CA
current_stage: requirements
status: active
last_updated: 2026-05-25
last_agent: pm (requirements)
epic: claudian-reboot
phase: P5
integration_branch: next
reference: D:\Projects\claudian-main
artifacts:
  idea.md: skipped (charter §3.4 + audits + claudian-main stand in, mirrors P1-P4)
  research.md: skipped
  requirements.md: draft (PRD-CA-001; in-progress, held for the P5 ADRs / CLAR-CA-001..004)
  design.md: pending
  spec.md: pending
  tasks.md: pending
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
| 3. Requirements | `requirements.md` | in-progress (draft) |
| 4. Design | `design.md` | pending |
| 5. Specification | `spec.md` | pending |
| 6. Tasks | `tasks.md` | pending |
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
```
