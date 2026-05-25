---
id: TRACE-CA-001
title: Context & Attachments (P5) — traceability matrix
stage: review
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
status: complete
owner: reviewer
integration_branch: next
base: 88f9810
created: 2026-05-25
updated: 2026-05-25
---

# Traceability — Context & Attachments (P5)

REQ-CA ↔ SPEC-CA ↔ TEST-CA ↔ code(`file:line`) ↔ status, validated against the diff
`git diff 88f9810..HEAD` at Stage-9 review. Status legend:

- **satisfied** — code + an executing automated assertion verify the requirement.
- **partial** — code exists but a required behaviour leg is missing (a review finding).
- **not-satisfied** — the requirement's core behaviour has no live path (a P1 finding).
- **pending-manual** — coverage-excluded HUMAN leg (Obsidian/CM6/canvas/binary/Modal/real-CLI),
  scheduled in `test-plan.md`, NOT agent-claimed green.

Paths are repo-relative to the worktree root.

## Functional requirements

| REQ | SPEC-CA | TEST-CA | Code (`file:line`) | Status | Finding |
|---|---|---|---|---|---|
| REQ-CA-001 attach file as chip | 001/002/014/019/022 | TEST-CA-001/003 (U/A) | `AddFileContextUseCase.ts:17` (add, **uncalled in src**); `FileChips.vue:39` | **not-satisfied** | R-CA-002 |
| REQ-CA-002 idempotent re-attach | 014 | TEST-CA-001 (U) | `AddFileContextUseCase.ts:17` (idempotent add, unit-green) | **partial** (unit-only; no attach path) | R-CA-002 |
| REQ-CA-003 remove chip | 014/019 | TEST-CA-003 (U/A); EC-CA-4 | `AddFileContextUseCase.ts:24`; `ChatSurface.vue:278-281`; `FileChips.vue:51` | **satisfied** | — |
| REQ-CA-004 files travel + clear | 001/022 | TEST-CA-004 (A) | `ChatTurn.ts:23` (field); send path `ChatSurface.vue:308`→`tabsStore.ts:541` (**not folded**) | **not-satisfied** | R-CA-001, R-CA-004 |
| REQ-CA-005 wikilink open via WorkspacePort | 019 | TEST-CA-005 (A) | `FileChips.vue:44` (`[[path]]`); `ChatSurface.vue:283-285` (`workspace.openFile`) | **satisfied** | — |
| REQ-CA-006 reset on new/loaded conv | 022 | TEST-CA-006 (A) | `ChatSurface.vue:223-225` (openTab; **no set reset**) | **not-satisfied** | R-CA-003 |
| REQ-CA-007 attach image | 015/020 | TEST-CA-007 (A) | `AddImageUseCase.ts:29` (**uncalled in src**); `ImageContextBar.vue`/`ImageThumb.vue` | **not-satisfied** | R-CA-002 |
| REQ-CA-008 image preview modal | 020/023/024 | TEST-CA-008 (M) | `modalSeam.ts:94/97/109`; `ImagePreviewModal.ts`; `inlineEditLauncher.ts:68` | **pending-manual** | — |
| REQ-CA-009 remove image | 020 | TEST-CA-009 (A) | `ChatSurface.vue:287-289`; `ImageThumb.vue` (remove emit) | **satisfied** | — |
| REQ-CA-010 embed images in turn + clear | 001/006/010/015 | TEST-CA-010 (U) / 029 (M) | `ChatTurn.ts:25` (field); `imageEncode.ts`; send path **not folded** (`tabsStore.ts:541`) | **not-satisfied** | R-CA-001 |
| REQ-CA-011 declarative `:src`, no v-html | 020/030 | TEST-CA-011 (A) | `ImageThumb.vue` (`:src` bind); `ImagePreviewModal.ts` (`createEl('img')`) | **satisfied** | — |
| REQ-CA-012 reject oversize/non-image | 010/015 | TEST-CA-012 (U/A); EC-CA-1/2 | `AddImageUseCase.ts:31-45` (gate, unit-green; **uncalled**; no `showWarning` wiring) | **partial** (unit-only) | R-CA-002 |
| REQ-CA-013 capture editor selection | 003/005/016 | TEST-CA-013 (U) / 017 (M) | `Selection.ts:10`; `CaptureSelectionUseCase.ts:41`; `useCapturedSelection.ts` | **satisfied** (U/A); real CM6 → pending-manual | — |
| REQ-CA-014 highlight while captured/unfocused | 005/016 | TEST-CA-014 (U) | `SelectionHighlightPort.ts:11`; `CaptureSelectionUseCase.ts` (`highlight.show`) | **satisfied** (U); real CM6 paint → pending-manual | — |
| REQ-CA-015 clear on deselection | 016/021 | TEST-CA-015 (U/A); EC-CA-5-clear | `CaptureSelectionUseCase.ts` (null+no-focus→clear); `SelectionIndicator.vue` (clear emit) | **satisfied** | — |
| REQ-CA-016 retain on focus hand-off | 016/025 | TEST-CA-016 (U/A); EC-CA-11 | `CaptureSelectionUseCase.ts` (null+focus→retain); `useCapturedSelection.ts` (focus-within) | **satisfied** | — |
| REQ-CA-017 capture canvas selection | 003/016 | TEST-CA-013 (U) / 017 (M) | `Selection.ts:23`; `CaptureSelectionUseCase.ts`; `MockSelectionPorts.ts` | **satisfied** (U/A); real canvas → pending-manual | — |
| REQ-CA-018 browser selection capability-gate | 005/021/029 | TEST-CA-018b (U/A); EC-CA-7 | `SelectionSourcePort.ts:27` (`supportsBrowserSelection`); `SelectionIndicator.vue:59` (gated `v-if`); bridges ship `false` | **satisfied** (honest defer, parity-accepted) | — |
| REQ-CA-019 selection travels with turn | 001/016 | TEST-CA-019 (U) | `ChatTurn.ts:27-31` (fields); send path **not folded** (`tabsStore.ts:541`) | **not-satisfied** | R-CA-001 |
| REQ-CA-020 open inline-edit on selection | 023/024/026 | TEST-CA-020 (M) | `modalSeam.ts:88`; `main.ts:72-88` (editorCheckCallback, non-empty gate); `inlineEditLauncher.ts:40` | **satisfied** (wiring); real Modal → pending-manual | — |
| REQ-CA-021 one-shot cold-start side-query | 004/013/017 | TEST-CA-021 (U) | `AuxModelPort.ts:29`; `InlineEditUseCase.ts:70`; `ObsidianBridge.ts:189` (cold-start) | **satisfied** (U); real CLI → pending-manual | — |
| REQ-CA-022 parse replacement/insertion/clarify/fail | 012 | TEST-CA-022 (U) | `parseInlineEditResponse.ts:21` | **satisfied** | — |
| REQ-CA-023 word-level diff preview | 011/024 | TEST-CA-023/023b (U/A) | `computeWordDiff.ts:16` → `Diff.ts` `ToolDiffData`; `DiffView` reuse (`InlineEditModal.ts`) | **satisfied** (U/A); DiffView-in-Modal render → pending-manual | — |
| REQ-CA-024 apply accepted edit | 024/026 | TEST-CA-024 (M) | `inlineEditLauncher.ts:56-59` (`editor.replaceSelection`) | **pending-manual** | — |
| REQ-CA-025 reject leaves note unchanged | 024 | TEST-CA-025 (M); EC-CA-13 | `inlineEditLauncher.ts:56` (apply only on `accept`); `InlineEditModal.ts` | **pending-manual** | — |
| REQ-CA-026 clarification continue | 017/024 | TEST-CA-026/026b (U) | `InlineEditUseCase.ts:52-62` (`continue`) | **satisfied** (U); real Modal loop → pending-manual | — |
| REQ-CA-027 failure → notice, no apply, Result.err | 017/024 | TEST-CA-027 (U); EC-CA-8/9 | `InlineEditUseCase.ts:71` (err map); `AuxModelPort.ts` (error/empty/abort→err); `InlineEditModal.ts` (`showError`) | **satisfied** (U); Modal notice → pending-manual | — |
| REQ-CA-028 no provider-id branch | 004/017/029 | TEST-CA-028 (U) | `InlineEditUseCase.ts` (over `AuxModelPort`, no `providerId`); `inlineEditLauncher.ts` | **satisfied** | — |

