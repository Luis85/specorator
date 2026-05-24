---
id: ADR-RR-002
title: Make MarkdownRenderPort.render async and back it with Obsidian's real MarkdownRenderer, walked to the unchanged SafeRenderResult DTO
status: accepted       # human-directed 2026-05-25 (charter §6a delegation — "review how claudian solved it, apply it; else my recommendation"). proposed | accepted | deprecated | superseded by ADR-NNNN
date: 2026-05-25
deciders:
  - architect
  - maintainer (human)        # ACCEPTED 2026-05-25 — charter §6a delegation: "review how claudian solved it, apply it; else my recommendation" (claudian's solution IS the recommendation)
consulted:
  - dev
  - qa
informed:
  - planner
  - reviewer
  - brand-reviewer
supersedes: []
superseded-by: []
tags: [architecture, chat, rich-rendering, markdown, claudian-reboot, P2]
---

# ADR-RR-002 — Make `MarkdownRenderPort.render` async and back it with Obsidian's real `MarkdownRenderer`, walked to the unchanged `SafeRenderResult` DTO

## Status

**Accepted** — human-directed 2026-05-25 under the parity-charter §6a delegation ("review how
claudian solved it, apply it; else my recommendation" — and claudian's solution **is** the
recommendation). This ADR **supersedes ADR-RR-001 §3** (the "Obsidian markdown backing with an
unchanged *synchronous* return shape" decision). All other parts of ADR-RR-001 (§1 typed
`toolUseResult` + additive `ChatMessage`/block model, §2 per-type components behind a thin
dispatcher, §4 `IconPort`) remain **in force, unchanged**.

## Context

ADR-RR-001 §3 decided to upgrade the **production** backing of `MarkdownRenderPort.render` from the
pure paragraph-only `safeMarkdownRender` to Obsidian's `MarkdownRenderer`, **keeping the
`SafeRenderResult` structured-node return shape**. It recorded this as a "backing swap, not an
ADR-worthy shape change," and explicitly held open one escape hatch (ADR-RR-001 §3, spec §12, the
SPEC-RR-010/011 notes): *if the Obsidian fragment walk turns out to need a return-shape change, that
change returns here as an amendment/superseding ADR.*

That escape hatch has now fired. ADR-RR-001 §3 assumed the port could stay **synchronous** while the
Obsidian backing walked a populated fragment. It cannot:

1. **`MarkdownRenderPort.render` is synchronous** (`render(markdown: string): SafeRenderResult`), but
   **Obsidian's `MarkdownRenderer.render` is asynchronous** (it returns a `Promise<void>` and
   populates the target element on a later microtask).

