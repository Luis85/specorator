---
id: REVIEW-CA-001
title: Context & Attachments (P5) — Stage-9 review
stage: review
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
status: complete
owner: reviewer
integration_branch: next
reference: D:\Projects\claudian-main
base: 88f9810
created: 2026-05-25
updated: 2026-05-25
---

# Review — Context & Attachments (P5)

## Verdict

**Changes requested.**

The feature is well-architected and the *inline-edit*, *selection-capture*, and the
*AuxModelPort re-point* sub-surfaces are correctly and verifiably implemented (every
automated test I re-ran is green). But two of the four §3.4 jobs in the PRD's own North
Star — *pin files* and *attach + preview an image* — have **no end-to-end path**: there is
no attach affordance, the `AddImageUseCase` is never called from production or standalone
wiring, and on submit the composer/store sends **text only** — attached files, images, and
the captured selection are never folded into the `ChatTurnRequest`, and the sets are never
cleared. That is a direct contract miss against REQ-CA-001/004/007/010/019 (all `must`),
which the PRD release criteria require to pass acceptance before ship. The send-path gap is
also masked by a test whose title claims more than it asserts (TEST-CA-004).

Counts: **2 P1**, **4 P2**, **4 P3**, **3 P4**.

Scope reminder: the coverage-excluded Obsidian/CM6/canvas/binary/Modal/real-CLI legs
(TEST-CA-M1/M2/M3 + TEST-CA-017/024/025/029) are HUMAN manual legs and are recorded
**pending-manual** in `traceability.md` — they are NOT counted as defects and NOT marked
green here.

---

## 1. Correctness vs spec

### P1 findings (blocking)