## Non-functional requirements

| NFR | SPEC-CA | Evidence (`file:line`) | Status | Finding |
|---|---|---|---|---|
| NFR-CA-001 DDD + 3 bridges | 005/006/007/008/009/028 | three ports in `MockBridge`/`LocalStorageBridge`/`ObsidianBridge`; `bridge/ports.ts:62-65` | **satisfied** (Obsidian leg pending-manual M1) | — |
| NFR-CA-002 Vue never imports obsidian | 019/020/021/024 | `FileChips`/`ImageThumb`/`SelectionIndicator`/`ChatSurface` obsidian-free; `inlineEditLauncher.ts` is plugin-layer | **satisfied** | — |
| NFR-CA-003 no v-html/innerHTML/window.* | 023/024/030 | declarative binds; `ImagePreviewModal.ts` `createEl('img')`; no `window.confirm` | **satisfied** | R-CA-008 (P4, split leg) |
| NFR-CA-004 `<script setup>` + Result + pure transforms | 004/014/015/016/017/030 | use cases `Result`-returning; `computeWordDiff`/`parseInlineEditResponse` pure-total | **satisfied** | — |
| NFR-CA-005 PageObjects + data-testid | 019..022 | `FileChips.po.ts`/`ImageContextBar.po.ts`/`ImageThumb.po.ts`/`SelectionIndicator.po.ts`/`ChatComposer.po.ts` | **satisfied** | R-CA-004 (test asserts < title) |
| NFR-CA-006 coverage 80/70/80/80 | 030 | U/A weight present; re-ran suites green | **satisfied** (but see R-CA-004 — green ≠ travel proven) | R-CA-004 |
| NFR-CA-007 `--sp-*` token parity | 027 | `tokens.css §4.12` (8 tokens); `tokens.test.ts` leak guard | **satisfied** (parity screenshots pending-manual M2) | — |
| NFR-CA-008 a11y keyboard/focus/forced-colors | 019/020/021/024 | button-role chips, Enter/Space handlers, `aria-label`s; Modal focus-trap | **satisfied** (Modal a11y pending-manual M2) | — |
| NFR-CA-009 image no-secret / 8 MiB / no data.json | 002/010/015/030 | `AddImageUseCase.ts:42-49` (size-before-encode, 4-field payload); `imageEncode.ts:13` | **satisfied** (unit; live path moot under R-CA-002) | — |
| NFR-CA-010 graceful degrade | 004/005/016/017/030 | total transforms; `ObsidianSelectionPorts.ts` swallows poll error→null | **satisfied** (Obsidian leg pending-manual) | — |
| NFR-CA-011 no new runtime dep | 011 | `computeWordDiff` in-repo DP/LCS; CM6 are externalised devDeps (not bundled) | **satisfied** | — |
| NFR-CA-012 manifest untouched / no migration | — | no `manifest.json` in the diff | **satisfied** | — |
| NFR-CA-013 strings via TranslationPort | — | `en.ts`/`de.ts` `context.*` parity; no hardcoded UI string in components | **satisfied** | — |

