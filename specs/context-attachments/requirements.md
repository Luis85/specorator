---
id: PRD-CA-001
title: Context & Attachments (Claudian Reboot P5)
stage: requirements
feature: context-attachments
status: draft        # held until the architect's P5 ADRs resolve CLAR-CA-001..004
owner: pm
inputs:
  - CHARTER-CLAUDIAN-REBOOT §3.4 / §4 (P5) / §5 / §6
  - specs/claudian-reboot/claudian-audit-frontend.md
  - specs/claudian-reboot/claudian-audit-backend.md
  - D:\Projects\claudian-main (read-only structural + visual reference, MIT)
created: 2026-05-25
updated: 2026-05-25
epic: claudian-reboot
phase: P5
area: CA
---

# PRD — Context & Attachments (Claudian Reboot P5)

## Summary

P5 enriches the P1–P4 chat surface so a Specorator user can attach **context** to a
turn and run an **inline edit** against a note — reproducing the Claudian "context
footer" experience inside the Specorator architecture (Vue 3 SFC + DDD + narrow ports
+ three bridges). Four sub-surfaces: (1) **file context chips** — pin vault files as
removable chips on the composer; (2) **image context** — attach and preview images,
embed them in the turn; (3) **external/selection context** — capture an editor, canvas,
or (capability-permitting) browser selection as turn context with a selection
highlight; (4) **inline edit** — select text in a note, ask for an edit, preview a
**word-level diff**, and apply it through an Obsidian `Modal` launched via the existing
`modalSeam`. The `@mention` of files already shipped in P4; P5 is the richer
chip/attachment + selection + inline-edit layer, not a re-spec of `@mention`. Now,
because P1–P4 produced the composer, `ChatTurnRequest`, the diff renderer, the
side-query pattern, and the modal seam this layer builds on are all in place on `next`.

This is a **parity PRD**: each functional requirement maps 1:1 to a Claudian source
path (the behaviour spec) and a Given/When/Then acceptance, per charter §5.

## Goals

- G1 — Reach Claudian §3.4 feature parity for context & attachments on the rebuilt
  chat surface (file chips, image context, selection-as-context, inline edit + word
  diff), within the epic's architecture/security/a11y constraints.
- G2 — Attach context to a turn **additively** — the P1 `ChatTurnRequest.text` send
  path stays byte-identical when no context is attached (the deferred fields in
  `ChatTurn.ts:12-13` regrow here).
- G3 — Reuse the P2 diff **renderer** (`DiffView`) for the inline-edit preview and the
  P3/P4 cold-start side-query pattern for the inline-edit one-shot query, adding no new
  bespoke rendering or side-query plumbing where an existing seam fits.
- G4 — Build the **seams** (selection-source capture, inline-edit service, context
  attach) so P9's Codex/Opencode inline-edit services and later phases slot in without
  reshaping P5 contracts; P5 wires **only Claude**.
- G5 — Keep every Obsidian-coupled surface (selection capture, inline-edit modal,
  image resource resolution) behind a narrow port or the plugin-owned modal seam so the
  Vue layer never imports `obsidian`.

## Non-goals

- NG1 — **Toolbar widget selectors + usage/context meter** (model/mode/permission/
  thinking/service-tier/MCP selectors, external-context control strip). → **P6**
  (charter §3.5 / §4). P5 captures selection context but does not build the toolbar
  control strip that toggles it.
- NG2 — **Approval rules + permission persistence** (ApprovalManager). → **P7**.
- NG3 — **MCP client/servers** (in-app MCP context). → **P8**. The `mentionedMcpServers`
  half of Claudian's `FileContextState` is out; P5 ports only the **file attachment**
  half.
- NG4 — **Codex / Opencode providers and their inline-edit services**
  (`ClaudeInlineEditService` is the only one wired; the Codex/Opencode counterparts are
  P9). P5 builds the inline-edit **seam**; only Claude is wired behind it.
- NG5 — **Settings UX** for any P5 surface (e.g. a media-folder setting, selection
  toggles). → **P10**. P5 reads any needed config as a load-or-default constant.
- NG6 — **Re-spec of P4 `@mention`.** `@mention` of vault files / subagents / MCP /
  external dirs shipped in P4 (charter §3.3). P5 does not change the `@mention` trigger,
  dropdown, or parse; it adds chips/attachments/selection/inline-edit alongside it.
- NG7 — **i18n of all 10 locales** for new P5 strings beyond the project default-locale
  baseline. → **P11** (charter §4). New strings go through the existing `TranslationPort`
  with English keys; full-locale parity is P11.
- NG8 — **Rich message-body file-link / image-embed rewriting in rendered assistant
  output** beyond what P2 message rendering already does — P5 covers the **composer-side**
  file-link format and image embed-into-turn, not a rewrite of the P2 `MessageRenderer`.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| **Note-taker / knowledge worker** (primary Specorator + Claudian user) | Pin the files and images relevant to a question, and edit a passage in place without leaving the note | This is the core "the chat knows what I'm looking at" affordance that makes the assistant feel embedded in the vault |