2. The current Obsidian backing therefore **kicks off `MarkdownRenderer.render` and reads the target
   element immediately** — before Obsidian has populated it — so the fragment walk always sees an
   empty element and **always degrades to the pure paragraph-only baseline** (the documented
   "degrade-never-throw within the sync contract" path, workflow-state 2026-05-24 infra-batch
   deviation #2).

3. **Observed symptom (real-Obsidian testing, 2026-05-25):** assistant markdown renders **plain** —
   no headings, tables, bold, lists; `<!---->` comment gaps appear where bold/inline emphasis should
   be. Every unit test, the `npm run dev` smoke, and the demo pass, because the Mock/Fixture pure
   backing returns a fully-populated (if P1-subset) DTO synchronously — the async mismatch only bites
   the real `ObsidianBridge` backing, which is coverage-excluded (`src/infrastructure/obsidian/**`)
   and exercised only by the manual TEST-RR-043 leg.

**Claudian ground-truth (the reference, confirmed by reading the source).**
`D:/Projects/claudian-main/src/features/chat/rendering/MessageRenderer.ts` `renderContent`
(lines 625–648) is **`async`** and does:

```ts
async renderContent(el: HTMLElement, markdown: string, options?: RenderContentOptions): Promise<void> {
  el.empty();
  // ...
  await MarkdownRenderer.render(this.app, processedMarkdown, el, '', this.component);
  // ...post-process pre/code wrappers, file links...
}
```

It also carries `escapeMathDelimitersForStreaming` / `deferMath` (lines 30–38, 633–635) so that
**incremental streaming** renders stay stable as `markdown` accumulates. Claudian renders
**imperatively into a live DOM element**; our seam keeps the DTO contract instead (NFR-RR-006: no
`v-html`), so our adaptation is: **`await` the real renderer into a *detached* element, then walk the
detached fragment into the `MarkdownNode[]` DTO** so Vue stays declarative.

This is exactly the path ADR-RR-001 §3 chose — the **only** correction is that the port's return
must become a `Promise`, because the real renderer is async. ADR-008 (narrow ports), ADR-004
(`Result`), ADR-001 (DDD), ADR-003 (Vue), ADR-CC-001 (chat seam), and **ADR-RR-001 §1/§2/§4** all
remain in force; this ADR rules only on the **asynchrony of the render seam**.

## Decision

We will make `MarkdownRenderPort.render` **asynchronous** and back the production path with
Obsidian's real `MarkdownRenderer`, walking the rendered fragment into the **unchanged**
`SafeRenderResult` / `MarkdownNode` DTO.

### 1. The port return becomes a `Promise` — the DTO shape is unchanged

```ts
// src/domain/ports/MarkdownRenderPort.ts
export interface MarkdownRenderPort {
  render(markdown: string): Promise<SafeRenderResult>;   // was: SafeRenderResult (ADR-RR-001 §3)
}
```

- `SafeRenderResult` and the `MarkdownNode` / `MarkdownInline` union are **unchanged** (the SPEC-RR-011
  additive widening — `heading` / `code_block` / `list` + `strong` / `em` — stands). We still walk the
  fragment into structured nodes; **no `v-html`, no DOM element, no HTML string crosses the port**
  (NFR-RR-006). The **only** change is `SafeRenderResult` → `Promise<SafeRenderResult>`.

### 2. `ObsidianBridge` awaits the real renderer into a detached element, then walks it

- `ObsidianBridge.createMarkdownRenderPort().render(markdown)` `await`s
  `MarkdownRenderer.render(app, markdown, detachedEl, sourcePath, component)` into a **detached**
  element, **then** walks the now-populated fragment into `MarkdownNode[]` (the SPEC-RR-010 walk,
  unchanged). The detached element is discarded after the walk. Total: on any internal failure it
  `await`s nothing and falls back to a single `paragraph` node carrying the raw markdown as
  `{kind:'text'}` (degrade, never throw — the degrade is now reached only on genuine failure, not on
  the always-empty-fragment race).

### 3. Mock / LocalStorage return a resolved promise wrapping the pure baseline

- `MockBridge` and `LocalStorageBridge` keep the pure, synchronous `safeMarkdownRender` and return
  `Promise.resolve(safeMarkdownRender(markdown))`. They stay **synchronous-fast** (no real awaiting),
  so `npm run dev`, the demo, and every Mock-backed test resolve on a microtask with the same
  byte-identical DTO as before. The pure `safeMarkdownRender` itself stays **sync, pure, total** and
  is the Mock/Fixture backing **and** the production degrade path.

### 4. `MarkdownBlock.vue` becomes async-aware

- `MarkdownBlock.vue` calls the now-async port and holds the resolved `SafeRenderResult.nodes` in
  **reactive state**, rendering it declaratively (the existing node-kind `v-for`/`v-if` tree —
  unchanged, still no `v-html`). It renders:
  - **on mount**, and
  - **on `content` change** (when the `markdown`/`content` prop changes — i.e. as a streaming text
    block accumulates).
- While a render is in flight, the block shows the **last-rendered nodes** (or, on first render, the
  **raw text** as a single `paragraph`/`text` node) so there is never a blank flash — matching
  claudian's incremental feel. Debounce / replace-latest (drop a superseded in-flight result if a
  newer `content` has already arrived) is acceptable and recommended to keep streaming cheap.

### 5. Streaming cadence (recorded for the implementer)

Re-rendering through the **real Obsidian renderer on every text chunk** is expensive. The chosen
cadence:

- **The pure baseline may render mid-stream on every chunk** — it is sync and cheap, so the live
  block can show pure-rendered nodes (or raw text) as text accumulates.
- **The Obsidian rich render runs on chunk boundaries or at `done`** — not on every keystroke-sized
  delta. Concretely: debounce the rich render (replace-latest) and/or run it when the text block is
  finalised (`done`), so the user sees incremental text immediately and the full Obsidian-rich pass
  settles shortly after. This keeps NFR-RR-014 (incremental render, no batch-on-complete) while
  bounding the cost of the async renderer.
- The implementer records the concrete debounce interval / boundary trigger they pick in the
  implementation log; either (chunk-boundary debounce **or** at-`done`) satisfies this ADR.

## Considered options

### Option A — Async port + Obsidian's real `MarkdownRenderer`, walked to the unchanged DTO; `MarkdownBlock` async-aware *(chosen)*
- Pros: this is **exactly how claudian solves it** (`async renderContent` + `await
  MarkdownRenderer.render`), so it is parity-faithful and proven (charter §1); the DTO shape and the
  no-`v-html` invariant (NFR-RR-006) are preserved — only the return type gains a `Promise`; the
  three-bridge story holds (Obsidian awaits the real renderer; Mock/LocalStorage `Promise.resolve` the
  pure baseline); fixes the real-Obsidian plain-markdown defect at the root (the sync read race);
  Obsidian's renderer covers callouts/embeds/math/tables that a hand-rolled parser would miss.
- Cons: `MarkdownBlock.vue` and the port's callers must become async-aware (reactive state + watch);
  the streaming re-render needs a cadence guard (recorded in §5); the production async walk stays
  coverage-excluded infra (manual TEST-RR-043 leg).