## Edge cases (EC-CA)

| EC | Status | Evidence / finding |
|---|---|---|
| EC-CA-1 oversize image | **partial** (unit-green; uncalled) | `AddImageUseCase.test.ts`; R-CA-002 |
| EC-CA-2 non-image `.exe` | **partial** (unit-green; uncalled) | `resolveImageMime`→null; R-CA-002 |
| EC-CA-3 duplicate chip | **partial** (unit-green; no attach path) | `AddFileContextUseCase.test.ts`; R-CA-002 |
| EC-CA-4 remove chip | **satisfied** | `ChatSurface.vue:278` |
| EC-CA-5 empty selection not captured | **satisfied** | `Selection.ts` non-empty rule + capture guard |
| EC-CA-5-clear deselection clears | **satisfied** | `CaptureSelectionUseCase` |
| EC-CA-6 new/loaded conv reset | **not-satisfied** | R-CA-003 |
| EC-CA-7 browser unavailable | **satisfied** | `SelectionIndicator.vue:59` gated |
| EC-CA-8 abort mid-query | **satisfied** (U); Modal abort pending-manual | `AuxModelPort` abort→err; `InlineEditUseCase` |
| EC-CA-9 aux failure/empty | **satisfied** (U) | `InlineEditUseCase.ts:71` |
| EC-CA-10 word-diff identical | **satisfied** | `computeWordDiff.test.ts` |
| EC-CA-11 focus hand-off retain | **satisfied** | `CaptureSelectionUseCase` + `useCapturedSelection` |
| EC-CA-12 transient poll error | **satisfied** (unit recorded); real → pending-manual | `ObsidianSelectionPorts.ts` |
| EC-CA-13 clarify then dismiss | **satisfied** (U); Modal → pending-manual | `InlineEditUseCase`/`InlineEditModal` |
| EC-CA-14 `<script>` verbatim | **partial** | FileChips (TEST-CA-031); modal legs pending-manual; R-CA-008 |
| EC-CA-15 image moved after attach | **satisfied** (snapshot at attach) | `ChatSurface.vue:273-276` data-URI from base64 |
| EC-CA-16 canvas selection none | **satisfied** | capture path null-safe |