| **Returning Claudian user** | Recognise the context footer, chips, image preview, and inline-edit flow as "the same product" | Charter §1 binding goal — a side-by-side reads as the same product |
| **Architect (downstream, P5 design)** | Clear options + constraints for the attachment model, selection ports, AuxModelPort extraction, and the diff-reuse seam, decided in ADRs | P5 is autonomous-drive; the PRD must hand the architect well-framed decisions, not guesses |
| **Reviewer / brand-reviewer (P5 review)** | Per-surface parity checklist mapped to Claudian source + `--sp-*` tokens | Charter §5 parity acceptance method |
| **Accessibility-dependent user** | Keyboard-operable chips, image modal, and inline-edit accept/reject; forced-colors + reduced-motion | WCAG 2.2 AA is a charter bounding constraint |

## Jobs to be done

- When **I'm asking about several notes at once**, I want to **pin them as context chips
  on the composer and remove ones I don't need**, so I can **scope the assistant's
  context without pasting paths**.
- When **a screenshot or diagram explains my question better than words**, I want to
  **attach an image, see it previewed, and have it travel with the turn**, so I can
  **ask about visual content**.
- When **I've highlighted a passage in a note (or nodes on a canvas)**, I want to
  **send that selection as context with a visible highlight**, so I can **ask "about
  this" without copy-pasting**.
- When **a sentence in my note needs rewording**, I want to **select it, type an
  instruction, preview a word-level diff, and accept or reject**, so I can **edit in
  place with confidence**.

## Functional requirements (EARS)

> EARS notation (`docs/ears-notation.md`). One requirement per entry. Each maps 1:1 to a
> Claudian source path (behaviour spec) + a Given/When/Then acceptance (test seed).
> Patterns: ubiquitous · event-driven (WHEN) · state-driven (WHILE) · optional-feature
> (WHERE) · unwanted-behaviour (IF/THEN). "the plugin" = the Specorator agent surface.

### Sub-surface A — File context chips

Claudian sources: `features/chat/ui/FileContext.ts`,
`features/chat/ui/file-context/state/FileContextState.ts`,
`features/chat/ui/file-context/view/FileChipsView.ts`, `utils/fileLink.ts`.

---

### REQ-CA-001 — Attach a vault file as a context chip

- **Pattern:** event-driven
- **Statement:** *WHEN the user attaches a vault file to the composer, the plugin SHALL
  add the file's vault-relative path to the turn's attached-file set and render a removable
  chip for it.*
- **Acceptance:**
  - Given the composer is focused and the attached-file set does not contain `notes/a.md`
  - When the user attaches `notes/a.md`
  - Then a chip labelled with the file's display name appears in the context row and the
    attached-file set contains `notes/a.md` exactly once
- **Priority:** must
- **Satisfies:** CHARTER §3.4 (file context / chips); claudian `FileContextState.attachFile` (`:48`)

### REQ-CA-002 — Attaching an already-attached file is idempotent

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user attaches a vault file whose path is already in the attached-file
  set, THEN the plugin SHALL leave the set and chips unchanged and SHALL NOT render a duplicate
  chip.*
- **Acceptance:**
  - Given the attached-file set already contains `notes/a.md` with one chip shown
  - When the user attaches `notes/a.md` again
  - Then the attached-file set still contains exactly one entry for `notes/a.md` and exactly one
    chip is shown
- **Priority:** must
- **Satisfies:** claudian `FileContextState` (Set semantics, `:1/:48`)

### REQ-CA-003 — Remove a context chip

- **Pattern:** event-driven
- **Statement:** *WHEN the user removes a context chip, the plugin SHALL delete that file's path
  from the attached-file set and remove its chip from the context row.*
- **Acceptance:**
  - Given `notes/a.md` and `notes/b.md` are attached with two chips shown
  - When the user removes the `notes/a.md` chip
  - Then the attached-file set contains only `notes/b.md` and only the `notes/b.md` chip remains
- **Priority:** must
- **Satisfies:** claudian `FileContextState.detachFile` (`:52`)

### REQ-CA-004 — Attached files travel with the turn as context

- **Pattern:** event-driven
- **Statement:** *WHEN the user submits a turn while one or more files are attached, the plugin
  SHALL include those files' vault-relative paths in the submitted turn's context and SHALL clear
  the attached-file set for the next turn.*
- **Acceptance:**
  - Given `notes/a.md` is attached
  - When the user submits the turn
  - Then the submitted turn carries `notes/a.md` as attached context (per the CLAR-CA-001
    attachment model) and the composer's attached-file set is empty afterward
- **Priority:** must
- **Satisfies:** CHARTER §3.4; claudian `FileContext` send-path + `FileContextState.clearAttachments` (`:56`)
- **Note:** the exact field on the request is **CLAR-CA-001** (architect ADR).

### REQ-CA-005 — Render a vault wikilink as a clickable file link in the composer context row