**R-CA-001 (P1) — Attached files / images / selection never travel with the submitted
turn; the sets never clear.** `src/ui/chat/ChatSurface.vue:308-310` `onSubmit(text)` calls
`tabs.sendMessage(text)`, and `src/ui/stores/tabsStore.ts:521-541` builds
`request: { text, currentNotePath }` — the five additive `ChatTurnRequest` context fields
(`attachedFiles`/`images`/`editorSelection`/`canvasSelection`/`browserSelection`) are never
populated, and the `attachedFiles`/`images`/`capturedSelection` sets are never cleared
after submit. This violates **REQ-CA-004** (files travel + clear), **REQ-CA-010** (images
travel + clear), and **REQ-CA-019** (selection travels) — all `must`. The contract was
planned in `tasks.md:963/984` ("on submit the parent folds the present sets into the
`ChatTurnRequest` and clears them") but T-CA-041 shipped a composer that only re-emits
`submit: [text]` (`src/ui/chat/ChatComposer.vue:114`). SPEC-CA-001's whole purpose — the
regrown reserved fields actually carrying context — is unrealised on the live path.
*Owner: dev.* Fix: thread the present context sets into the `sendMessage` request (extend
`tabsStore.sendMessage` additively to accept the context, or assemble the request in
`ChatSurface`), and clear the sets on a successful submit.

**R-CA-002 (P1) — No attach affordance; `AddImageUseCase` is dead code at the wiring
layer.** A repo-wide search shows `AddImageUseCase.execute` is never invoked outside its
own unit test, and `AddFileContextUseCase.add` is never called in `src/` (only `.remove`
runs, at `src/ui/chat/ChatSurface.vue:279-280`). `attachedFiles`/`images` are initialised
to `[]` and can only ever shrink. There is therefore no path to satisfy **REQ-CA-001**
(attach a vault file as a chip), **REQ-CA-002** (idempotent re-attach — untestable end to
end), **REQ-CA-007** (attach an image), or **REQ-CA-012** (reject oversize/non-image with
a notice) on any shipped surface. `AddImageUseCase` + its gate (clean and unit-tested) is
real, but nothing calls it. *Owner: dev.* Fix: wire an attach affordance (file picker /
@-pick / drop) that calls `AddFileContextUseCase.add` and `AddImageUseCase.execute`, surfaces
the `NotificationPort.showWarning` on a rejected image (REQ-CA-012), and pushes the result
into the per-tab sets.

> R-CA-001 and R-CA-002 together mean two of the four PRD North-Star jobs (pin files,
> attach + preview an image) cannot be completed on the rebuilt surface — the PRD's own
> §Success-metrics acceptance and §Release-criteria first checkbox are not met.

### P2 findings (major)

**R-CA-003 (P2) — REQ-CA-006 reset-on-new/loaded-conversation is not wired.**
`dispatchBuiltIn('new')` (`src/ui/chat/ChatSurface.vue:223-225`) opens a tab but never
resets `attachedFiles.value`/`images.value`/the captured selection; there is no
loaded-conversation reset either. `tasks.md` and `spec.md §9` claim REQ-CA-006 is covered
by SPEC-CA-022 / TEST-CA-006, but TEST-CA-006 is folded into the ChatComposer slot test set
and only asserts hidden-when-empty, not a reset on conversation change. Largely moot today
because the sets start empty (R-CA-002), but it is a specified `should` with claimed
coverage that does not hold. *Owner: dev.*

**R-CA-004 (P2) — TEST-CA-004 asserts less than its spec title claims (test-quality
defect masking R-CA-001).** `spec.md:925/979` and `tasks.md:973` describe TEST-CA-004 as
"attached files travel with the turn + the set clears on submit". The actual test
(`tests/ui/chat/ChatComposer.test.ts:202-207`, "the P1 send path is unchanged with context
present") only asserts `submit` still emits `['Hello']` — it never asserts the request
carries `attachedFiles` nor that the set clears. The travel-and-clear acceptance for
REQ-CA-004/010/019 has **no executing assertion** anywhere in the suite, so the green bar
gave false confidence. *Owner: qa.* Fix: add an assertion that the submitted request carries
the context and that the sets clear (this test will go RED until R-CA-001 is fixed — which
is the point).

## 2. Behaviour-preserving re-point (SPEC-CA-018, ADR-CA-002) — PASS

`GenerateTitleUseCase.ts` and `RefineInstructionUseCase.ts` re-point cleanly onto
`AuxModelPort`: the `prepareTurn` + drain loop and the `*StreamOutcome` interfaces are
deleted; each body is a single `aux.run(prompt, { systemPrompt })`; the outcome map
(`parse* → ok/err`) is unchanged; neither surfaces `NotificationPort.showError`; both are
`Result`-returning with no `providerId` branch; the pure transforms (`titleGeneration.ts`,
`instructionRefine.ts`) are untouched. I re-ran `GenerateTitleUseCase.test.ts` +
`RefineInstructionUseCase.test.ts` — green. No dead `ChatRuntimePort` side-query code
remains in either file. This is the strongest part of the change.

## 3. Additivity / no-regression (SPEC-CA-028) — PASS (with one nit)

`ChatTurnRequest` grows by five optional fields only; `text`/`currentNotePath`,
`PreparedChatTurn`, `ChatRuntimeQueryOptions`, `ChatRuntimeEnsureReadyOptions` are
byte-identical (`src/domain/chat/ChatTurn.ts`). `VaultPort.readBinary` is appended; the
seven P0–P4 members are unchanged. The three new ports + keys + barrels are purely additive.
The P5 injects in `ChatSurface`/`ChatComposer` are all optional, so P1–P4 mounts stay
behaviour-identical (the context bar is `v-if="hasContext"`, hidden when empty — verified
green). See R-CA-009 (P4) for the irony that the additive fields, while correctly declared,
are never written on the live path.

## 4. Architecture — PASS

- DDD inward layering holds: domain DTOs/ports are pure (no `obsidian`/`node:*`/Vue);
  `obsidian` appears only under `src/infrastructure/obsidian/**` (`ObsidianBridge`,
  `ObsidianSelectionPorts`) and `src/plugin/**` (`inlineEditLauncher.ts`, the two modals,
  `main.ts`, `AgentSidebarView.ts`). The application→infra import of `imageEncode`
  (`AddImageUseCase`) is the sanctioned exception (SPEC-CA-010).
- Narrow-port discipline holds: `AuxModelPort`, `SelectionSourcePort`,
  `SelectionHighlightPort` are three segregated ports with their own keys + composables; no
  aggregate. `VaultPort.readBinary` rides the existing vault-IO port (no `AttachmentPort`
  minted) — correct per ADR-008.
- No `v-html`/`innerHTML`: `FileChips`/`ImageThumb`/`SelectionIndicator` bind declaratively
  (`:title`, `:src`, `{{ }}`); `ImagePreviewModal` uses `createEl('img', {attr:{src}})`;
  no `window.confirm/alert/prompt`. (NFR-CA-003 PASS — though see R-CA-008 P3 on the
  untested EC-CA-14 leg in the wired path.)
- PageObjects + `data-testid`: every new mounted `.vue` has a co-located `.po.ts`.
- i18n: `en.ts`/`de.ts` carry the full `agent.chat.context.*` group in parity; no hardcoded
  user-facing string in the components (NFR-CA-013 PASS). Launcher labels are literal English
  (documented out-of-scope, parity with the existing fork/delete launchers).

## 5. Parity gaps (vs `D:\Projects\claudian-main`)

- **File-context chips + wikilink row** — the chip render is faithful (basename `displayName`,
  `[[path]]` wikilink form on `:title`, open via `WorkspacePort`). But the behaviour Claudian's
  `FileContextState.attachFile`/`clearAttachments` provide (attach + travel + clear) is **not
  reachable** (R-CA-001/R-CA-002). Perceptual chip = parity; behavioural attach/send = missing.
- **Image thumbnail bar + full-size modal** — `ImageThumb`/`ImageContextBar`/`ImagePreviewModal`
  reproduce the thumbnail + modal affordances; the base64-at-attach snapshot (EC-CA-15) is the
  right call. But the attach + embed-into-turn half (`ImageContext.ts` send path) is missing
  (R-CA-002/R-CA-001). Modal render is a pending-manual leg (TEST-CA-M2).
- **Selection indicator + in-editor highlight** — strong parity: editor + canvas capture, the
  250 ms poll, focus-hand-off retain (EC-CA-11), highlight show/clear, and the honest
  `supportsBrowserSelection:false` defer (REQ-CA-018, an explicitly-permitted parity-acceptable
  divergence). Selection-travels-with-turn is the one gap (R-CA-001/REQ-CA-019). Real CM6/canvas
  capture is pending-manual (TEST-CA-017).
- **Inline edit → querying → word-diff → accept/reject** — closest parity of the four. The
  Prompt→Querying→Preview/Clarify/Failed state machine, the cold-start aux one-shot, the pure
  `parseInlineEditResponse`, the word-level `computeWordDiff` feeding the UNCHANGED `DiffView`,
  the clarification `continue` loop, and the `editor.replaceSelection` apply are all wired and
  unit-green. Two intentional, defensible divergences: (a) `computeWordDiff` emits one
  `DiffLine` per token and does **not** coalesce consecutive same-type ops (Claudian's
  `InlineEditModal.ts:171` coalesces) — accept (word-granular acceptance holds; renderer is the
  DiffView, which tolerates per-token rows); (b) `INLINE_EDIT_SYSTEM_PROMPT` drops Claudian's
  `Today is …` date interpolation + cursor-mode sections to keep the prompt pure/total — accept
  (documented, SPEC-CA-013). Modal render + note-write are pending-manual (TEST-CA-M2/024/025).

One-line per sub-surface: **A (file chips) — partial (display parity, attach/send missing).
B (image) — partial (display parity, attach/embed missing). C (selection) — strong (travel-on-
submit gap). D (inline edit) — strong (manual legs pending).**

## 6. Risks / NFRs

- NFR-CA-009 (image no-secret / 8 MiB / no `data.json`) — the `AddImageUseCase` payload is
  `{path, mimeType, byteSize, dataBase64}` only; gate order is MIME→read→size→encode (size
  measured before encode). PASS at the unit level; the live-path no-secret invariant is moot
  while R-CA-002 stands.
- NFR-CA-010 (graceful degrade) — pure transforms total; use cases `Result`-returning; the
  Obsidian selection poll swallows transient errors → `null`. PASS (Obsidian leg pending-manual).
- NFR-CA-006/005 (coverage + PageObjects) — the U/A weight is present; do not read the green
  coverage bar as proof of REQ-CA-001/004/007/010/019 (R-CA-001/002/004).
- The `@codemirror/state`/`@codemirror/view` devDependency additions (T-CA-014) are
  Obsidian-provided externals already in `ALL_EXTERNALS`, not bundled — not a new runtime dep
  (NFR-CA-011 holds); reasonable, but a release-time `npm audit`/bundle check is worth a glance.

## 7. P3 / P4 findings (brief)

- **R-CA-005 (P3)** — `workflow-state.md` (and T-CA-044 deviation 4) misattribute the
  attach-affordance + turn-threading to "store-set tasks T-CA-033/034"; those tasks built the
  `ImageContextBar`/`ImageThumb` display components, not attach/threading. No task in the
  48-task plan actually owns the attach affordance or the send-path fold — the gap was lost in
  the hand-off narrative, not consciously deferred. *Owner: planner/dev.*
- **R-CA-006 (P3)** — `spec.md §9` and `tasks.md:1344` list REQ-CA-004 as covered by
  T-CA-040/041 and REQ-CA-006 by SPEC-CA-022; given R-CA-001/R-CA-003 the coverage table
  overstates done-ness. Refresh after the fix. *Owner: planner.*
- **R-CA-007 (P3)** — the standalone demo (`src/ui/main.ts`) provides the ports but, lacking
  an attach affordance, can never exercise file/image attach interactively; the deferred
  "live `npm run dev`" leg in `test-plan.md` will stay un-runnable until R-CA-002. Note it so
  the human reviewer does not expect it to work. *Owner: qa.*
- **R-CA-008 (P4)** — EC-CA-14 (`<script>`/raw HTML rendered verbatim) is asserted for
  `FileChips` (TEST-CA-031) but the image-`alt`/inline-edit-preview legs of EC-CA-14 ride the
  coverage-excluded modal (pending-manual); fine, just flagging the split. *Owner: qa.*
- **R-CA-009 (P4)** — the five additive `ChatTurnRequest` fields are declared and type-tested
  but never written on the live path (consequence of R-CA-001); once R-CA-001 lands they become
  live. No action beyond R-CA-001. *Owner: dev.*
- **R-CA-010 (P4)** — `encodeImageBase64` takes `_mimeType` only for caller-contract clarity
  (unused in the byte fold). Harmless; consider dropping the param or documenting at the call
  site. *Owner: dev.*

## 8. Quality-metrics evidence

`specorator quality:metrics` was not run (no evidence it is wired for this worktree; the
review relies on the re-run automated suite below as deterministic evidence). I re-ran, all
green: `GenerateTitleUseCase`, `RefineInstructionUseCase`, `InlineEditUseCase`,
`computeWordDiff`, `AddImageUseCase` (40/40); `ChatComposer`, `FileChips`, `attachmentsMount`,
`useCapturedSelection` (37/37). The green bar is real for what is tested; the gap is what is
**not** tested (R-CA-004). Per the env note, the standalone-mount 5000 ms timeouts are a
known load flake (pass at `--testTimeout=30000`), not regressions — not logged as defects.

## 9. What must change before merge (P1/P2 only)

1. **R-CA-001 (P1)** — fold `attachedFiles`/`images`/`editorSelection`/`canvasSelection`/
   `browserSelection` into the submitted `ChatTurnRequest` and clear the sets on submit
   (`ChatSurface.vue:308`, `tabsStore.ts:521`). REQ-CA-004/010/019.
2. **R-CA-002 (P1)** — wire an attach affordance calling `AddFileContextUseCase.add` +
   `AddImageUseCase.execute`, with the oversize/non-image warning. REQ-CA-001/002/007/012.
3. **R-CA-003 (P2)** — reset the context sets on new/loaded conversation
   (`ChatSurface.vue:223`). REQ-CA-006.
4. **R-CA-004 (P2)** — make TEST-CA-004 assert travel-and-clear (will RED until R-CA-001).
   SPEC-CA-022 / NFR-CA-005/006.

After 1–4 land, the verdict can move to *approve-with-conditions* pending the human manual
legs (TEST-CA-M1/M2/M3, TEST-CA-017/024/025/029 + parity screenshots).
