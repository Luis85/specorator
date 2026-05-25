---
id: ADR-CA-004
title: Run inline edit through an OpenInlineEditFn modal seam over a cold-start AuxModelPort query, parsed by a pure parseInlineEditResponse, previewed by a new pure word-level diff fed to the unchanged DiffView renderer
status: accepted       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
accepted: 2026-05-25    # autonomous-drive: architect files, PM accepts; human defers to one final epic-review gate
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - planner
  - dev
  - qa
  - ux-ui-designer
supersedes: []
superseded-by: []
tags: [architecture, inline-edit, modal-seam, diff, claudian-reboot, P5]
---

# ADR-CA-004 — Inline-edit seam + word-level diff

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CA-003** and the diff-reuse half
of **CLAR-CA-004**. Unblocks `PRD-CA-001` (REQ-CA-020..028).

## Context

Inline edit (Claudian `InlineEditModal` + `core/prompt/inlineEdit.ts` +
`QueryBackedInlineEditService`): select text in a note, type an instruction, run a one-shot query,
parse the response into a replacement / insertion / clarification, preview a **word-level** diff, and
accept / reject / continue. Two forces:

1. **Our DOM rules forbid Claudian's UI.** Claudian renders the input as an in-editor CM6 decoration
   widget; we forbid `innerHTML`/`v-html`/`window.prompt` (NFR-CA-003). The plugin already owns a
   **modal seam** (`src/ui/chat/modalSeam.ts`) with the `InstructionConfirmFn`/`ConfirmDeleteFn`
   pattern: a Vue-injected function handle backed by an Obsidian `Modal` subclass in `src/plugin/`,
   with a browser-safe standalone stand-in.
