---
id: ADR-RR-001
title: Grow the chat block model and render seam for rich rendering — typed toolUseResult, per-type block components, Obsidian-backed markdown
status: proposed       # proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-24
deciders:
  - architect
  - maintainer (human)        # PENDING — charter §6a P2 checkpoint
consulted:
  - pm
  - ux-ui-designer
informed:
  - planner
  - dev
  - qa
  - reviewer
  - brand-reviewer
supersedes: []
superseded-by: []
tags: [architecture, chat, rich-rendering, claudian-reboot, P2]
---

# ADR-RR-001 — Grow the chat block model and render seam for rich rendering

## Status

**Proposed** — pending the human checkpoint mandated by parity-charter §6a (mirroring the
ADR-CC-001 P1 gate). P2 design (`specs/rich-rendering/design.md` Part C) and `/spec:specify`
depend on this decision, but no implementation branch may open until a human accepts it.

## Context

P2 of the **claudian-reboot** epic (`PRD-RR-001`) makes the assistant turn render **rich** —
tool-calls, thinking blocks, todo lists, write/edit with a word-level diff, a reusable
collapsible primitive, subagent rendering + lifecycle, and usage/token info — **on top of** the
merged P1 chat surface (`chat-core`, `5e014d5`), without redesigning the P1 contract. ADR-CC-001
blessed the "grow per phase, never redesign" discipline and the additive-union pattern; this ADR
applies that discipline to the four P2 seams the PM flagged as architecturally load-bearing
(CLAR-RR-002, CLAR-RR-003) and the new render-only narrow ports the audits name.

The reference is `D:\Projects\claudian-main` (MIT, read-only — reproduce structure, not copy).
Four forces drive this decision:

1. **The StreamChunk union members are already declared** (`src/domain/chat/StreamChunk.ts`),
   member-name- and shape-identical to Claudian `chat.ts:137`, with **one deliberate divergence
   to resolve**: our `tool_result`/`subagent_tool_result` carry `toolUseResult?: unknown`, while
   Claudian carries the typed `SDKToolUseResult` (`diff.ts:27` — `{ structuredPatch?, filePath?,
   … }`). The Write/Edit word-level diff (REQ-RR-026) **reads `structuredPatch`**, so `unknown`
   cannot stand. P1 left this `unknown` intentionally (it emitted none of these members); P2 emits
   and reads them.

2. **`ChatMessage` was deliberately minimal in P1** (`ChatMessage.ts`, REQ-CC-006) — six fields,
   no `contentBlocks`/`toolCalls`. P2 must grow it (mirroring Claudian `chat.ts:39/46/47`) so
   blocks render in streaming order (REQ-RR-011) and replay identically from stored messages
   (REQ-RR-012). New domain types are needed: `ContentBlock`, `ToolCall`, `StructuredPatch`/
   `ToolUseResult`, `DiffLine`/`DiffStats`, `SubagentInfo`, `TodoItem`.

3. **The render seam is unbuilt** — P1 ships `MarkdownBlock.vue` + the `MessageTurn` content
   render only. P2 must add a declarative render tree for five block types under the hard
   NFR-RR-006 constraint (no `v-html`/`innerHTML`). Claudian builds these imperatively
   (`MessageRenderer.renderContentBlocks` switches on `ContentBlock.type`; `ToolCallRenderer`,
   `ThinkingBlockRenderer`, `TodoListRenderer`, `WriteEditRenderer`, `DiffRenderer`,
   `SubagentRenderer`, `collapsible.ts`). The shape of the Vue equivalent is a design call.

4. **The `MarkdownRenderPort` backing was deferred to P2** (CLAR-CC-005): P1 ships the pure
   paragraph-only `safeMarkdownRender`; tool/thinking/subagent content is richer markdown. The
   port's structured-node DTO shape is the contract that keeps the UI declarative (no `v-html`).

ADR-008 (narrow ports), ADR-004 (`Result`), ADR-001 (DDD layering), ADR-CC-001 (the chat seam)
all remain in force; this ADR rules only on the **shape of the P2 growth**.

## Decision

We will grow the P1 chat contract additively along four axes, mirroring Claudian's shapes and
ADR-CC-001's "grow per phase" rule.

### 1. Type `toolUseResult` and grow `ChatMessage` with the rich block model (CLAR-RR-002)

