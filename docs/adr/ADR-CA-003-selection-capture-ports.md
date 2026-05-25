---
id: ADR-CA-003
title: Capture editor + canvas selection behind a SelectionSourcePort and a SelectionHighlightPort; ship those two sources and capability-gate the browser leg honestly
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
tags: [architecture, ports, selection, capability-gate, claudian-reboot, P5]
---

# ADR-CA-003 — Selection-capture ports + which sources ship vs gate

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CA-002**. Unblocks
`PRD-CA-001` (REQ-CA-013..019).

## Context

Claudian captures three selection sources via polling controllers (`SelectionController` for the
editor, `CanvasSelectionController`, `BrowserSelectionController`) and paints a highlight over the
captured range (`SelectionHighlight`). Capture is Obsidian/Electron-coupled, so under our rules
(Vue-never-imports-`obsidian`, NFR-CA-002) it must live behind a port. Feasibility differs sharply by
source:

- **Editor selection** — CM6 editor selection is a clean Obsidian API; a port wraps it cleanly.
- **Canvas selection** — Obsidian canvas node selection; the `canvas` mock **already exists** in
  `tests/__fakes__/fake-ports.ts`, so the seam is testable today.
- **Browser selection** — Claudian's `BrowserSelectionController` reads a selection out of an
  embedded view via `webview.executeJavaScript` / `iframe.contentDocument`. That is
  Electron/webview-specific and fragile; whether the production bridge can read it at all is
  uncertain.

The charter's honesty pattern (ADR-TS-004) governs uncertain capabilities: gate the affordance, never
silently drop. The polling cadence (Claudian's 250 ms) is an implementation detail, not a contract.

## Decision

### 1. Two narrow ports: `SelectionSourcePort` (capture) and `SelectionHighlightPort` (paint)

Capture and highlight are two different Obsidian couplings (read a selection vs draw a decoration), so
they are two ports (interface segregation, ADR-008):

```ts
// src/domain/ports/SelectionSourcePort.ts
export interface SelectionSourcePort {
  /** The current editor/canvas/(capability-permitting) browser selection, or null. */
  getCurrentSelection(): CapturedSelection | null;
  /** Subscribe to selection changes; the impl owns the poll cadence (250 ms parity). */
  onSelectionChange(listener: (sel: CapturedSelection | null) => void): Unsubscriber;
  /** Honest capability flag for the fragile leg (REQ-CA-018, ADR-TS-004 pattern). */
  readonly supportsBrowserSelection: boolean;
}

// src/domain/ports/SelectionHighlightPort.ts
export interface SelectionHighlightPort {
  show(target: EditorSelectionContext): void;   // paint over the captured editor range
  clear(): void;                                 // remove the highlight (REQ-CA-015)
}
```

`CapturedSelection` is a pure domain discriminated union (`src/domain/chat/attachments/Selection.ts`),
mirroring the three Claudian controllers' `getContext` shapes — the DTOs ADR-CA-001 reserved slots
for:

```ts
export interface EditorSelectionContext {
  readonly kind: 'editor';
  readonly notePath: string;
  readonly selectedText: string;
  readonly startLine: number;   // 0/1-based fixed by SPEC; carried as captured
  readonly lineCount: number;
}
export interface CanvasSelectionContext {
  readonly kind: 'canvas';
  readonly canvasPath: string;
  readonly nodeIds: readonly string[];
}
export interface BrowserSelectionContext {
  readonly kind: 'browser';
  readonly source: string;
  readonly selectedText: string;
  readonly title?: string;
  readonly url?: string;
}
export type CapturedSelection =
  | EditorSelectionContext | CanvasSelectionContext | BrowserSelectionContext;
```

### 2. Ship editor + canvas; capability-gate the browser leg

P5 **ships editor + canvas** capture behind `SelectionSourcePort` (both feasible; the canvas mock
exists). The **browser leg is capability-gated** on `supportsBrowserSelection`:

- `ObsidianBridge` sets `supportsBrowserSelection` only if it can actually read an embedded view's
  selection in this Obsidian/Electron build; otherwise `false`. P5 may ship it `false` — that is an
  honest defer, not a silent drop (REQ-CA-018 acceptance: "given no capability, no browser-selection
  context is captured and no error surfaces").
- The UI renders the browser-selection affordance **only where `supportsBrowserSelection` is true**
  (ADR-TS-004 honesty: gate the affordance, render nothing misleading where it cannot work).
- The DTO + the request slot (`browserSelection?`) ship now regardless, so the leg lights up additively
  when a future bridge can read it — no contract reshape (REQ-CA-018 `could`).

### 3. Highlight + focus hand-off + degrade

- `SelectionHighlightPort.show/clear` paints/removes the captured-range highlight (REQ-CA-014/015),
  ported from `SelectionHighlight.showSelectionHighlight`. Highlight is editor-only (canvas/browser
  carry no editor range to paint).
- **Focus hand-off (REQ-CA-016):** the selection is **retained** while focus moves from the source
  editor into the chat surface (not treated as a deselection). This is a UI concern (the controller
  composable that drives the port knows whether focus is within the chat surface); the port stays a
  pure capture/paint seam.
- **Graceful degrade (NFR-CA-010):** transient poll errors are swallowed inside the impl (never
  surface as a crash); `MockBridge`/`LocalStorageBridge` return an inert source (no selection,
  `supportsBrowserSelection: false`) so the demo + tests never throw.

## Considered options

### Option A — One `EditorSelectionPort` covering editor + canvas, separate highlight
- Pros: one capture port.
- Cons: editor and canvas have different DTO shapes + the browser leg has no home; conflates three
  sources behind one method's return contract. Partially rejected (we keep one capture port but make
  it a union over all three sources, not editor-only).

### Option B — `SelectionSourcePort` (union capture, all three sources) + `SelectionHighlightPort` *(chosen)*
- Pros: one capture seam returning a discriminated union (editor/canvas/browser); a separate highlight
  port (different coupling); the browser leg is a gated member of the same union, so it lights up
  additively; the canvas mock already fits.
- Cons: a union return type the UI must narrow (trivial; the DTOs are a discriminated union).

### Option C — Three separate capture ports (one per controller)
- Pros: literal parity with Claudian's three controllers.
- Cons: three ports + keys + composables + nine bridge impls for one user-facing "capture the
  selection" concept; over-segments a single consumer. Rejected (ADR-008 — one port per consumer; the
  consumer is "the captured selection").