- **Pattern:** state-driven
- **Statement:** *WHILE a context chip references a vault file, the plugin SHALL present it as a
  file link in the Obsidian wikilink format and SHALL open the referenced file in the workspace
  when the link is activated.*
- **Acceptance:**
  - Given a chip for `folder/note.md` exists in the context row
  - When the user activates the chip's file link
  - Then the plugin opens `folder/note.md` in the workspace via `WorkspacePort.openFile`
- **Priority:** should
- **Satisfies:** claudian `utils/fileLink.ts` (wikilink format + open-on-click, `:146/:209`)
- **Note:** Claudian opens via `app.workspace.openLinkText`; P5 routes through `WorkspacePort`
  (Vue-no-obsidian, NFR-CA-002). The wikilink **format** is reproduced; the message-body
  rewrite walker (`processFileLinks`) is NG8 (composer-side only here).

### REQ-CA-006 — Reset attached files on a new or loaded conversation

- **Pattern:** event-driven
- **Statement:** *WHEN a new conversation starts or an existing conversation is loaded into a
  tab, the plugin SHALL clear the attached-file set for that tab.*
- **Acceptance:**
  - Given `notes/a.md` is attached in the current tab
  - When the user starts a new conversation (or loads a different conversation)
  - Then the attached-file set is empty and no chips are shown
- **Priority:** should
- **Satisfies:** claudian `FileContextState.resetForNewConversation` / `resetForLoadedConversation` (`:27/:34`)

---

### Sub-surface B — Image context / embed / modal

Claudian sources: `features/chat/ui/ImageContext.ts`, `utils/imageEmbed.ts`,
image-modal (`features/image-*` css), `utils/inlineEdit.escapeHtml`.

---

### REQ-CA-007 — Attach an image as turn context

- **Pattern:** event-driven
- **Statement:** *WHEN the user attaches an image to the composer, the plugin SHALL add the image
  to the turn's image-context set and render a thumbnail preview chip for it.*
- **Acceptance:**
  - Given the composer is focused
  - When the user attaches an image (`diagram.png`)
  - Then a thumbnail preview chip for `diagram.png` appears in the context row and the
    image-context set contains it
- **Priority:** must
- **Satisfies:** CHARTER §3.4 (image context / embed); claudian `ImageContext.ts`

### REQ-CA-008 — Preview an attached image in a modal

- **Pattern:** event-driven
- **Statement:** *WHEN the user opens an attached image's preview, the plugin SHALL display the
  image full-size in an Obsidian modal launched through the plugin-owned modal seam.*
- **Acceptance:**
  - Given an image thumbnail chip is shown
  - When the user opens its preview
  - Then a modal shows the full-size image and is dismissable by Escape and by an explicit close
    control
- **Priority:** should
- **Satisfies:** claudian image-modal; modal launched via the P4 `modalSeam` pattern (NFR-CA-003)

### REQ-CA-009 — Remove an attached image

- **Pattern:** event-driven
- **Statement:** *WHEN the user removes an image preview chip, the plugin SHALL delete that image
  from the image-context set and remove its thumbnail from the context row.*
- **Acceptance:**
  - Given two images are attached with two thumbnails shown
  - When the user removes one
  - Then the image-context set contains one image and one thumbnail remains
- **Priority:** must
- **Satisfies:** claudian `ImageContext.ts` (remove path)

### REQ-CA-010 — Embed attached images into the submitted turn

- **Pattern:** event-driven
- **Statement:** *WHEN the user submits a turn while one or more images are attached, the plugin
  SHALL include those images in the submitted turn's image context and SHALL clear the image-context
  set for the next turn.*
- **Acceptance:**
  - Given one image is attached
  - When the user submits the turn
  - Then the submitted turn carries the image (per the CLAR-CA-001 transport decision) and the
    image-context set is empty afterward
- **Priority:** must
- **Satisfies:** CHARTER §3.4; claudian `utils/imageEmbed.ts` (display) + `ChatTurnRequest.images` (deferred field, `ChatTurn.ts:12`)
- **Note:** image **transport** (base64 inline vs vault-path reference) is **CLAR-CA-001**.

### REQ-CA-011 — Render an image embed in the composer preview without raw HTML

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL render every image preview through declarative Vue bindings and
  an Obsidian-resolved resource path, and SHALL NOT assign `innerHTML`/`outerHTML` or use `v-html`.*
- **Acceptance:**
  - Given an image preview is rendered
  - When the preview DOM is inspected
  - Then the `<img>` source is an Obsidian resource path bound declaratively and no `v-html`/
    `innerHTML` assignment exists in the component
- **Priority:** must
- **Satisfies:** claudian `imageEmbed.createImageHtml` reproduces the *behaviour* but our renderer
  drops the raw-HTML string build (CLAUDE.md DOM rules, NFR-CA-002/004)