- **Replace `toolUseResult?: unknown`** on `tool_result` and `subagent_tool_result` with a typed
  domain shape `toolUseResult?: ToolUseResult`, where (mirroring `diff.ts:27`):

  ```ts
  // src/domain/chat/diff/
  export interface StructuredPatchHunk {
    oldStart: number; oldLines: number; newStart: number; newLines: number; lines: string[];
  }
  export interface ToolUseResult {        // domain rename of Claudian SDKToolUseResult
    structuredPatch?: StructuredPatchHunk[];
    filePath?: string;
    [key: string]: unknown;               // forward-compatible bag (parity with diff.ts:30)
  }
  export interface DiffLine { type: 'equal' | 'insert' | 'delete'; text: string; oldLineNum?: number; newLineNum?: number; }
  export interface DiffStats { added: number; removed: number; }
  ```

  This is the **only** narrowing of an existing P1 union member; the open-ended `[key: string]:
  unknown` keeps it forward-compatible for non-Write/Edit tools (parity with Claudian).

- **Grow `ChatMessage` additively** (no P1 field renamed/removed):

  ```ts
  // added to ChatMessage (mirrors chat.ts:39/46/47)
  contentBlocks?: ContentBlock[];   // ordered render list
  toolCalls?: ToolCall[];           // tool tracking by id
  ```

- **New domain types** (mirroring Claudian, P2-needed members only):

  ```ts
  // src/domain/chat/ContentBlock.ts  (mirrors chat.ts:31)
  export type ContentBlock =
    | { type: 'text'; content: string }
    | { type: 'tool_use'; toolId: string }
    | { type: 'thinking'; content: string; durationSeconds?: number }
    | { type: 'subagent'; subagentId: string; mode?: SubagentMode }
    | { type: 'context_compacted' };

  // src/domain/chat/ToolCall.ts  (domain rename of ToolCallInfo, tools.ts:32 — P2 subset)
  export interface ToolCall {
    id: string; name: string; input: Record<string, unknown>;
    status: 'running' | 'completed' | 'error' | 'blocked';
    result?: string; diffData?: ToolDiffData; subagent?: SubagentInfo;
  }
  // SubagentInfo (tools.ts:66), SubagentMode/AsyncSubagentStatus (tools.ts:55/58),
  // TodoItem (core/tools/todo.ts) — P2-needed members only.
  ```

- **Deliberately still excluded** (documented as later-phase, parity with REQ-RR-010): `images`
  (P5), `userMessageId`/`assistantMessageId`/`resumeAtMessageId` (P3 rewind), `currentNote`,
  `isInterrupt`/`isRebuiltContext`, `durationFlavorWord`, and `ToolCall.resolvedAnswers`/
  `isExpanded` (the inline-approval P7 surface; per-block expand state lives in the Vue layer,
  not the DTO). `ChatMessage` DTOs stay plain (ADR-003) — no expand/timer state on them.

### 2. Per-type block components behind a thin block-dispatcher (CLAR-RR-003 part 1)

We adopt **per-type Vue components composed by a thin block-dispatcher**, not one mega-renderer:

- `MessageBlocks.vue` — the thin dispatcher: iterates `message.contentBlocks` in order and renders
  one child per `block.type` (mirroring `MessageRenderer.renderContentBlocks`). It owns ordering
  (REQ-RR-011) and nothing else.
- Per-type components: `TextBlock` (wraps the P1 `MarkdownBlock`), `ToolCallBlock`, `ThinkingBlock`,
  `TodoList`, `WriteEditBlock` (+ `DiffView`), `SubagentBlock`, `ContextCompactedBlock`, `UsageInfo`
  (turn-level, not a content block).
- `SpCollapsible.vue` + `useCollapsible` — the one reusable collapsible primitive (the 2px
  tree-branch rail, click + Enter/Space, `aria-expanded`, dynamic label) that ToolCallBlock,
  ThinkingBlock, WriteEditBlock, and SubagentBlock all reuse (REQ-RR-015/016/018; mirrors
  `collapsible.ts`).

**Pure transforms live in the application layer**, mirroring the P1 `safeMarkdownRender` seam, so
they are unit-testable without mounting (NFR-RR-005):

- `toolPresentation.ts` — `toolName(name, input)`, `toolSummary(name, input)`, `toolLabel(name,
  input)` (REQ-RR-019a; mirrors `getToolName`/`getToolSummary`/`getToolLabel`).
- `computeDiff.ts` — `computeDiff(toolUseResult): { lines: DiffLine[]; stats: DiffStats }`
  (REQ-RR-026; mirrors `DiffRenderer.splitIntoHunks`/`renderDiffStats` + `utils/diff`). Pure,
  total, reproduces Claudian's hunk logic — **no new runtime diff dependency** (NFR-RR-013).
- `renderTodos.ts` — `renderTodos(todos): TodoRow[]` with status/icon/display-text
  (REQ-RR-022/023; mirrors `todoUtils`).
- `resolveSubagentLifecycle.ts` — sync-vs-async classification + spawn+wait(+close) consolidation
  for the **Claude Task/Agent path only** (REQ-RR-021b; mirrors `subagentLifecycleResolution.ts`).
  Provider-lifecycle (Codex/Opencode `spawn_agent`/`wait`) consolidation is **deferred to P9**
  (CLAR-RR-004, NG7).