## Consequences

### Positive
- Editor + canvas selection ship behind a clean, testable seam (canvas mock already present).
- The browser leg is honestly gated (ADR-TS-004) — present where it works, invisible where it cannot,
  never a broken affordance, never a silent drop.
- The selection DTOs are pure data filling the `ChatTurnRequest` slots ADR-CA-001 reserved — additive.

### Negative
- The production `supportsBrowserSelection` value depends on the Obsidian/Electron build; P5 may ship
  it `false` and revisit on the manual/parity leg (the single final human review gate).
- Two ports + keys + composables + three bridge impls each are added (earned by the capture + paint
  consumers).

### Neutral
- The 250 ms poll cadence is an impl detail of the `ObsidianBridge` source, not a contract; the
  mock/demo sources are inert.

## Compliance

- A test asserts editor capture records `{ notePath, selectedText, startLine, lineCount }` and canvas
  capture records `{ canvasPath, nodeIds }` (REQ-CA-013/017), using the existing fake-ports canvas
  mock.
- A test asserts that with `supportsBrowserSelection: false` no browser-selection context is captured
  and no error surfaces (REQ-CA-018), and that the browser affordance is not rendered.
- A test asserts the highlight shows while captured + editor unfocused and clears on deselection
  (REQ-CA-014/015), and that focus hand-off to the composer retains the selection (REQ-CA-016).
- A test asserts a transient poll error does not cross a boundary as a crash (NFR-CA-010).
- A review check confirms no `obsidian` symbol in `src/ui/**` for selection (capture/paint via the
  ports, NFR-CA-002) and both ports exist in all three bridges (NFR-CA-001).

## References

- PRD-CA-001 — REQ-CA-013..019; CLAR-CA-002; NFR-CA-002/010.
- `specs/context-attachments/design.md` Part C.
- **ADR-CA-001** (the request slots these DTOs fill), **ADR-TS-004** (the capability-honesty pattern
  the browser gate follows), ADR-008 (one port per consumer), ADR-CC-001 §3/§4 (grow per phase).
- Claudian reference: `features/chat/controllers/SelectionController.ts`
  (`poll:79`/`getContext:377`/`showHighlight:311`/`handleDeselection:290`/`clear:396`/
  `isFocusWithinChatSidebar:246`), `CanvasSelectionController.ts` (`poll:55`/`getContext:126`),
  `BrowserSelectionController.ts` (`:51/:283`), `shared/components/SelectionHighlight.ts`
  (`showSelectionHighlight:71`).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