### Option B — Keep the sync port; build a richer pure synchronous markdown renderer
- Hand-extend `safeMarkdownRender` to parse headings/tables/lists/bold without Obsidian.
- Pros: no async; fully pure/total; no Obsidian dependency in the path.
- Cons: **re-implements a markdown parser** that CLAR-CC-005 explicitly deferred to Obsidian; misses
  Obsidian-specific syntax (callouts, embeds, math, wikilinks) that real notes use; perpetually
  chases Obsidian's renderer for parity. Rejected — it solves the symptom by abandoning the reason
  CLAR-CC-005 chose Obsidian's renderer in the first place.

### Option C — Imperative `v-html` / DOM-host render (mount Obsidian's output element directly)
- Let `MarkdownRenderer.render` populate a real element and host that element in the component (or
  assign `innerHTML`).
- Pros: simplest — no fragment walk; exactly claudian's imperative DOM.
- Cons: **violates NFR-RR-006** (no `v-html`/`innerHTML`/DOM-host in the render path), the hardest P2
  invariant and an epic-wide constraint. Rejected.

## Consequences

### Positive
- Real-Obsidian markdown renders **rich** (headings, tables, bold, lists, callouts, embeds, math) —
  the plain-render / `<!---->`-gap defect is fixed at the source (the sync read race is gone).
- The fix is **minimal and additive to the type contract**: `SafeRenderResult` →
  `Promise<SafeRenderResult>` is the only signature change; the DTO node model (SPEC-RR-011) and the
  no-`v-html` invariant (SPEC-RR-034, NFR-RR-006) are untouched.
- Parity with claudian's `async renderContent` is now exact (charter §1), including the incremental
  streaming feel.
- The three-bridge story holds and the Mock/Fixture/pure path is unaffected except that callers now
  `await` it (resolves on a microtask, same DTO).

### Negative
- `MarkdownBlock.vue` carries reactive render state + a watcher and a streaming-cadence guard (§5) —
  more component logic than a synchronous one-shot render.
- A streaming text block can re-run the (async) Obsidian render multiple times per turn; the cadence
  guard (debounce / at-`done`) keeps this cheap but is a watch item the implementer must honour
  (recorded in §5).
- Every caller of `MarkdownRenderPort.render` (and the Mock/Fixture test helpers that flatten the
  result) must `await` the promise; this is a compile-surfaced, mechanical change.

### Neutral
- The production Obsidian async walk stays under `src/infrastructure/obsidian/**` (coverage-excluded)
  and is validated by the manual **TEST-RR-043** leg (real `claude` CLI rich turn in Obsidian) — the
  rich-render manual leg is now the proof that the async fix works end-to-end.
- A new Mock-backed component test (TEST-RR delta) proves the async port resolves and `MarkdownBlock`
  renders rich nodes (heading / strong / list) from a resolved `SafeRenderResult` — the automatable
  half of the seam.

## Compliance
- ESLint `no-restricted-properties` (`innerHTML`/`outerHTML`/`insertAdjacentHTML`) + `vue/no-v-html`:
  zero raw-HTML sink in `MarkdownBlock.vue` or the `ObsidianBridge` fragment walk — the async change
  introduces no DOM-injection sink (NFR-RR-006).
- A review checklist item confirms `MarkdownRenderPort.render` returns `Promise<SafeRenderResult>`
  and the `SafeRenderResult` / `MarkdownNode` field contract is otherwise unchanged.
- The Mock/LocalStorage backings return `Promise.resolve(safeMarkdownRender(...))` (pure baseline);
  the pure `safeMarkdownRender` itself stays synchronous (a unit test asserts its return is a plain
  `SafeRenderResult`, not a promise).
- TEST-RR-043 (manual, human-owned) is re-scoped to verify rich markdown (heading/bold/list/table)
  renders on the real Obsidian backing — the async fix's end-to-end proof.

## References
- Supersedes: **ADR-RR-001 §3** (Obsidian markdown backing with an unchanged *synchronous* return
  shape). ADR-RR-001 §1/§2/§4 remain in force.
- ADR-RR-001 (`docs/adr/ADR-RR-001-rich-block-model-and-render-seam.md`) — §3 escape hatch ("if the
  walk needs a return-shape change, return here as an amendment/superseding ADR") fired by this ADR.
- Spec delta: `specs/rich-rendering/spec.md` — SPEC-RR-010 / SPEC-RR-011 (async signature) + SPEC-RR-019/020/022
  (MarkdownBlock async-render) + the TEST-RR-043 / Mock-backed async-render TEST-RR delta + §12 async watch item.
- Claudian ground-truth: `D:/Projects/claudian-main/src/features/chat/rendering/MessageRenderer.ts`
  `renderContent` (lines 625–648, `async` + `await MarkdownRenderer.render`), `escapeMathDelimitersForStreaming` /
  `deferMath` (lines 30–38, 633–635).
- CLAR-CC-005 (Obsidian markdown backing deferred to P2); CLAR-RR-003 part 2 (the render-seam +
  MarkdownRenderPort-backing design call).
- NFR-RR-006 (no `v-html`/`innerHTML`), NFR-RR-014 (incremental render), REQ-RR-020a.
- Parity charter §6a delegation (`specs/claudian-reboot/parity-charter.md`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