The components hold only ephemeral UI state (collapsed/expanded, the live thinking timer) — never
domain state.

### 3. Upgrade the `MarkdownRenderPort` backing, keep the DTO shape (CLAR-RR-003 part 2)

We **upgrade the production backing** of `MarkdownRenderPort.render` to Obsidian's
`MarkdownRenderer.render` inside `ObsidianBridge` (CLAR-CC-005 lands here), **without changing the
`SafeRenderResult` structured-node return shape**. The Obsidian renderer produces a detached DOM
fragment; the bridge **walks that fragment into the existing `MarkdownNode[]`/`MarkdownInline[]`
DTO** (extending the node model with the additional block kinds P2 needs — e.g. `code_block`,
`list`, `heading` — as declarative node variants, never HTML strings). `MockBridge` and
`LocalStorageBridge` keep the pure `safeMarkdownRender` backing. Because the **port shape is
unchanged**, the UI stays declarative (NFR-RR-006), tests and the two non-Obsidian bridges are
unaffected, and this is **not** an ADR-worthy shape change — it is a backing swap recorded here
for traceability. *If* the node-model extension turns out to require a return-shape change during
spec, that change returns here as an amendment/superseding ADR.

### 4. New render-only narrow ports — declare `IconPort`, defer the rest

P2 introduces **one** new narrow port:

- **`IconPort`** — `setIcon(name): IconNode` (a declarative icon-node DTO, **not** a DOM mutator),
  resolving a logical icon name to a renderable node. It backs the per-tool icons
  (`getToolIcon`/`toolIcons.ts`), status icons (check/x/shield-off), and todo dot/check
  (REQ-RR-019/020/022). `ObsidianBridge` backs it with Obsidian `setIcon` into a detached element
  walked to the DTO (no `v-html`); Mock/LocalStorage back it with a static name map. It gets its
  own `ICON_PORT` `InjectionKey` + `useIconPort()` composable (ADR-008 "one port per consumer").
  The deleted P0 `IconPort`/`<SpIcon>` (ADR-PSR-001) **regrows here** as its first P2 consumer
  returns.

We **explicitly defer**: any tool-metadata registry port, web-search/link-parsing renderers
(CLAR-RR-005 — P2 ships the generic expanded renderer + Write/Edit diff only), the inline
interactive/approval seam (`ConfirmModalPort`, P7, NG3), and `SecretStorePort` (NG8). No
out-of-scope port is declared.

## Considered options

### Option A — Type `toolUseResult`, per-type components + thin dispatcher, backing-swap markdown, declare `IconPort` *(chosen)*
- Pros: parity-faithful to Claudian's real shapes (charter §1); per-type components are
  independently unit-testable (NFR-RR-005) and map 1:1 to the audit renderers; pure transforms in
  the application layer mirror the blessed P1 `safeMarkdownRender` seam; the DTO-stable markdown
  backing swap keeps NFR-RR-006 and the two non-Obsidian bridges intact; one narrow port, one
  consumer, one InjectionKey (ADR-008 intent); additive growth only (ADR-CC-001).
- Cons: more files than a single renderer; `toolUseResult` narrowing touches an existing P1 union
  member (mitigated: it was emitted by nothing in P1, and the change is a tighten, not a rename);
  the `IconPort` DTO walk and the markdown fragment walk are bridge work that must be proven
  declarative.

### Option B — One `MessageBlockRenderer` mega-component switching on `ContentBlock.type`
- Mirrors `MessageRenderer.renderContentBlocks` literally (one file, one `switch`).
- Pros: fewest files; closest 1:1 to the Claudian source file layout.
- Cons: a single SFC with a five-way `v-if` ladder and all block markup/styles is hard to
  unit-test in isolation (NFR-RR-005 wants per-type PageObjects), couples unrelated block logic,
  and grows unboundedly as later phases add block types. The thin-dispatcher (Option A) keeps the
  ordering loop *and* per-type isolation. Rejected.

### Option C — Keep `toolUseResult?: unknown`, narrow at the render boundary with a type guard
- Leaves the union member as P1 declared it; the diff component casts/guards `unknown`.
- Pros: zero change to the declared union.
- Cons: pushes an unsafe cast into the UI/application boundary, loses the compiler's help on the
  `structuredPatch` shape the diff reads (REQ-RR-026), and diverges from Claudian's typed
  `SDKToolUseResult`. The PM explicitly flagged this as the divergence to resolve, not paper over.
  Rejected.