### REQ-CA-012 — Reject oversize or non-image attachments

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the user attaches a file that is not a supported image type or exceeds the
  image size limit, THEN the plugin SHALL decline the attachment and surface a non-blocking notice
  via `NotificationPort`, without adding it to the image-context set.*
- **Acceptance:**
  - Given the user attaches a `12 MB` `.exe` (or an image above the size limit)
  - When the attachment is processed
  - Then no thumbnail is added, the image-context set is unchanged, and a warning notice is shown
- **Priority:** should
- **Satisfies:** claudian `imageEmbed.IMAGE_EXTENSIONS` allow-list (`:15`); NFR-CA-009 (size/no-secret transport)

---

### Sub-surface C — External / selection context

Claudian sources: `features/chat/controllers/SelectionController.ts`,
`CanvasSelectionController.ts`, `BrowserSelectionController.ts`,
`shared/components/SelectionHighlight.ts`.

---

### REQ-CA-013 — Capture an editor selection as turn context

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects text in an Obsidian editor and that selection is non-empty,
  the plugin SHALL capture it as editor-selection context recording the note path, the selected
  text, the start line, and the line count.*
- **Acceptance:**
  - Given a markdown note is open and the user selects a 3-line passage starting at line 10
  - When the selection is captured
  - Then the selection context records `{ notePath, selectedText, startLine: 10, lineCount: 3 }`
- **Priority:** must
- **Satisfies:** CHARTER §3.4; claudian `SelectionController.poll` / `getContext` (`:79/:377`)
- **Note:** capture source is an `EditorSelectionPort` (charter §6c) — **CLAR-CA-002**.

### REQ-CA-014 — Show a selection highlight while a selection is captured and the editor is unfocused

- **Pattern:** state-driven
- **Statement:** *WHILE an editor selection is captured and the editor's native selection is not
  visible, the plugin SHALL display a selection highlight over the captured range in the source
  editor.*
- **Acceptance:**
  - Given a passage is captured as context and focus has moved to the composer
  - When the highlight state is evaluated
  - Then a selection highlight marks the captured range in the source editor
- **Priority:** should
- **Satisfies:** claudian `SelectionHighlight.showSelectionHighlight` (`:71`); `SelectionController.showHighlight` (`:311`)

### REQ-CA-015 — Clear a captured selection when the selection is dropped

- **Pattern:** event-driven
- **Statement:** *WHEN a captured selection is deselected and focus is not within the chat surface,
  the plugin SHALL clear the captured selection context and remove its highlight.*
- **Acceptance:**
  - Given a passage is captured and the composer is not focused
  - When the user clears the selection in the editor
  - Then the captured selection context is null and the highlight is removed
- **Priority:** should
- **Satisfies:** claudian `SelectionController.handleDeselection` / `clear` (`:290/:396`)

### REQ-CA-016 — Preserve a captured selection during hand-off to the composer

- **Pattern:** state-driven
- **Statement:** *WHILE focus transitions from the source editor into the chat surface, the plugin
  SHALL retain the captured selection context rather than dropping it as a deselection.*
- **Acceptance:**
  - Given a passage is captured and the user clicks into the composer
  - When focus leaves the editor for the chat surface
  - Then the captured selection context is retained
- **Priority:** should
- **Satisfies:** claudian `SelectionController.isFocusWithinChatSidebar` + input-handoff grace (`:246/:31`)

### REQ-CA-017 — Capture a canvas node selection as turn context

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects one or more nodes in an Obsidian canvas, the plugin SHALL
  capture them as canvas-selection context recording the canvas path and the selected node ids.*
- **Acceptance:**
  - Given a canvas is open and two nodes are selected
  - When the selection is captured
  - Then the selection context records `{ canvasPath, nodeIds: [id1, id2] }`
- **Priority:** should
- **Satisfies:** CHARTER §3.4; claudian `CanvasSelectionController.poll` / `getContext` (`:55/:126`)
- **Note:** the `canvas` mock already exists in `tests/__fakes__/fake-ports.ts`; capture source
  is **CLAR-CA-002**.

### REQ-CA-018 — Capture a browser selection only where a browser-like view exposes a selection

- **Pattern:** optional-feature
- **Statement:** *WHERE a browser-like view exposes a readable text selection, the plugin SHALL
  capture it as browser-selection context recording the source, the selected text, and (when
  available) the title and url.*
- **Acceptance:**
  - Given a browser-like view with a selectable text region is active and the capability is present
  - When the selection is captured
  - Then the selection context records `{ source, selectedText, title?, url? }`
  - And given no browser-like view (or no capability) is present, no browser-selection context is
    captured and no error surfaces
- **Priority:** could
- **Satisfies:** claudian `BrowserSelectionController` (`:51/:283`)
- **Note:** browser capture relies on `webview.executeJavaScript` / `iframe.contentDocument`
  (Electron/webview-specific). Whether P5 ships, capability-gates, or defers this leg is
  **CLAR-CA-002**; PM recommends **capability-gate behind the selection port, ship editor + canvas,
  defer browser to a follow-up if the embedded-webview path proves infeasible in the bridge**.