2. **The P2 diff is line-level, inline-edit needs word-level.** `computeDiff` produces `DiffLine[]`
   from a tool's `structuredPatch` (line granularity). Inline edit needs word granularity
   (Claudian's in-file DP/LCS over `split(/(\s+)/)`). The brief's "reuse computeDiff" is the
   line-vs-word correction the PM flagged: the reuse target is the **`DiffView` renderer**, not
   `computeDiff`.

## Decision

### 1. The inline-edit flow runs through an `OpenInlineEditFn` modal-seam handle (Option chosen, CLAR-CA-003)

We add one modal-seam handle mirroring `InstructionConfirmFn` (`src/ui/chat/modalSeam.ts`):

```ts
// src/ui/chat/modalSeam.ts — additive
export type InlineEditDecision =
  | { kind: 'accept'; editedText: string }   // apply the previewed replacement/insertion
  | { kind: 'reject' }                        // leave the note unchanged
  | { kind: 'clarify'; reply: string };       // continue the clarification conversation

export type OpenInlineEditFn = (request: {
  selectedText: string;
  notePath: string;
}) => Promise<InlineEditDecision | null>;     // null on dismiss

export const OPEN_INLINE_EDIT: InjectionKey<OpenInlineEditFn> = Symbol('OpenInlineEdit');
```

The real launcher opens an Obsidian `InlineEditModal` subclass in `src/plugin/modals/` (DOM via
`createEl`/`createDiv`/`setText`, NFR-CA-003); the standalone entry provides a browser-safe stand-in
(auto-reject, no `window.*`), like the existing seam fallbacks. The modal hosts the instruction
input, the **word-diff preview**, and the accept / reject / continue-clarification controls — so the
Vue layer stays `obsidian`-free and the modal owns the keyboard + focus (REQ-CA-020/024/025/026).

### 2. The instruction runs as a cold-start aux query via `AuxModelPort` (ADR-CA-002), parsed by a pure `parseInlineEditResponse`

A new `InlineEditUseCase` (application layer) owns the flow and returns `Result`:

```ts
type InlineEditOutcome =
  | { kind: 'replacement'; text: string }
  | { kind: 'insertion'; text: string }
  | { kind: 'clarification'; question: string };

class InlineEditUseCase {
  constructor(private readonly aux: AuxModelPort) {}
  // selection + instruction (+ prior clarification turns) → outcome; failure → err (REQ-CA-027)
  execute(selection: string, instruction: string, history?: string): Promise<Result<InlineEditOutcome>>;
}
```

- It calls `aux.run(body, { systemPrompt, signal })` (the third aux consumer, ADR-CA-002 §1) — a
  cold-start query that does not steer the tab's main stream (REQ-CA-021).
- `parseInlineEditResponse` is ported **verbatim as a pure/total function** from
  Claudian `utils/inlineEdit.ts:9` into `src/application/chat/inlineEdit/parseInlineEditResponse.ts`:
  `<replacement>…</replacement>` → replacement; `<insertion>…</insertion>` → insertion; a non-empty
  untagged response → clarification; empty → failure (REQ-CA-022). The inline-edit system prompt is
  ported from `core/prompt/inlineEdit.ts` into the same folder.
- **Continue-conversation (REQ-CA-026):** a clarification reply re-runs `aux.run` with the prior
  turns appended (`QueryBackedInlineEditService.continueConversation` parity).
- **Failure (REQ-CA-027):** an aux `err`, an empty response, or a parse-failure → the use case
  returns `Result.err`; the caller surfaces a non-blocking `NotificationPort` notice and leaves the
  note unchanged — nothing throws across the boundary (ADR-CC-001 §2).
- **No provider-id branch (REQ-CA-028):** addressed through `AuxModelPort` (the active runtime),
  never `if (providerId === 'claude')`. `ClaudeInlineEditService` is the only wired impl; Codex/
  Opencode are P9 (NG4) and slot in behind the same aux seam.

### 3. The word-level diff is a new pure function feeding the **unchanged `DiffView` renderer** (CLAR-CA-004 diff half)

We add **one new pure function** producing `DiffLine[]` at word granularity, and feed it to the
existing `DiffView` via the existing `ToolDiffData` shape — **no new renderer, no new dependency**
(NFR-CA-011):

```ts
// src/application/chat/inlineEdit/computeWordDiff.ts
// DP/LCS over original.split(/(\s+)/) vs edited.split(/(\s+)/); emits DiffLine[]
// ('equal' | 'insert' | 'delete') — the SAME DiffLine type DiffView already renders.
export function computeWordDiff(original: string, edited: string): DiffLine[];
```

The preview wraps the result as `ToolDiffData` (`{ filePath: notePath, diffLines, stats }`) and
renders `<DiffView :diff-data="…" />` **unchanged**. This is the precise reuse seam: the renderer is
reused, `computeDiff` (line-level, tool-result-driven) is **not** — they share only the `DiffLine`
contract.

- `computeWordDiff` is **pure + total** (NFR-CA-004/010): empty inputs / equal strings degrade to an
  all-equal (or empty) diff, never throw (mirrors `computeDiff`/`splitDiffHunks`).
- It is an **in-repo DP/LCS** ported from Claudian's in-file algorithm — **no new runtime dependency**
  (NFR-CA-011).
- The `DiffView` hunking + background-highlight-only rendering (REQ-RR-025) apply as-is; a word-level
  diff is typically short (a selection), so the hunk/cap paths simply do not trigger.

## Considered options

### Option A — In-editor CM6 decoration widget (Claudian-literal) for input + preview
- Cons: requires `obsidian` in the rendering path + raw DOM building that our rules forbid
  (NFR-CA-002/003); no browser-safe standalone stand-in. Rejected.

### Option B — `OpenInlineEditFn` modal-seam handle hosting input + DiffView preview + accept/reject/clarify *(chosen)*
- Pros: reuses the proven modal seam (`InstructionConfirmFn` shape); keeps Vue `obsidian`-free; reuses
  `DiffView`; the standalone stand-in already has a pattern; modal owns focus/keyboard (a11y).
- Cons: the preview lives in an Obsidian `Modal` (manual/parity leg verifies the visual render, like
  `InstructionConfirmModal` TEST-CP-M2).

### Option C — Reuse line-level `computeDiff` for the preview (the brief's literal wording)
- Cons: `computeDiff` is line-granularity from a tool's `structuredPatch`; an inline edit is a
  word-level rewrite of one selection — line diff would mark the whole line changed, losing the
  word-level parity the requirement demands (REQ-CA-023). Rejected — reuse the **renderer**, add a
  word-level diff function.

### Option D — Add a word-diff dependency (e.g. a diff npm package)
- Cons: a new runtime dependency for a small DP/LCS Claudian already implements in-file (NFR-CA-011).
  Rejected.

## Consequences

### Positive
- Inline edit ships on the existing modal seam + the existing `DiffView` renderer + the existing aux
  query (ADR-CA-002) — three proven seams, one new pure function + one new modal + one new use case.
- The Vue layer stays `obsidian`-free; the standalone demo has a browser-safe stand-in.
- Word-level parity is exact; no second diff renderer; no new dependency.
- Codex/Opencode inline-edit services (P9, NG4) slot in behind `AuxModelPort` without reshaping P5.

### Negative
- The preview render lives in an Obsidian `Modal`, so its visual fidelity is proven on the manual
  parity leg (accumulated for the single final human review gate), as `InstructionConfirmModal` was.

### Neutral
- `parseInlineEditResponse` + the inline-edit system prompt + `computeWordDiff` are pure application
  functions, testable in isolation — the same shape as title-gen / refine prompts and the P2 diff
  functions.

## Compliance

- A test asserts `parseInlineEditResponse` yields replacement / insertion / clarification / failure
  for the four response shapes (REQ-CA-022), mirroring Claudian's parser tests.
- A test asserts `computeWordDiff('The bank was steep', 'The riverbank was steep')` marks `bank`
  removed + `riverbank` inserted with equal words unmarked (REQ-CA-023), and is total on empty/equal
  inputs.
- A test asserts the preview renders through the **unchanged `DiffView`** (`ToolDiffData` fed in) —
  no second diff renderer is introduced (success-metric: component reuse).
- A test asserts accept replaces the note range + closes (REQ-CA-024); reject leaves the note
  unchanged + restores the highlight + closes (REQ-CA-025); a clarification continues the conversation
  (REQ-CA-026); an aux failure surfaces a `NotificationPort` notice + leaves the note unchanged + the
  use case returns `err` (REQ-CA-027).
- A review check confirms no `providerId` branch in the inline-edit use case/component (REQ-CA-028)
  and no `innerHTML`/`v-html`/`window.prompt` in the inline-edit path (NFR-CA-003).

## References

- PRD-CA-001 — REQ-CA-020..028; CLAR-CA-003 + CLAR-CA-004 (diff half); NFR-CA-003/011.
- `specs/context-attachments/design.md` Part C.
- **ADR-CA-002** (the `AuxModelPort` this is the third consumer of), ADR-RR-001/002 (the `DiffView`
  renderer + `DiffLine`/`ToolDiffData` contract reused here), ADR-CP-001/003 (the modal-seam +
  side-query patterns reused), ADR-CC-001 §1/§2 (streaming-error convention; Result at boundaries),
  ADR-008 (one port per consumer).
- Claudian reference: `features/inline-edit/ui/InlineEditModal.ts` (`openAndWait:251`,
  `computeDiff` word DP/LCS `:171`, `accept:654`/`reject:673`/`generate:568`),
  `utils/inlineEdit.ts` (`parseInlineEditResponse:9`, `escapeHtml`), `core/prompt/inlineEdit.ts`,
  `core/auxiliary/QueryBackedInlineEditService.ts` (`:31`, `continueConversation:36`),
  `providers/claude/auxiliary/ClaudeInlineEditService.ts`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