### Option D — Extend the safe node model instead of upgrading the markdown backing
- Keep the pure `safeMarkdownRender`, hand-extend it to parse code-blocks/lists/headings.
- Pros: no Obsidian dependency in the render path; fully pure/total.
- Cons: re-implements a markdown parser Obsidian already ships; CLAR-CC-005 explicitly deferred the
  *Obsidian backing* to P2 precisely to get Obsidian's renderer; perceptual parity for rich
  markdown (code fences, lists) is far cheaper via the real renderer. Chosen approach keeps the
  pure backing for Mock/LocalStorage and uses Obsidian only in `ObsidianBridge`. Rejected as the
  primary path (the pure backing survives as the non-Obsidian-bridge backing).

## Consequences

### Positive
- P2 emits + renders every §3.1 rich block with shapes identical to Claudian; later phases
  (P3 compaction/history, P5 images, P7 approvals, P9 providers) add union/`ChatMessage`/block
  members without touching the P2 contract (charter §4 additivity, ADR-CC-001).
- The typed `ToolUseResult`/`StructuredPatch`/`DiffLine` gives the diff transform a compiler-checked
  source (REQ-RR-026) and removes an `unknown` from the domain.
- Per-type components + application-layer pure transforms satisfy NFR-RR-005 (isolated unit tests,
  `data-testid` PageObjects) and keep the no-`v-html` rule a render-layer invariant (NFR-RR-006).
- All three bridges drive every renderer (NFR-RR-002): Mock/LocalStorage script rich chunks; the
  DTO-stable markdown + icon ports mean no subprocess on the non-desktop bridges.

### Negative
- Three render-affecting changes land at once (model growth, render tree, markdown/icon backing);
  the spec must sequence them so the P1 surface never regresses (the dispatcher renders `text`
  blocks via the existing `MarkdownBlock` from day one).
- The `toolUseResult` narrowing is the single edit to a declared P1 union member — flagged here so
  no reviewer mistakes it for a silent contract change.
- Two markdown backings now exist (Obsidian in production, pure in Mock/LocalStorage) — they must
  stay perceptually equivalent for the common paragraph/inline-code case; the spec states the
  equivalence as a compatibility note.

### Neutral
- `IconPort` regrows the P0-deleted icon seam (ADR-PSR-001) as a fresh narrow port for its first
  P2 consumer; `<SpIcon>` (if reintroduced) is a UI component over `useIconPort()`, not a port.
- Per-block expand/timer state lives in the Vue layer, not on `ChatMessage` DTOs (ADR-003); stored
  messages replay collapsed-by-default (REQ-RR-012/018) because the DTO carries no expand state.

## Compliance
- ESLint `no-restricted-properties` (`innerHTML`/`outerHTML`/`insertAdjacentHTML`) +
  `vue/no-v-html`: zero raw-HTML sink in any P2 render component or bridge DTO walk (NFR-RR-006);
  the XSS-payload-as-text test (REQ-RR-020a) passes.
- A review checklist item confirms the `StreamChunk` union has exactly the P1 member names with
  `toolUseResult` typed to `ToolUseResult` (no other rename), and `ChatMessage` keeps all six P1
  fields plus the two new optional ones (REQ-RR-001, REQ-RR-010).
- `lint-style-tokens` (regrowing, AUX reference): zero raw hex / raw Obsidian var in P2 components;
  every Claudian colour/indent resolves through a `--sp-*` token (NFR-RR-007).
- ESLint import-direction + `no-restricted-imports`: chunk→block mapping in application, render in
  ui, Obsidian markdown/icon backing only in `ObsidianBridge`; Vue never imports `obsidian`
  (NFR-RR-001).
- The pure transforms (`toolPresentation`, `computeDiff`, `renderTodos`,
  `resolveSubagentLifecycle`) have unit tests with no component mount (NFR-RR-005).

## References
- PRD-RR-001 (`specs/rich-rendering/requirements.md`) — REQ-RR-001/002/003/010/011/012/019a/020a/
  021b/025/026; NFR-RR-001/002/005/006/007; CLAR-RR-002/003/004/005/006.
- `specs/rich-rendering/design.md` Part C — layer placement + bridge wiring + edge cases.
- ADR-CC-001 — the P1 "grow per phase" + additive-union precedent this ADR mirrors.
- Parity charter §1, §3.1, §5, §6/§6a (`specs/claudian-reboot/parity-charter.md`).
- `claudian-audit-frontend.md` / `claudian-audit-backend.md`.
- Claudian reference: `chat.ts:31/39/46/47/137/143/152`, `diff.ts:5/12/18/27`, `tools.ts:32/55/58/66`,
  `core/tools/todo.ts`, `collapsible.ts`, `ToolCallRenderer.ts:60/79/119`, `DiffRenderer.ts:9/23/76`,
  `MessageRenderer.renderContentBlocks`, `subagentLifecycleResolution.ts`.
- ADR-008 (narrow ports), ADR-004 (`Result`), ADR-001 (DDD), ADR-PSR-001 (reboot — IconPort/SpIcon
  regrow per phase), CLAR-CC-005 (markdown backing deferred to P2).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