## ADR linkage

| ADR | Realised by | Status |
|---|---|---|
| ADR-CA-001 attachment model + base64 transport | `ChatTurn.ts:18-31`, `Attachments.ts`, `imageEncode.ts`, `VaultPort.readBinary` | declared; **send-path fold missing** (R-CA-001) |
| ADR-CA-002 AuxModelPort extract + re-point | `AuxModelPort.ts`, `GenerateTitleUseCase.ts`, `RefineInstructionUseCase.ts`, `ObsidianBridge.ts:189` | **fully realised** |
| ADR-CA-003 selection ports + browser gate | `SelectionSourcePort.ts`, `SelectionHighlightPort.ts`, `ObsidianSelectionPorts.ts` (`false`) | **realised** (capture path); real CM6/canvas pending-manual |
| ADR-CA-004 inline-edit seam + word diff → DiffView | `modalSeam.ts`, `InlineEditModal.ts`, `computeWordDiff.ts`, `parseInlineEditResponse.ts` | **realised** (unit/wiring); Modal render pending-manual |

## Orphan check

- **Orphan code:** `AddImageUseCase` (`src/application/chat/attachments/AddImageUseCase.ts`)
  and `AddFileContextUseCase.add` have NO production/standalone call site — they trace to
  REQ-CA-001/002/007/012 by intent but are unreachable on a shipped surface (R-CA-002).
  `AddFileContextUseCase.remove` IS wired (`ChatSurface.vue:279`).
- **Orphan tests:** none — every TEST-CA maps to ≥1 REQ-CA and a code anchor.
- **Orphan ADRs:** none — all four ADR-CA map to realised (or partially-realised) code.
- **REQs with no downstream chain:** none structurally; but REQ-CA-001/004/006/007/010/019
  have a broken chain at the **code/test** link (declared+unit, no live behaviour) — recorded
  as not-satisfied above (R-CA-001/002/003/004), the gating defects for this stage.

## Pending-manual legs (human review gate — NOT agent-claimed)

TEST-CA-M1 (3 ObsidianBridge ports end-to-end), TEST-CA-M2 (the two Modals render/dismiss +
parity screenshots), TEST-CA-M3 (real `readBinary`), TEST-CA-017 (real CM6/canvas capture),
TEST-CA-024/025 (accept replaces / reject leaves note), TEST-CA-029 (real-CLI image turn).
These ride the single final human review gate per the autonomous-drive directive.