### REQ-CA-019 — Selection context travels with the turn

- **Pattern:** event-driven
- **Statement:** *WHEN the user submits a turn while a selection is captured, the plugin SHALL
  include the captured selection in the submitted turn's context.*
- **Acceptance:**
  - Given an editor selection is captured
  - When the user submits the turn
  - Then the submitted turn carries the editor selection (per the CLAR-CA-001 attachment model)
- **Priority:** must
- **Satisfies:** CHARTER §3.4; `ChatTurnRequest` deferred `editorSelection`/`canvasSelection`/
  `browserSelection` fields (`ChatTurn.ts:12-13`)

---

### Sub-surface D — Inline edit + word-level diff

Claudian sources: `features/inline-edit/ui/InlineEditModal.ts`, `core/prompt/inlineEdit.ts`,
`utils/inlineEdit.ts`, `core/auxiliary/QueryBackedInlineEditService.ts`,
`providers/claude/auxiliary/ClaudeInlineEditService.ts`.

---

### REQ-CA-020 — Open the inline-edit flow for a note selection

- **Pattern:** event-driven
- **Statement:** *WHEN the user invokes inline edit on a non-empty note selection, the plugin SHALL
  open an inline-edit prompt through the plugin-owned modal seam, pre-bound to the selected text and
  its note path.*
- **Acceptance:**
  - Given a passage is selected in a note
  - When the user invokes inline edit
  - Then an inline-edit prompt opens, bound to the selected text and note path, accepting an
    instruction
- **Priority:** must
- **Satisfies:** CHARTER §3.4 (inline edit); claudian `InlineEditModal.openAndWait` (`:251`)
- **Note:** claudian renders the input as an in-editor CM6 widget; P5 launches an Obsidian `Modal`
  via the `modalSeam` (NFR-CA-003) — behaviour parity, our DOM rules. Modal seam shape is **CLAR-CA-003**.

### REQ-CA-021 — Run the inline-edit instruction as a one-shot side-query

- **Pattern:** event-driven
- **Statement:** *WHEN the user submits an inline-edit instruction, the plugin SHALL run a one-shot
  cold-start query that does not steer the active tab's main stream, framed by the inline-edit system
  prompt and the selection context.*
- **Acceptance:**
  - Given the inline-edit prompt has an instruction and a selection
  - When the user submits it
  - Then a cold-start side-query runs (the active tab's session and stream are untouched) and its
    text response is accumulated
- **Priority:** must
- **Satisfies:** claudian `QueryBackedInlineEditService` (`:31`); reuses the P3/P4 `forceColdStart`
  side-query pattern (`GenerateTitleUseCase`, `RefineInstructionUseCase`)
- **Note:** whether this runs through a new `AuxModelPort` or a per-use-case `ChatRuntimePort`
  side-query (the 3rd consumer) is **CLAR-CA-004**.

### REQ-CA-022 — Parse the inline-edit response into replacement, insertion, or clarification

- **Pattern:** event-driven
- **Statement:** *WHEN the inline-edit side-query returns a response, the plugin SHALL parse a
  `<replacement>` block as a replacement, an `<insertion>` block as an insertion, a non-empty
  untagged response as a clarification, and an empty response as a failure.*
- **Acceptance:**
  - Given a response `"<replacement>Bonjour</replacement>"`, parsing yields a replacement of `Bonjour`
  - And given a response `"Which meaning?"`, parsing yields a clarification
  - And given an empty response, parsing yields a failure
- **Priority:** must
- **Satisfies:** claudian `parseInlineEditResponse` (`inlineEdit.ts:9`) — ported as a pure/total transform

### REQ-CA-023 — Preview the inline edit as a word-level diff

- **Pattern:** event-driven
- **Statement:** *WHEN the inline-edit side-query returns a replacement, the plugin SHALL preview the
  change against the original selection as a word-level diff before the edit is applied.*
- **Acceptance:**
  - Given a selection `"The bank was steep"` and a replacement `"The riverbank was steep"`
  - When the preview renders
  - Then the diff marks `bank` removed and `riverbank` inserted at word granularity, with equal words
    unmarked
- **Priority:** must
- **Satisfies:** CHARTER §3.4 (word-level diff); claudian inline-edit `computeDiff` (word DP/LCS,
  `InlineEditModal.ts:171`)
- **Note:** the P2 `computeDiff` is **line-level** (`DiffLine[]` from tool results). Inline edit needs
  **word-level** ops. The seam to reuse is the **`DiffView` renderer**, fed by a word-level diff
  function — confirming exactly which P2 surface is reused (renderer vs `computeDiff`) is **CLAR-CA-004**.

### REQ-CA-024 — Apply an accepted inline edit to the note

- **Pattern:** event-driven
- **Statement:** *WHEN the user accepts a previewed inline edit, the plugin SHALL replace the selected
  range in the note with the edited text and close the inline-edit flow.*
- **Acceptance:**
  - Given a previewed replacement for a selected range
  - When the user accepts (Enter or the accept control)
  - Then the note's selected range is replaced with the edited text and the inline-edit flow closes
- **Priority:** must
- **Satisfies:** claudian `InlineEditController.accept` (`:654`)

### REQ-CA-025 — Reject an inline edit without modifying the note

- **Pattern:** event-driven
- **Statement:** *WHEN the user rejects a previewed inline edit, the plugin SHALL leave the note
  unchanged, restore the selection highlight, and close the inline-edit flow.*
- **Acceptance:**
  - Given a previewed replacement for a selected range
  - When the user rejects (Escape or the reject control)
  - Then the note content is unchanged, the original selection highlight is restored, and the flow closes
- **Priority:** must
- **Satisfies:** claudian `InlineEditController.reject` (`:673`)

### REQ-CA-026 — Continue an inline-edit clarification as a conversation

- **Pattern:** event-driven
- **Statement:** *WHEN the inline-edit side-query returns a clarification, the plugin SHALL show the
  clarification, accept a follow-up reply, and continue the inline-edit conversation with that reply.*
- **Acceptance:**
  - Given a clarification `"Which bank?"` is shown
  - When the user replies `"river bank"`
  - Then the inline-edit conversation continues with the reply and produces a replacement/insertion
    preview
- **Priority:** should
- **Satisfies:** claudian `InlineEditController.generate` clarification branch (`:568`) +
  `continueConversation` (`QueryBackedInlineEditService.ts:36`)

### REQ-CA-027 — Surface an inline-edit failure as a non-blocking notice

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the inline-edit side-query fails or returns no usable result, THEN the plugin
  SHALL surface a non-blocking error notice via `NotificationPort` and leave the note unchanged,
  without throwing across the boundary.*
- **Acceptance:**
  - Given the side-query errors (or returns empty)
  - When the failure is handled
  - Then a non-blocking error notice is shown, the note is unchanged, and no exception crosses the
    use-case boundary (a `Result.err` is returned)
- **Priority:** must
- **Satisfies:** claudian `InlineEditController.handleError` (`:590`); mirrors `GenerateTitleUseCase`
  Result-at-boundary convention (ADR-CC-001 §2)

### REQ-CA-028 — Inline edit is addressed through provider capability, not a provider id branch

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL drive inline edit through the runtime/side-query contract for the
  active tab's provider and SHALL NOT branch behaviour on a literal provider id.*
- **Acceptance:**
  - Given the active tab runs the Claude provider
  - When inline edit runs
  - Then it uses the active runtime/side-query without any `if (providerId === 'claude')` branch in
    the use case or component
- **Priority:** must
- **Satisfies:** charter §6 (Claude wired, Codex/Opencode behind capability gates); mirrors
  REQ-TS-026 / REQ-CP-018 no-provider-branch rule; `ClaudeInlineEditService` is the only wired impl (NG4)

## Non-functional requirements

> Targets inherited from the epic constraints (charter §1 bounding constraints + §5),
> `CLAUDE.md` (DDD/ports/DOM/testing), and ADR-008. Restated per project convention.
> Any **new** threshold introduced by P5 is marked **[NEW]** and is itself a CLAR.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-CA-001 | architecture | DDD inward-only imports; all Obsidian access via narrow ports; three bridges (`ObsidianBridge`, `MockBridge`, `LocalStorageBridge`) implement every new port | No `obsidian` import outside `src/infrastructure/obsidian/**` + `src/plugin/**`; new ports added to all three bridges |
| NFR-CA-002 | architecture | Vue components never import `obsidian`; selection capture, image resource resolution, and inline-edit modal route through ports / the modal seam | ESLint `no-restricted-imports` green; no `obsidian` symbol in `src/ui/**` |
| NFR-CA-003 | security/DOM | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no `v-html`, no `window.confirm`/`alert`/`prompt`; the inline-edit + image-preview modals use an Obsidian `Modal` launched via `modalSeam` | `no-restricted-properties` + `vue/no-v-html` + `no-restricted-globals` green |
| NFR-CA-004 | code-style | All new components use `<script setup>`; domain/use-case results use `Result<T,E>`; side-query/parse transforms are pure + total (never throw) | ESLint Composition-API rule green; use cases return `Result`; parse fns have no side effects |
| NFR-CA-005 | testing | Tests mirror `src/` path-for-path; mounted components have co-located `data-testid` PageObjects; no CSS/id selectors in tests | `tests/**` lint green; every new component test has a `.po.ts` |
| NFR-CA-006 | testing | Coverage thresholds hold | ≥ 80 statements / 70 branches / 80 functions / 80 lines (`npm run test:coverage`) |
| NFR-CA-007 | visual parity | Every new surface (chips, image preview/modal, selection indicator, inline-edit prompt + diff) renders through `--sp-*` tokens; no raw Obsidian var or physical CSS property leaks | `lint-style-tokens` guard green; per-surface parity screenshots vs claudian at 320/520/720 px, light + dark |
| NFR-CA-008 | accessibility | Chips, image modal, selection indicator, and inline-edit accept/reject are keyboard-operable with managed focus; forced-colors + reduced-motion honoured | WCAG 2.2 AA; keyboard + forced-colors asserted in component tests |
| NFR-CA-009 | privacy/security | Image transport carries no secret material; attachment payload is bounded by a size limit; nothing is written to `data.json` | No secret/token in any attachment payload; image size ≤ limit **[NEW]** (limit value = CLAR-CA-001); `data.json` untouched |
| NFR-CA-010 | reliability | Selection capture, image attach, and inline-edit failures degrade gracefully (no thrown error crosses a boundary; transient polling errors are swallowed) | `prepareTurn`/parse/diff are total; controller poll errors do not surface as crashes |
| NFR-CA-011 | dependencies | No new runtime dependency for the word-level diff or selection capture | `package.json` runtime deps unchanged; word diff is in-repo (mirrors claudian's in-file DP/LCS) |
| NFR-CA-012 | identity/manifest | Product identity stays Specorator; `manifest.json` (`id`, `version`, `minAppVersion 1.12.7`) untouched; no migration of prior state | manifest diff empty; no migration/compat code (charter CHARTER-REQ-FRESH) |
| NFR-CA-013 | i18n | New user-facing strings go through the existing `TranslationPort` with English keys | No hardcoded user-facing string in new components; full-locale parity deferred (NG7) |

> **[NEW] baseline note:** the image size limit (NFR-CA-009) is the only new threshold P5
> introduces. It is not inherited from steering — it is captured as **CLAR-CA-001** (transport
> sub-decision) for the architect to set, with a PM-recommended starting point in §clarifications.

## Success metrics

- **North star:** A returning Claudian user completes each of the four §3.4 jobs (pin
  files, attach + preview an image, send a selection as context, run an inline edit with
  word-diff accept/reject) on the rebuilt surface with no missing affordance — verified by
  the per-surface parity checklist + screenshots (charter §5) passing at `/spec:review`.
- **Supporting:**
  - 100% of `must` REQ-CA-* mapped to a Claudian source path and an executed test (charter §5.2).
  - All four sub-surfaces render through `--sp-*` tokens with zero raw-var/physical-property
    leaks (NFR-CA-007).
  - Inline-edit word-diff preview reuses the P2 `DiffView` renderer (no second diff renderer
    introduced) — measured by component reuse, not duplication.
- **Counter-metric (scope leakage vs the non-goals):** zero P5 artifacts implement a toolbar
  widget selector / usage meter (NG1), approval rule (NG2), MCP server (NG3), Codex/Opencode
  inline-edit service (NG4), settings UX (NG5), or a re-spec of `@mention` (NG6). Tracked by a
  review checklist: any REQ/spec/task touching those surfaces is a scope-leak defect to bounce
  back to the owning phase.

## Release criteria

What must be true to ship P5 to `next`.

- [ ] All `must` REQ-CA-* pass acceptance (file chips, image attach/embed/remove, editor +
      canvas selection capture + travel, inline-edit open/run/parse/word-diff/accept/reject/
      failure, no-provider-branch).
- [ ] All NFR-CA-* met or explicitly waived with an ADR (notably NFR-CA-007 token parity,
      NFR-CA-009 image size/no-secret).
- [ ] CLAR-CA-001..004 resolved by accepted P5 ADRs before design freezes the contracts.
- [ ] Per-surface parity screenshots captured (320/520/720 px, light + dark) and approved at
      `/spec:review` (charter §5.1).
- [ ] `npm run verify` + `npm run test:all` exit zero on the P5 branch.
- [ ] Counter-metric clean: no scope leakage into NG1–NG8.
- [ ] Browser-selection leg (REQ-CA-018) shipped, capability-gated, or explicitly deferred per
      the CLAR-CA-002 ADR — not silently dropped.

## Open questions / clarifications

> These are **architect-owned** (P5 is autonomous-drive; no human gate). Each is an
> ADR-worthy decision flagged with options + constraints — **the PM does not decide them**.
> They block `status: accepted`; the PRD ships `draft` until the P5 ADRs resolve them.

- **CLAR-CA-001 — Attachment / context model + image transport.** *owner: architect*
  How do file chips, images, and selections attach to a turn? Options: (a) grow
  `ChatTurnRequest` additively with the already-reserved fields (`images?`,
  `editorSelection?`, `canvasSelection?`, `browserSelection?`, `externalContextPaths?` —
  `ChatTurn.ts:12-13`) and have the composer/store assemble them; (b) a separate context
  port the runtime reads. Sub-decision: **image transport** — base64-inline (self-contained,
  bounded by a size limit; PM-recommended starting limit to bless, e.g. a few MB) vs
  vault-path reference (smaller payload, requires the file persist in-vault, mirrors claudian's
  `getResourcePath` display path). Constraints: additive only (G2, P1 send path byte-identical
  when empty), no secret in payload + bounded size (NFR-CA-009), no `data.json` writes. **PM
  recommendation:** option (a) additive `ChatTurnRequest` fields (the fields are already
  reserved; lowest seam churn), image transport decided by what the Claude CLI subprocess
  accepts.

- **CLAR-CA-002 — Selection-capture ports + which sources are P5-feasible.** *owner: architect*
  Claudian uses three polling controllers (editor/canvas/browser). Options for the port set:
  one `EditorSelectionPort` covering editor + canvas, vs separate ports; and the **feasibility
  call**: editor selection (CM6, clean port — feasible), canvas selection (Obsidian canvas; the
  `canvas` mock already exists in `tests/__fakes__/fake-ports.ts` — feasible), browser selection
  (relies on `webview.executeJavaScript`/`iframe.contentDocument`, Electron/webview-specific —
  likely needs the embedded-webview path, fragile). Constraints: Vue-no-obsidian (capture lives
  behind a port), the 250 ms poll cadence is an implementation detail not a contract. **PM
  recommendation:** ship **editor + canvas** in P5 behind the selection port(s); **capability-gate
  the browser leg** (REQ-CA-018 `could`) and defer it to a follow-up if the bridge cannot read the
  embedded webview selection — do not silently drop it.

- **CLAR-CA-003 — Inline-edit modal seam shape.** *owner: architect*
  Claudian renders the inline-edit input as an in-editor CM6 decoration widget; our DOM rules
  require an Obsidian `Modal` launched via the plugin-owned `modalSeam` (`src/ui/chat/modalSeam.ts`).
  Decide the seam's function-handle shape (e.g. an `OpenInlineEditFn` resolving the decision +
  edited text, mirroring `InstructionConfirmFn`/`ConfirmDeleteFn`) and whether the word-diff preview
  + accept/reject lives inside the modal or as in-editor decorations behind a port. Constraints:
  no `window.confirm`/`prompt` (NFR-CA-003), the standalone entry needs a browser-safe stand-in
  (like the existing seam fallbacks). **PM recommendation:** an `OpenInlineEditFn` modal-seam handle
  resolving `{decision, editedText?}`, preview rendered with `DiffView` inside the modal — keeps the
  Vue layer obsidian-free and reuses the P2 renderer.

- **CLAR-CA-004 — AuxModelPort extract-now decision + the diff-reuse seam.** *owner: architect*
  Inline edit is the **3rd cold-start side-query consumer** after `GenerateTitleUseCase` and
  `RefineInstructionUseCase`; all three build a `prepareTurn` and call
  `runtime.query(turn, [], { forceColdStart: true })` with a system-prompt-framed text. ADR-CP-003
  named P5 inline-edit the re-evaluation point for extracting an `AuxModelPort` (charter §6c).
  Decide: **extract `AuxModelPort` now** (one-shot `{ systemPrompt, model?, abortController? } → text`,
  mirroring claudian's `AuxQueryRunner` that `QueryBackedInlineEditService` consumes — refactors
  title-gen + instruction-refine onto it) **vs keep per-use-case `ChatRuntimePort` side-queries**
  (lower churn, accepts a 3rd near-duplicate). Sub-decision: **the diff-reuse seam** — the P2
  `computeDiff` is **line-level** (`DiffLine[]` from tool `structuredPatch`/input), but inline edit
  needs a **word-level** diff (claudian's in-file DP/LCS over `split(/(\s+)/)`); confirm that P5
  reuses the **`DiffView` renderer** fed by a *new* word-level diff function (NFR-CA-011, no new dep)
  rather than reusing line-level `computeDiff` as-is. Constraints: no new runtime dep, no provider-id
  branch (REQ-CA-028), Result-at-boundary (REQ-CA-027). **PM recommendation:** **extract `AuxModelPort`
  now** — three consumers is the threshold ADR-CP-003 set, and claudian's own `AuxQueryRunner`
  validates the shape; **reuse `DiffView` only**, add a small in-repo word-level diff for the preview
  input.

## Out of scope

See Non-goals NG1–NG8. Restated for the cycle: no toolbar control strip / usage meter, no
approval rules, no MCP, no Codex/Opencode inline-edit services (Claude only — seams built), no
settings UX, no `@mention` re-spec, no full-locale i18n, no P2 message-body file-link/image-embed
rewrite.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID (REQ-CA-001..028).
- [x] Acceptance criteria testable (Given/When/Then, each mapped to a claudian path).
- [x] NFRs listed with targets (NFR-CA-001..013; new threshold flagged).
- [x] Success metrics defined (including a counter-metric: scope leakage vs NG1–NG8).
- [x] Release criteria stated.
- [ ] `/spec:clarify` returned no open questions — **held**: CLAR-CA-001..004 are architect-owned
      ADR decisions; PRD stays `draft` until the P5 ADRs resolve them (autonomous drive, no human gate).
