---
id: SPEC-CA-001
title: Context & Attachments (P5) — implementation-ready contracts
stage: specification
feature: context-attachments
area: CA
epic: claudian-reboot
phase: P5
status: complete
owner: architect
integration_branch: next
reference: D:\Projects\claudian-main                    # MIT, read-only structural + visual parity reference
inputs:
  - specs/context-attachments/requirements.md           # PRD-CA-001 (accepted 2026-05-25; REQ-CA-001..028 + NFR-CA-001..013)
  - specs/context-attachments/design.md                 # DESIGN-CA-001 Parts A/B/C (complete)
  - docs/adr/ADR-CA-001-attachment-context-model.md      # accepted — additive ChatTurnRequest fields + AttachedFileRef/AttachedImage + VaultPort.readBinary + base64 transport
  - docs/adr/ADR-CA-002-extract-aux-model-port-for-cold-start-aux-queries.md  # accepted — AuxModelPort + re-point GenerateTitle/RefineInstruction
  - docs/adr/ADR-CA-003-selection-capture-ports.md       # accepted — SelectionSourcePort + SelectionHighlightPort + browser capability-gate
  - docs/adr/ADR-CA-004-inline-edit-modal-seam-and-word-level-diff.md  # accepted — OpenInlineEditFn seam + parseInlineEditResponse + computeWordDiff → DiffView
  - specs/composer-power/spec.md                        # SPEC-CP-* (the P4 composer + modal-seam this extends)
  - specs/threads-sessions/spec.md                      # SPEC-TS-016 (the cold-start side-query pattern AuxModelPort generalises)
  - specs/rich-rendering/spec.md                        # SPEC-RR-003/029 (the DiffLine/ToolDiffData + DiffView the word-diff reuses)
  - src/domain/chat/ChatTurn.ts                         # the reserved ChatTurnRequest fields (ChatTurn.ts:12-13) regrow here
  - src/domain/ports/{VaultPort,ChatRuntimePort,index}.ts
  - src/infrastructure/bridge/ports.ts
  - src/ui/chat/{ChatComposer,DiffView,modalSeam}.vue   # DiffView reused UNCHANGED; ChatComposer + modalSeam grow additively
  - src/application/chat/{computeDiff,splitDiffHunks}.ts
  - src/application/threads/{titleGeneration,GenerateTitleUseCase}.ts   # the re-point target (ADR-CA-002 §3)
  - src/application/chat/composer/{instructionRefine,RefineInstructionUseCase}.ts  # the re-point target (ADR-CA-002 §3)
  - tests/__fakes__/fake-ports.ts                       # grows an `auxModel` member
created: 2026-05-25
updated: 2026-05-25
---

# Specification — Context & Attachments (P5)

Implementation-ready contracts for P5. Every contract is grounded in `design.md` (DESIGN-CA-001), the
four accepted P5 ADRs (**ADR-CA-001/002/003/004**), the P1 turn-request contract (SPEC-CC), the P2
diff renderer (SPEC-RR-003/029), the P3 cold-start side-query (SPEC-TS-016), the P4 composer +
modal-seam (SPEC-CP-019/027), and Claudian's real code under `D:\Projects\claudian-main` (cited
inline). **Two independent teams should build the same thing from this document.**

> **Conventions in force (inherited from P1–P4, do not relax):** DDD inward-only imports (ADR-001,
> `domain ← application ← infrastructure ← ui`, NFR-CA-001); narrow ports + three bridges (ADR-008,
> NFR-CA-001); `Result<T,E>` at every use-case boundary, **pure-total** transforms elsewhere (ADR-004,
> NFR-CA-004/010); streaming failure stays the `{type:'error'}` `StreamChunk` member, **not** a thrown
> error across the port (ADR-CC-001 §1/§2) — the aux side-query maps error/empty/abort to a `Result`
> at the use-case boundary (REQ-CA-027); DTO-only store boundary — no domain class instance / function
> / Obsidian handle crosses into reactive state (ADR-003, NFR-CA-004); Vue `<script setup>` only
> (NFR-CA-004); **no `obsidian`/`node:*` import under `src/ui/**`** (NFR-CA-002); **no
> `v-html`/`innerHTML`/`outerHTML`/`insertAdjacentHTML`** anywhere (NFR-CA-003); blocking flows use an
> Obsidian `Modal` via the modal seam, never `window.confirm`/`alert`/`prompt` (NFR-CA-003); `--sp-*`
> token parity, colour literals confined to the token layer (NFR-CA-007); WCAG 2.2 AA + full keyboard
> nav + non-colour cues + reduced-motion + forced-colors (NFR-CA-008); tests mirror `src/` +
> `data-testid` PageObjects, coverage 80/70/80/80 (NFR-CA-005/006); `manifest.json` untouched
> (NFR-CA-012); **no stored secret, no migration, image payload bounded — load-or-default** (NFR-CA-009);
> **no new runtime dependency** (NFR-CA-011); **additive growth only — no rename/removal of any P1–P4
> member** (NFR-CA-001, ADR-CC-001).

This spec defines **30 spec items** across six layer groups (SPEC-CA-001..030). The Tasks stage
(`planner`) decomposes them into `T-CA-NNN`; the QA stage turns the TEST-CA-NNN scenarios (§8) into
automated tests. SPEC-CA items that **extend** a P1–P4 counterpart cite the extension point.

> **Two open items the design (DESIGN-CA-001 §Open clarifications) handed to `/spec:specify` —
> RESOLVED HERE:**
> 1. **`EditorSelectionContext.startLine` indexing** — settled in SPEC-CA-003: **0-based** (the CM6
>    `editor.getCursor().line` is 0-based; the captured value is carried verbatim, no off-by-one
>    re-base). The acceptance "starting at line 10" in REQ-CA-013 is the human-readable description;
>    the recorded field is the 0-based editor line. A `lineCount` ≥ 1 for any non-empty selection.
> 2. **The wikilink display format** — settled in SPEC-CA-006/SPEC-CA-019: the chip `displayName` is
>    the basename **without** extension (`folder/note.md` → `note`), parity Claudian
>    `utils/fileLink.ts`; the rendered link reads as the Obsidian wikilink form `[[folder/note.md]]`
>    but is a declarative Vue element (no raw HTML, NFR-CA-003), and activation routes through
>    `WorkspacePort.openFile(path)` (NFR-CA-002), not `app.workspace.openLinkText`.

---

## 0. Spec-item index

| Spec item | Title | Layer | New / Extends | REQ / NFR links |
|---|---|---|---|---|
| **DOMAIN** | | | | |
| SPEC-CA-001 | `ChatTurnRequest` — five additive optional context fields (`attachedFiles?`/`images?`/`editorSelection?`/`canvasSelection?`/`browserSelection?`) | domain | extends `ChatTurn.ts` | REQ-CA-004/010/019; ADR-CA-001 §1 |
| SPEC-CA-002 | `AttachedFileRef` / `AttachedImage` pure DTOs (`src/domain/chat/attachments/Attachments.ts`) | domain | new | REQ-CA-001/007/010; ADR-CA-001 §1/§3 |
| SPEC-CA-003 | `CapturedSelection` union (`EditorSelectionContext`/`CanvasSelectionContext`/`BrowserSelectionContext`) (`Selection.ts`) | domain | new | REQ-CA-013/017/018; ADR-CA-003 §1 |
| SPEC-CA-004 | `AuxModelPort` interface + `AUX_MODEL_PORT` key + barrel re-export | domain | new (ADR-CA-002 §1) | REQ-CA-021; ADR-CA-002 §1 |
| SPEC-CA-005 | `SelectionSourcePort` + `SelectionHighlightPort` (+ `supportsBrowserSelection`) + keys + barrel | domain | new (ADR-CA-003 §1) | REQ-CA-013..019 |
| SPEC-CA-006 | `VaultPort.readBinary(path): Promise<Uint8Array>` additive method | domain | extends `VaultPort.ts` | REQ-CA-010; ADR-CA-001 §3 |
| **INFRA** | | | | |
| SPEC-CA-007 | `ObsidianBridge` — `AuxModelPort` (cold-start delegate), `SelectionSourcePort` (CM6 + canvas poll), `SelectionHighlightPort` (CM6 decoration), `VaultPort.readBinary` (real bytes); coverage-excluded → manual leg | infra | new | REQ-CA-013/014/021; NFR-CA-001 (manual leg) |
| SPEC-CA-008 | `MockBridge` — scriptable `AuxModelPort`, inert `SelectionSourcePort` (+ canvas mock), no-op recording `SelectionHighlightPort`, in-memory `readBinary` | infra | extends SPEC-CC/SPEC-TS mock | REQ-CA-013/017/021; NFR-CA-001/010 |
| SPEC-CA-009 | `LocalStorageBridge` — browser-safe `AuxModelPort` stand-in, inert selection ports (`supportsBrowserSelection:false`), localStorage `readBinary` | infra | extends SPEC-CC/SPEC-TS LS | REQ-CA-018/021; ADR-CA-003 §2 |
| SPEC-CA-010 | Image read + encode (`VaultPort.readBinary` → bounded base64; 8 MiB + MIME allow-list) | infra/app | new (ADR-CA-001 §3) | REQ-CA-010/012; NFR-CA-009 |
| **APPLICATION** | | | | |
| SPEC-CA-011 | `computeWordDiff` — pure word-level DP/LCS → `ToolDiffData` (feeds `DiffView`) | application | new (ADR-CA-004 §3) | REQ-CA-023; NFR-CA-011 |
| SPEC-CA-012 | `parseInlineEditResponse` — pure/total parse (replacement / insertion / clarification / failure) | application | new (ADR-CA-004) | REQ-CA-022 |
| SPEC-CA-013 | `inlineEditPrompt` — ported pure inline-edit system prompt | application | new (ADR-CA-004) | REQ-CA-021 |
| SPEC-CA-014 | `AddFileContextUseCase` — add/remove/idempotent file-set ops (`Result`) | application | new | REQ-CA-001/002/003 |
| SPEC-CA-015 | `AddImageUseCase` — allow-list + size gate + `readBinary` + base64 (`Result`) | application | new | REQ-CA-007/012; NFR-CA-009 |
| SPEC-CA-016 | `CaptureSelectionUseCase` — read source, drive highlight, focus-hand-off retain (`Result`) | application | new | REQ-CA-013..019 |
| SPEC-CA-017 | `InlineEditUseCase` — aux query → parse → outcome; clarification loop; `Result` boundary | application | new | REQ-CA-021/022/026/027 |
| SPEC-CA-018 | **Refactor:** `GenerateTitleUseCase` (P3) + `RefineInstructionUseCase` (P4) re-pointed onto `AuxModelPort` (behaviour-preserving; drains deleted) | application | extends SPEC-TS-016 / SPEC-CP-015 | ADR-CA-002 §3 |
| **UI** | | | | |
| SPEC-CA-019 | `FileChips.vue` — removable wikilink file chips (open via `WorkspacePort`) | ui | new | REQ-CA-001/003/005 |
| SPEC-CA-020 | `ImageContextBar.vue` + `ImageThumb.vue` — declarative `:src` thumbnails, open preview via seam | ui | new | REQ-CA-007/008/009/011 |
| SPEC-CA-021 | `SelectionIndicator.vue` — captured-selection chip + clear; browser affordance gated | ui | new | REQ-CA-015/018 |
| SPEC-CA-022 | `ChatComposer.vue` extension — a context-bar slot above the textarea (additive prop) | ui | extends SPEC-CP-019 | REQ-CA-001/004 |
| SPEC-CA-023 | `modalSeam.ts` — `OpenInlineEditFn` + `OPEN_INLINE_EDIT` key + `useOpenInlineEdit` + image-preview launcher | ui | extends SPEC-CP-027 | REQ-CA-008/020 |
| SPEC-CA-024 | `InlineEditModal.ts` (Obsidian `Modal`) reusing `DiffView` for the word-diff preview; `ImagePreviewModal.ts` | plugin | new | REQ-CA-020/023/024/025/026; NFR-CA-003 |
| SPEC-CA-025 | `useAuxModelPort` / `useSelectionSourcePort` / `useSelectionHighlightPort` composables | ui | extends SPEC-CC-017 | REQ-CA-013/021 |
| SPEC-CA-026 | Wiring — `AgentSidebarView` + `ui/main.ts` provide the three ports + the inline-edit + image-preview launchers | plugin/ui | extends SPEC-CP-028 | REQ-CA-008/020/021 |
| **STYLES** | | | | |
| SPEC-CA-027 | `--sp-*` token additions (file-context / file-link / image / inline-edit; word-diff rides the P2 diff tokens) | ui (styles) | extends SPEC-RR/SPEC-CP tokens | NFR-CA-007 |
| **CROSS-CUTTING** | | | | |
| SPEC-CA-028 | Additivity invariant (P1–P4 members byte-identical; the five `ChatTurnRequest` fields + `readBinary` + three ports are the only growth) | domain | — | NFR-CA-001 |
| SPEC-CA-029 | No-provider-branch + capability-gate invariant (inline edit via `AuxModelPort`/active runtime; browser leg via `supportsBrowserSelection`) | app/ui | — | REQ-CA-018/028 |
| SPEC-CA-030 | Result / image-no-secret / DOM-rule / observability invariant | cross | — | NFR-CA-003/009/010 |

---

# 1. Domain — types, ports, and additive growth (SPEC-CA-001..006)

Types under `src/domain/chat/attachments/` and `src/domain/ports/`. No `obsidian`, no `node:*`, no
Vue, no class — pure interfaces/unions (ADR-001). **Additive only: no P1–P4 field or member is renamed
or removed (NFR-CA-001, SPEC-CA-028).** The audit confirmed (DESIGN-CA-001 C.2 + the verbatim P1
`ChatTurn.ts`): the reserved fields at `ChatTurn.ts:12-13` are a doc-comment today; P5 turns the
comment into types.

## SPEC-CA-001 — `ChatTurnRequest` additive context fields (`src/domain/chat/ChatTurn.ts`)

**REQ:** REQ-CA-004/010/019 · **ADR:** ADR-CA-001 §1 · **Claudian ground-truth:** `runtime/types.ts:45`
(the full request shape these fields mirror), `features/chat/ui/FileContext.ts` /`ImageContext.ts` /the
selection controllers (the assembled context). **Append** the five optional fields; the P1 `text` +
`currentNotePath` stay byte-identical (the reserved `ChatTurn.ts:12-13` comment is replaced by the
types — `enabledMcpServers` / `externalContextPaths` stay excluded, NG3):

```ts
export interface ChatTurnRequest {
  text: string;
  currentNotePath?: string;
  // ---- P5 additive (SPEC-CA-001, ADR-CA-001 §1) — all optional; an unset request is byte-identical to P1 (G2) ----
  attachedFiles?: readonly AttachedFileRef[];   // file chips (REQ-CA-001..006)
  images?: readonly AttachedImage[];            // image context, bounded base64 (REQ-CA-007..012)
  editorSelection?: EditorSelectionContext;     // REQ-CA-013/019
  canvasSelection?: CanvasSelectionContext;     // REQ-CA-017/019
  browserSelection?: BrowserSelectionContext;   // REQ-CA-018/019 — capability-gated (ADR-CA-003 §2)
}
```

**Validation rules (per field):** every field is **optional**; absence is the P1 send path (G2). When
present, `attachedFiles` is a (possibly empty) readonly array of `AttachedFileRef` (SPEC-CA-002), each
`path` vault-relative no-leading-slash and **path-unique** within the array (the store keeps a keyed
set, REQ-CA-002); `images` is a readonly array of `AttachedImage` (SPEC-CA-002), each already passing
the 8 MiB + allow-list gate (SPEC-CA-015 — the request never carries a rejected image); the three
selection fields are at most **one captured selection** at a time (the union member matching the active
source). `PreparedChatTurn` / `ChatRuntimeQueryOptions` / `ChatRuntimeEnsureReadyOptions` stay
byte-identical; the runtime's `prepareTurn` folds the present context into the prompt it already builds
(additive, guarded on the optional fields — out-of-scope for this spec beyond the field contract).
**Imports** `AttachedFileRef`/`AttachedImage` from `./attachments/Attachments` and the selection union
from `./attachments/Selection`. Unit-testable as a type-shape contract (TEST-CA-001) + a serialisation
contract: a `{ text }`-only request serialises byte-identically to P1 (TEST-CA-002, NFR-CA-001).

## SPEC-CA-002 — Attachment DTOs (`src/domain/chat/attachments/Attachments.ts`)

**REQ:** REQ-CA-001/007/010/012 · **ADR:** ADR-CA-001 §1/§3 · **Claudian ground-truth:**
`features/chat/ui/file-context/state/FileContextState.ts` (the attached-file set), `utils/fileLink.ts`
(the display name), `utils/imageEmbed.ts` (`IMAGE_EXTENSIONS:15`). Pure domain data — readonly fields,
no class, no Obsidian — so they cross the Pinia store boundary (NFR-CA-004) and serialise cleanly:

```ts
export interface AttachedFileRef {
  readonly path: string;        // vault-relative, no leading slash (VaultPort contract)
  readonly displayName: string; // chip label — basename WITHOUT extension (fileLink parity; SPEC-CA-019)
}

/** A supported image MIME — the allow-list ported from Claudian `IMAGE_EXTENSIONS` (ADR-CA-001 §3). */
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface AttachedImage {
  readonly path: string;        // vault-relative source (the thumbnail display source + the read source)
  readonly mimeType: ImageMimeType;
  readonly byteSize: number;    // measured at attach time; the 8 MiB gate reads it (SPEC-CA-015)
  readonly dataBase64: string;  // the bounded base64 payload the runtime embeds in the turn (ADR-CA-001 §3)
}
```

**Validation rules:** `AttachedFileRef.path` non-empty, vault-relative; `displayName` is the basename
of `path` with the final extension stripped (`folder/a.md` → `a`; an extensionless file keeps its
basename). `AttachedImage.mimeType` is one of the four allow-list members (anything else is rejected
before an `AttachedImage` exists — SPEC-CA-015, REQ-CA-012); `byteSize` is a finite non-negative
integer ≤ `MAX_IMAGE_BYTES` (8 MiB); `dataBase64` is the base64 of the file's bytes (no data-URI prefix
— the runtime/CLI prompt-assembly owns the framing). **The payload carries no token, API key, vault
metadata, or path outside the vault** (NFR-CA-009, SPEC-CA-030). Re-exported from
`src/domain/chat/attachments/index.ts`. Unit-testable as a type-shape contract (TEST-CA-003).

## SPEC-CA-003 — `CapturedSelection` union (`src/domain/chat/attachments/Selection.ts`)

**REQ:** REQ-CA-013/017/018/019 · **ADR:** ADR-CA-003 §1 · **Claudian ground-truth:**
`features/chat/controllers/SelectionController.ts` (`getContext:377`),
`CanvasSelectionController.ts` (`getContext:126`), `BrowserSelectionController.ts` (`:283`). A pure
discriminated union — the DTOs whose `ChatTurnRequest` slots SPEC-CA-001 reserved:

```ts
export interface EditorSelectionContext {
  readonly kind: 'editor';
  readonly notePath: string;
  readonly selectedText: string;
  readonly startLine: number;   // 0-based CM6 editor line (RESOLVED: open item #1) — carried verbatim
  readonly lineCount: number;   // >= 1 for any non-empty selection
}
export interface CanvasSelectionContext {
  readonly kind: 'canvas';
  readonly canvasPath: string;
  readonly nodeIds: readonly string[];   // non-empty for a capture
}
export interface BrowserSelectionContext {
  readonly kind: 'browser';
  readonly source: string;        // the view source (e.g. the webview url host / view id)
  readonly selectedText: string;
  readonly title?: string;
  readonly url?: string;
}
export type CapturedSelection =
  | EditorSelectionContext | CanvasSelectionContext | BrowserSelectionContext;
```

**Validation rules:** `kind` is the discriminant the UI narrows on. `editor`: `notePath` non-empty
vault-relative, `selectedText` non-empty (an empty selection is never captured — REQ-CA-013 precondition,
EC-CA-5), `startLine` ≥ 0 (0-based), `lineCount` ≥ 1. `canvas`: `canvasPath` non-empty, `nodeIds`
non-empty. `browser`: `source` + `selectedText` non-empty; `title`/`url` optional (best-effort). The
union is re-exported from `src/domain/chat/attachments/index.ts`. Unit-testable as a type-shape +
narrowing contract (TEST-CA-013/017/018).

## SPEC-CA-004 — `AuxModelPort` (`src/domain/ports/AuxModelPort.ts`)

**REQ:** REQ-CA-021 · **ADR:** ADR-CA-002 §1 · **Claudian ground-truth:** `core/auxiliary/AuxQueryRunner.ts`
(the one-shot aux-query shape `QueryBackedInlineEditService` consumes). **New narrow port — three
consumers (title-gen, instruction-refine, inline-edit); one port (ADR-008 — the consumer is "a one-shot
cold-start aux query").**

```ts
import type { Result } from '@/domain/shared/Result';

export interface AuxModelRunOptions {
  /** Frames the one-shot request as the aux system prompt (title/refine/inline-edit prompts). */
  readonly systemPrompt?: string;
  /** Optional model override; absent → the runtime's default model. */
  readonly model?: string;
  /** Abort the in-flight aux query (modal dismissed mid-query — REQ-CA-027, EC-CA-8). */
  readonly signal?: AbortSignal;
}

export interface AuxModelPort {
  /**
   * Run one cold-start aux query and resolve the accumulated text. Delegates to the
   * active runtime's cold-start `query(turn, [], { forceColdStart: true })` so it
   * never steers the tab's main stream (REQ-CA-021). Maps a streaming `error` chunk,
   * an empty result, or an abort to `Result.err`; the accumulated non-empty text to
   * `Result.ok(text)`. NEVER throws across the boundary (ADR-CC-001 §2, NFR-CA-010).
   */
  run(prompt: string, options?: AuxModelRunOptions): Promise<Result<string>>;
}
```

**`run(prompt, options)` contract (signature · behaviour · pre/post · errors · side effects):**

| Aspect | Contract |
|---|---|
| Behaviour | Build a cold-start prepared turn whose text is `options.systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt`; drive `query(turn, [], { forceColdStart: true })`; accumulate `text` chunks (tool/thinking/usage ignored); `done` terminates. |
| Pre | The runtime is constructed (the impl owns a cold-start runtime, SPEC-CA-007/008). `prompt` may be any string. |
| Post | `Result.ok(text)` with the accumulated non-empty text; the tab's bound session + main stream are untouched (cold-start). |
| Errors | A streaming `error` chunk → `err`; an empty/whitespace accumulated text → `err`; an aborted `signal` → `err`; an unexpected generator throw is caught (`tryAsync`) → `err`. No exception crosses the boundary. |
| Side effects | None on the tab's session/stream (cold-start). The impl may spawn a one-shot subprocess (manual leg). |

**`AUX_MODEL_PORT` InjectionKey** (`src/infrastructure/bridge/ports.ts`, appended) and **barrel
re-export** of `AuxModelPort` + `AuxModelRunOptions` from `src/domain/ports/index.ts` (appended). Unit-
testable against the scriptable Mock impl (TEST-CA-021). **Note:** this is the seam SPEC-CA-018
re-points title-gen + instruction-refine onto — `run` subsumes their `prepareTurn` + drain loop.

## SPEC-CA-005 — Selection ports (`src/domain/ports/SelectionSourcePort.ts` + `SelectionHighlightPort.ts`)

**REQ:** REQ-CA-013/014/015/016/017/018/019 · **ADR:** ADR-CA-003 §1 · **Claudian ground-truth:**
`SelectionController` / `CanvasSelectionController` / `BrowserSelectionController` (capture),
`shared/components/SelectionHighlight.ts` (`showSelectionHighlight:71`). **Two narrow ports** (capture
vs paint are two different Obsidian couplings, interface segregation, ADR-008):

```ts
// src/domain/ports/SelectionSourcePort.ts
import type { CapturedSelection, EditorSelectionContext } from '@/domain/chat/attachments/Selection';
import type { Unsubscriber } from './shared';

export interface SelectionSourcePort {
  /** The current editor/canvas/(capability-permitting) browser selection, or null. Synchronous read. */
  getCurrentSelection(): CapturedSelection | null;
  /** Subscribe to selection changes; the impl owns the poll cadence (250 ms parity). Returns an unsubscriber. */
  onSelectionChange(listener: (sel: CapturedSelection | null) => void): Unsubscriber;
  /** Honest capability flag for the fragile browser leg (REQ-CA-018, ADR-TS-004 pattern). */
  readonly supportsBrowserSelection: boolean;
}

// src/domain/ports/SelectionHighlightPort.ts
import type { EditorSelectionContext } from '@/domain/chat/attachments/Selection';

export interface SelectionHighlightPort {
  show(target: EditorSelectionContext): void;   // paint over the captured editor range (REQ-CA-014)
  clear(): void;                                 // remove the highlight (REQ-CA-015)
}
```

**Contracts:** `getCurrentSelection` returns the live selection or `null` (never throws — a transient
poll error degrades to `null`, NFR-CA-010, EC-CA-12). `onSelectionChange` fires the listener with the
new selection (or `null` on deselection); the impl debounces/polls (250 ms is impl detail, not
contract). `supportsBrowserSelection` is a fixed boolean per bridge: `ObsidianBridge` sets it `true`
**only** where it can read an embedded-view selection (P5 may ship `false` — an honest defer, REQ-CA-018);
`MockBridge`/`LocalStorageBridge` ship `false`. `SelectionHighlightPort.show` paints only an
`EditorSelectionContext` (canvas/browser carry no editor range — DESIGN-CA-001 A.3); `clear` is
idempotent (clearing when nothing is painted is a no-op). **`SELECTION_SOURCE_PORT` +
`SELECTION_HIGHLIGHT_PORT` InjectionKeys** (`ports.ts`, appended) and **barrel re-exports** of both
interfaces (`index.ts`, appended). Unit-testable against the Mock impls (TEST-CA-013/014/017/018).

## SPEC-CA-006 — `VaultPort.readBinary` (`src/domain/ports/VaultPort.ts`)

**REQ:** REQ-CA-010 · **ADR:** ADR-CA-001 §3 · **Claudian ground-truth:** `utils/imageEmbed.ts` (reads
the vault file to embed). **Append one method** to `VaultPort`; the seven P0–P4 members stay
byte-identical (SPEC-CA-028):

```ts
export interface VaultPort {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  deleteFile(path: string): Promise<void>
  listFiles(folder: string): Promise<string[]>
  listFolders(parent: string): Promise<string[]>
  fileExists(path: string): Promise<boolean>
  createFolder(path: string): Promise<void>
  // ---- P5 additive (SPEC-CA-006, ADR-CA-001 §3) ----
  /** Read a vault file's raw bytes (the binary counterpart of readFile) — image read for base64 encode. */
  readBinary(path: string): Promise<Uint8Array>
}
```

**Contract:** `readBinary(path)` resolves the file's raw bytes as a `Uint8Array`; a missing file rejects
(the use case that calls it — SPEC-CA-015 — wraps it in `tryAsync` → `Result.err`, never an unguarded
throw). Path is vault-relative no-leading-slash, normalised by the impl (parity with `readFile`).
**No new port** — this is the one missing capability of the existing vault-IO seam (ADR-CA-001 §3,
ADR-008 "one port per consumer"; a review check confirms no `AttachmentPort` was added). All three
bridges implement it (SPEC-CA-007/008/009). Unit-testable against the in-memory Mock impl (TEST-CA-010);
the real Obsidian byte read is coverage-excluded → manual leg (TEST-CA-M3).

---

# 2. Infrastructure — three-bridge implementations (SPEC-CA-007..010)

The three bridges implement `AuxModelPort`, `SelectionSourcePort`, `SelectionHighlightPort`, and
`VaultPort.readBinary` (NFR-CA-001). `src/infrastructure/obsidian/**` is coverage-excluded (the real
Obsidian/CM6/canvas/subprocess legs are manual); `MockBridge` + `LocalStorageBridge` carry the unit-
testable behaviour.

## SPEC-CA-007 — `ObsidianBridge` impls (`src/infrastructure/obsidian/*`)

**REQ:** REQ-CA-013/014/021 · **NFR:** NFR-CA-001/002 (manual leg). **Claudian ground-truth:** the
selection controllers + `SelectionHighlight` + `AuxQueryRunner`.

- **`AuxModelPort`** — builds a fresh **cold-start** `ChatRuntimePort` (the same factory the tabs use,
  `bridge.createChatRuntime`), calls `query(prepareTurn({ text }), [], { forceColdStart: true })`,
  accumulates `text`, maps error/empty/abort → `Result` (SPEC-CA-004). The `signal` aborts the
  subprocess (`cancel()`). It never resumes a session — cold-start only (REQ-CA-021).
- **`SelectionSourcePort`** — a CM6 editor-selection read + an Obsidian canvas-node-selection read,
  polled at **250 ms** (parity Claudian); fires `onSelectionChange` on a change; transient read errors
  are **swallowed** (degrade to `null`, NFR-CA-010). `supportsBrowserSelection` reflects whether this
  Obsidian/Electron build can read an embedded-view selection (P5 may ship `false`, REQ-CA-018).
- **`SelectionHighlightPort`** — paints/removes a CM6 decoration over the captured editor range
  (`show`/`clear`), ported from `SelectionHighlight.showSelectionHighlight`.
- **`VaultPort.readBinary`** — `this.vault.readBinary(file)` → `new Uint8Array(arrayBuffer)`.

All four are **coverage-excluded** (`src/infrastructure/obsidian/**`) and verified on the manual
Obsidian leg (TEST-CA-M1/M3, like `ShellExecPort` SPEC-CP-008). No `obsidian` symbol leaks past this
file.

## SPEC-CA-008 — `MockBridge` impls (`src/infrastructure/mock/*`)

**REQ:** REQ-CA-013/017/021 · **NFR:** NFR-CA-001/010.

- **`AuxModelPort`** — a **scriptable** aux: `setAuxResponse(text)` / `setAuxError()` / `setAuxEmpty()`
  return canned text / an `err` / an empty result so the re-pointed title/refine tests (SPEC-CA-018) +
  the inline-edit tests (SPEC-CA-017) inject it. Honours `signal` (an already-aborted signal → `err`).
  Records the last `prompt` + `options.systemPrompt` for assertion.
- **`SelectionSourcePort`** — **inert** by default (`getCurrentSelection() → null`,
  `supportsBrowserSelection: false`) but **scriptable**: `setSelection(captured)` pushes a value to
  `onSelectionChange` listeners + makes `getCurrentSelection` return it (drives TEST-CA-013/017). The
  existing `canvas` mock in `tests/__fakes__/fake-ports.ts` backs the canvas capture path.
- **`SelectionHighlightPort`** — a **no-op that records calls** (`show`/`clear` push to an array) so a
  test asserts the highlight was driven (TEST-CA-014/015).
- **`VaultPort.readBinary`** — reads from the in-memory vault map; a missing path rejects (drives the
  `Result.err` path of SPEC-CA-015).

## SPEC-CA-009 — `LocalStorageBridge` impls (`src/infrastructure/localstorage/*`)

**REQ:** REQ-CA-018/021 · **ADR:** ADR-CA-003 §2.

- **`AuxModelPort`** — a browser-safe canned/echo stand-in (no subprocess) so the standalone demo never
  throws.
- **`SelectionSourcePort`** — **inert** (`getCurrentSelection() → null`, `supportsBrowserSelection:
  false`); `onSelectionChange` registers but never fires.
- **`SelectionHighlightPort`** — no-op.
- **`VaultPort.readBinary`** — localStorage-backed bytes (parity with the LS `readFile`).

## SPEC-CA-010 — Image read + encode (`src/infrastructure/.../imageEncode.ts` or in-use-case helper)

**REQ:** REQ-CA-010/012 · **NFR:** NFR-CA-009 · **Claudian ground-truth:** `utils/imageEmbed.ts`
(`IMAGE_EXTENSIONS:15`). The bounded base64 transform consumed by `AddImageUseCase` (SPEC-CA-015):

```ts
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 8 MiB (ADR-CA-001 §3; load-or-default, settings UX is P10)
export const IMAGE_MIME_ALLOW_LIST: readonly ImageMimeType[] =
  ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];   // ported from Claudian IMAGE_EXTENSIONS
```

**Encode:** given a `Uint8Array` + a resolved `ImageMimeType`, produce base64 (`btoa` over the byte
string in browser/Obsidian, or `Buffer` in Node — pure given the bytes, no Obsidian import). **Gate
order (SPEC-CA-015):** (1) MIME ∈ allow-list, else reject; (2) `byteSize ≤ MAX_IMAGE_BYTES`, else
reject — **measured before encode** so an over-limit file is never read into a base64 string
(REQ-CA-012). The MIME is resolved from the file extension (parity Claudian) — a `.exe` resolves to no
allow-list member → rejected (EC-CA-2). Unit-testable as a pure transform + the gate (TEST-CA-010/012).

---

# 3. Application — pure transforms, use cases, and the re-point (SPEC-CA-011..018)

Pure functions + use cases under `src/application/chat/{inlineEdit,attachments}/`. Pure transforms are
**total** (never throw, ADR-004); use cases return `Result<T,E>` and convert error-as-chunk / rejects
to `Result.err` (NFR-CA-004/010). No `obsidian`/Vue import.

## SPEC-CA-011 — `computeWordDiff` (`src/application/chat/inlineEdit/computeWordDiff.ts`)

**REQ:** REQ-CA-023 · **ADR:** ADR-CA-004 §3 · **NFR:** NFR-CA-011 · **Claudian ground-truth:** the
in-file word DP/LCS in `InlineEditModal.ts:171`. A **new pure word-level diff** feeding the **unchanged
P2 `DiffView`** (NOT the line-level `computeDiff` — the brief's line-vs-word correction, confirmed in
ADR-CA-004 §3). No new runtime dependency (in-repo DP/LCS, NFR-CA-011).

```ts
import type { ToolDiffData, DiffLine } from '@/domain/chat/diff/Diff';

/**
 * Word-level diff between `original` and `edited`, tokenised on `split(/(\s+)/)`
 * (words + whitespace runs kept as tokens, parity Claudian), LCS over the tokens.
 * Returns a single-row `ToolDiffData` whose `diffLines` are word-granular ops the
 * UNCHANGED DiffView renders (equal/insert/delete spans). Pure + total: identical
 * inputs → an all-equal diff (no-op, EC-CA-10); empty inputs → an empty diff;
 * never throws (NFR-CA-011). No filePath (inline edit has no tool file) → '' .
 */
export function computeWordDiff(original: string, edited: string): ToolDiffData;
```

**Contract:** tokenise both strings with `split(/(\s+)/)` (Claudian parity — whitespace runs are tokens
so word boundaries survive); compute the LCS over the token arrays (classic DP table); walk the
back-trace into `DiffLine[]` where each token is an `equal` / `insert` / `delete` entry (`text` = the
token); `stats` counts insert/delete tokens. **EC-CA-10:** `computeWordDiff(s, s)` → all-`equal`,
`stats {added:0, removed:0}` (a no-op preview). Empty strings → `{ filePath:'', diffLines:[], stats:{
added:0, removed:0 } }`. The REQ-CA-023 acceptance (`"The bank was steep"` → `"The riverbank was
steep"`) yields `bank` `delete` + `riverbank` `insert`, `The`/`was`/`steep` `equal`. **Reuse seam:** the
`ToolDiffData` is passed verbatim to `DiffView` (SPEC-CA-024) — the same component the P2 tool diff
uses, asserted by mounting `DiffView` with a word-diff `ToolDiffData` (TEST-CA-023). Unit-testable in
isolation (TEST-CA-023, EC-CA-10).

## SPEC-CA-012 — `parseInlineEditResponse` (`src/application/chat/inlineEdit/parseInlineEditResponse.ts`)

**REQ:** REQ-CA-022 · **ADR:** ADR-CA-004 · **Claudian ground-truth:** `parseInlineEditResponse`
(`utils/inlineEdit.ts:9`). A **pure/total** parse ported verbatim into the SPEC union:

```ts
export type InlineEditParse =
  | { kind: 'replacement'; text: string }    // <replacement>…</replacement>
  | { kind: 'insertion'; text: string }       // <insertion>…</insertion>
  | { kind: 'clarification'; question: string } // non-empty untagged response
  | { kind: 'failure' };                       // empty / whitespace response

export function parseInlineEditResponse(raw: string): InlineEditParse;
```

**Contract:** a `<replacement>…</replacement>` block (first match, `[\s\S]*?`, trimmed inner) →
`{kind:'replacement'}`; else a `<insertion>…</insertion>` block → `{kind:'insertion'}`; else a non-empty
trimmed string → `{kind:'clarification'}`; else (empty/whitespace) → `{kind:'failure'}` (REQ-CA-022
acceptance: `"<replacement>Bonjour</replacement>"` → replacement `Bonjour`; `"Which meaning?"` →
clarification; `""` → failure). **Pure/total** — no side effects, never throws. Mirrors the P3/P4
`parseTitleGenerationResponse` / `parseRefineResponse` style. Unit-testable in isolation (TEST-CA-022).

## SPEC-CA-013 — `inlineEditPrompt` (`src/application/chat/inlineEdit/inlineEditPrompt.ts`)

**REQ:** REQ-CA-021 · **ADR:** ADR-CA-004 · **Claudian ground-truth:** `core/prompt/inlineEdit.ts`. A
**pure** prompt builder, ported verbatim (parity with `TITLE_GENERATION_SYSTEM_PROMPT` /
`buildRefineSystemPrompt`):

```ts
/** The inline-edit system prompt, ported verbatim from claudian `core/prompt/inlineEdit.ts`. */
export const INLINE_EDIT_SYSTEM_PROMPT: string;

/** Frame the one-shot user message: the selected text + the instruction (+ note path context). */
export function buildInlineEditPrompt(selectedText: string, instruction: string, notePath?: string): string;
```

**Contract:** `INLINE_EDIT_SYSTEM_PROMPT` instructs the model to answer with a `<replacement>` /
`<insertion>` block or a plain-text clarification (the contract `parseInlineEditResponse` reads).
`buildInlineEditPrompt` frames the selection + instruction. Both are **pure/total**. The `systemPrompt`
is passed to `AuxModelPort.run(buildInlineEditPrompt(...), { systemPrompt: INLINE_EDIT_SYSTEM_PROMPT,
signal })` by SPEC-CA-017. Unit-testable as pure functions (TEST-CA-021).

## SPEC-CA-014 — `AddFileContextUseCase` (`src/application/chat/attachments/AddFileContextUseCase.ts`)

**REQ:** REQ-CA-001/002/003 · **Claudian ground-truth:** `FileContextState.attachFile:48` /
`detachFile:52`. The pure file-set ops driving the chip state (the per-tab set lives in the store —
ADR-CA-001 §2 — the use case computes the next set):

```ts
export class AddFileContextUseCase {
  /** Add a path to the set (idempotent — REQ-CA-002); build the AttachedFileRef (basename displayName). */
  add(current: readonly AttachedFileRef[], path: string): Result<readonly AttachedFileRef[]>;
  /** Remove a path from the set (REQ-CA-003). */
  remove(current: readonly AttachedFileRef[], path: string): Result<readonly AttachedFileRef[]>;
}
```

**Contract:** `add` returns a new array containing `current` plus `{ path, displayName }` **unless**
`path` is already present (path-unique → idempotent no-op returning the same membership, REQ-CA-002,
EC-CA-3); `displayName` = basename-without-extension (SPEC-CA-002). `remove` returns `current` minus the
entry with the matching `path` (REQ-CA-003, EC-CA-4). Both return `Result.ok(nextSet)`; a malformed path
(empty) → `Result.err`. **No port** — pure set math (the store owns the reactive set, the runtime reads
`attachedFiles` off the request). Unit-testable in isolation (TEST-CA-001/002/003).

## SPEC-CA-015 — `AddImageUseCase` (`src/application/chat/attachments/AddImageUseCase.ts`)

**REQ:** REQ-CA-007/012 · **NFR:** NFR-CA-009 · **Claudian ground-truth:** `ImageContext.ts` +
`imageEmbed.ts`. Drives the allow-list + 8 MiB gate + `VaultPort.readBinary` + base64 encode
(SPEC-CA-010):

```ts
export class AddImageUseCase {
  constructor(private readonly vault: VaultPort) {}
  /** Resolve MIME from `path`; reject non-image (REQ-CA-012); read bytes; reject > 8 MiB; encode → AttachedImage. */
  execute(path: string): Promise<Result<AttachedImage>>;
}
```

**Contract (gate order — SPEC-CA-010):** (1) resolve `mimeType` from the extension; if ∉ allow-list →
`Result.err` (caller shows `NotificationPort.showWarning`, REQ-CA-012, EC-CA-2); (2) read bytes via
`vault.readBinary(path)` wrapped in `tryAsync` (a missing file → `err`, never an unguarded throw);
(3) if `byteSize > MAX_IMAGE_BYTES` → `Result.err` (over-limit declined, REQ-CA-012, EC-CA-1); (4) else
encode base64 → `Result.ok({ path, mimeType, byteSize, dataBase64 })`. **A rejected image never enters
the set** (the caller only adds on `ok`). **No secret in the payload, nothing written to `data.json`**
(NFR-CA-009, SPEC-CA-030). The 8 MiB measure precedes the encode (no oversize string is built).
Unit-testable with the in-memory Mock `readBinary` (TEST-CA-007/012, EC-CA-1/2).

## SPEC-CA-016 — `CaptureSelectionUseCase` (`src/application/chat/attachments/CaptureSelectionUseCase.ts`)

**REQ:** REQ-CA-013..019 · **ADR:** ADR-CA-003 · **Claudian ground-truth:** the selection controllers.
Coordinates `SelectionSourcePort` reads with `SelectionHighlightPort` paint/clear + the focus-hand-off
retain:

```ts
export class CaptureSelectionUseCase {
  constructor(
    private readonly source: SelectionSourcePort,
    private readonly highlight: SelectionHighlightPort,
  ) {}
  /** The latest captured selection (or null); the composable subscribes via onSelectionChange. */
  current(): CapturedSelection | null;
  /** A selection-change tick: store it, paint the highlight for an editor selection, clear on null. */
  onChange(sel: CapturedSelection | null, focusWithinChat: boolean): Result<CapturedSelection | null>;
}
```

**Contract:** `onChange(sel, focusWithinChat)` — when `sel` is an `EditorSelectionContext`, drive
`highlight.show(sel)` (REQ-CA-014); when `sel` is `null` **and** `focusWithinChat` is `false`, the
selection is dropped → `highlight.clear()` and the result is `null` (REQ-CA-015, EC-CA-5-clear); when
`sel` is `null` **but** `focusWithinChat` is `true`, the previously-captured selection is **retained**
(focus hand-off into the composer is not a deselection, REQ-CA-016) — the highlight stays. A `canvas` /
`browser` selection captures but paints no highlight (no editor range, DESIGN-CA-001 A.3). The browser
member only ever arrives where `source.supportsBrowserSelection` is `true` (REQ-CA-018). Returns
`Result.ok(nextSelection)`; never throws (NFR-CA-010). The **focus-within-chat** signal is computed by
the UI composable (SPEC-CA-025) and passed in — the port stays a pure capture/paint seam. Unit-testable
with the Mock source + the recording highlight (TEST-CA-014/015/016/017/018).

## SPEC-CA-017 — `InlineEditUseCase` (`src/application/chat/inlineEdit/InlineEditUseCase.ts`)

**REQ:** REQ-CA-021/022/026/027 · **ADR:** ADR-CA-002/004 · **Claudian ground-truth:**
`QueryBackedInlineEditService` (`:31` run, `:36` continueConversation), `ClaudeInlineEditService`.
Drives the aux query → parse → outcome, over `AuxModelPort` (no provider-id branch, REQ-CA-028):

```ts
export type InlineEditOutcome =
  | { kind: 'replacement'; text: string; diff: ToolDiffData }   // computeWordDiff(selectedText, text)
  | { kind: 'insertion'; text: string }
  | { kind: 'clarification'; question: string };

export class InlineEditUseCase {
  constructor(private readonly aux: AuxModelPort) {}
  /** Run one inline-edit query for the selection + instruction; abortable via signal. */
  execute(
    selectedText: string,
    instruction: string,
    notePath?: string,
    signal?: AbortSignal,
  ): Promise<Result<InlineEditOutcome>>;
  /** Continue an inline-edit clarification with a follow-up reply (REQ-CA-026). */
  continue(
    selectedText: string,
    priorExchange: readonly { role: 'user' | 'assistant'; text: string }[],
    reply: string,
    signal?: AbortSignal,
  ): Promise<Result<InlineEditOutcome>>;
}
```

**Contract:** `execute` calls `aux.run(buildInlineEditPrompt(selectedText, instruction, notePath), {
systemPrompt: INLINE_EDIT_SYSTEM_PROMPT, signal })`; on `Result.err` (aux error / empty / abort) →
`Result.err` (REQ-CA-027, EC-CA-8/9); on `ok(text)` → `parseInlineEditResponse(text)`: `failure` →
`Result.err`; `replacement` → `ok({ kind:'replacement', text, diff: computeWordDiff(selectedText,
text) })` (the preview diff, REQ-CA-023); `insertion` → `ok({ kind:'insertion', text })`;
`clarification` → `ok({ kind:'clarification', question })` (REQ-CA-026). `continue` re-frames the prior
exchange + the reply and re-runs (the clarification loop, REQ-CA-026). **Empty/whitespace instruction →
no aux query** (the modal guards before calling — DESIGN-CA-001 C.5, EC-CA — the use case treats an
empty instruction as `Result.err` defensively too). **No `providerId` branch** (SPEC-CA-029); never
throws across the boundary (`tryAsync`, NFR-CA-010). Unit-testable with the scriptable Mock aux
(TEST-CA-021/022/026/027, EC-CA-8/9).

## SPEC-CA-018 — Refactor: re-point title-gen + instruction-refine onto `AuxModelPort`

**ADR:** ADR-CA-002 §3 · **Extends:** SPEC-TS-016 (`GenerateTitleUseCase`) + SPEC-CP-015
(`RefineInstructionUseCase`). **This is a behaviour-preserving re-point** — the two use cases keep their
**exact** observable behaviour and their existing tests stay green; only the seam they call changes.

**`GenerateTitleUseCase`** (`src/application/threads/GenerateTitleUseCase.ts`):
- Constructor changes `(runtime: ChatRuntimePort)` → `(aux: AuxModelPort)`.
- The body `prepareTurn({ text: `${SYSTEM}\n\n${prompt}` })` + the `accumulate` drain loop are
  **deleted** and replaced by a single `await this.aux.run(buildTitleGenerationPrompt(firstUserMessage),
  { systemPrompt: TITLE_GENERATION_SYSTEM_PROMPT })`.
- The outcome mapping is **unchanged**: `Result.err` from `aux.run` (error/empty) → `err(new
  Error(TITLE_GEN_FAILED_MESSAGE))`; `ok(text)` → `parseTitleGenerationResponse(text)` →
  `ok(title)` or `err`. Still never surfaces `NotificationPort.showError` (REQ-TS-025); still
  `Result`-returning; still no `providerId` branch.

**`RefineInstructionUseCase`** (`src/application/chat/composer/RefineInstructionUseCase.ts`):
- Constructor changes `(runtime: ChatRuntimePort)` → `(aux: AuxModelPort)`.
- The `prepareTurn` + `accumulate` drain loop are **deleted**, replaced by `await this.aux.run(rawInstruction,
  { systemPrompt: buildRefineSystemPrompt(existingInstructions) })`.
- The outcome mapping (`parseRefineResponse` → `ok(outcome)` / `err`) is **unchanged**; still
  best-effort, still never surfaces a notice, still no `providerId` branch.

**Test migration (NFR-CA-005/006):** the existing `GenerateTitleUseCase` / `RefineInstructionUseCase`
tests inject the **scriptable Mock `AuxModelPort`** (SPEC-CA-008) instead of a `MockChatRuntime` — the
assertions (title parsed / fallback on err / refine outcome / no notice) are **identical**; the fakes
shrink (no streaming-chunk scripting). `fake-ports.ts` grows an `auxModel` member (§SPEC-CA-008 note) so
the migration is a one-line seam swap. **The pure transforms** (`titleGeneration.ts`,
`instructionRefine.ts`) are **untouched** (TEST-CA-018 asserts they are byte-identical). Sequence this
**early** (ADR-CA-002 §3 / hand-off) so P3/P4 stay green before inline-edit builds on the unified seam.
Unit-testable: the re-pointed use cases over the Mock aux (TEST-CA-018, reusing the migrated SPEC-TS-016
/ SPEC-CP-015 scenarios).

---

# 4. UI — components, modal seam, composables, wiring (SPEC-CA-019..026)

Vue `<script setup>` components under `src/ui/chat/`; **no `obsidian` import** (NFR-CA-002); **no
`v-html`** (NFR-CA-003). Every mounted component has a co-located `data-testid` PageObject `.po.ts`
(NFR-CA-005). The two Obsidian `Modal`s live in `src/plugin/modals/` and are launched through the seam
(SPEC-CA-023).

## SPEC-CA-019 — `FileChips.vue` (`src/ui/chat/FileChips.vue`, PO `FileChips.po.ts`)

**REQ:** REQ-CA-001/003/005 · **Claudian ground-truth:** `file-context/view/FileChipsView.ts`,
`utils/fileLink.ts`. Renders the attached-file set as a row of removable chips. **Props:** `files:
readonly AttachedFileRef[]`. **Emits:** `remove: [path: string]`, `open: [path: string]`.
**Behaviour:** each chip shows `displayName` (basename-no-ext), reads as the wikilink form
`[[path]]` via a **declarative** element (no raw HTML, NFR-CA-003), is keyboard-activatable (Enter/Space
→ `open`, REQ-CA-005), and has a labelled remove control (`aria-label`, Enter/Space → `remove`,
REQ-CA-003). The parent wires `open` to `WorkspacePort.openFile(path)` (SPEC-CA-022/026 — the component
stays obsidian-free, NFR-CA-002). `data-testid`: `file-chips` (root, a labelled list/toolbar),
`file-chip` (per chip), `file-chip-link`, `file-chip-remove`. Reduced-motion + forced-colors honoured
(NFR-CA-008). A11y: chips are buttons in a labelled list (DESIGN-CA-001 A.5). Tested via PageObject
(TEST-CA-001/003/005, A-leg).

## SPEC-CA-020 — `ImageContextBar.vue` + `ImageThumb.vue` (`src/ui/chat/`, POs co-located)

**REQ:** REQ-CA-007/008/009/011 · **Claudian ground-truth:** `ImageContext.ts`, `imageEmbed.ts`.
Renders the image-context set as thumbnail chips. **Props:** `images: readonly AttachedImage[]` + a
`resolveThumbSrc: (path: string) => string` callback (the Obsidian-resolved resource path is injected —
the component never imports `obsidian`, NFR-CA-002). **Emits:** `remove: [path]`, `preview: [image:
AttachedImage]`. **Behaviour:** each thumb binds `<img :src="resolveThumbSrc(image.path)">`
**declaratively** (no `v-html`/`innerHTML`, REQ-CA-011, NFR-CA-003), with `alt` = the basename; opening
a thumb emits `preview` (the parent launches the `ImagePreviewModal` via the seam, SPEC-CA-023/024,
REQ-CA-008); a remove control deletes it (REQ-CA-009). **Transport vs display:** the thumb uses the
resource path for *display* only; the turn payload is the base64 `dataBase64` (DESIGN-CA-001 A.2).
`data-testid`: `image-context-bar`, `image-thumb`, `image-thumb-img`, `image-thumb-remove`,
`image-thumb-preview`. Tested via PageObject (TEST-CA-007/009/011, A-leg); the real preview modal is the
manual leg (TEST-CA-M2).

## SPEC-CA-021 — `SelectionIndicator.vue` (`src/ui/chat/SelectionIndicator.vue`, PO co-located)

**REQ:** REQ-CA-015/018 · **Claudian ground-truth:** the selection controllers' indicator. Renders the
captured-selection state as a chip with a clear control. **Props:** `selection: CapturedSelection |
null`, `supportsBrowserSelection: boolean`. **Emits:** `clear: []`. **Behaviour:** when `selection` is
present, render a chip with a **text label** (not colour alone, NFR-CA-008) — editor:
`"{notePath}:{startLine}+{lineCount}"`-ish, canvas: `"{canvasPath} ({nodeIds.length} nodes)"`, browser:
`"{title ?? source}"`; a labelled clear control emits `clear` (REQ-CA-015). **The browser affordance is
gated:** when `supportsBrowserSelection` is `false`, no browser-capture affordance renders and no error
surfaces (REQ-CA-018, EC-CA-7, SPEC-CA-029) — an honest defer. `data-testid`: `selection-indicator`,
`selection-indicator-label`, `selection-indicator-clear`. Tested via PageObject (TEST-CA-015/018,
A-leg).

## SPEC-CA-022 — `ChatComposer.vue` context-bar slot (`src/ui/chat/ChatComposer.vue`)

**REQ:** REQ-CA-001/004 · **Extends:** SPEC-CP-019 (the P4 composer). **Additive only** — with no context
the composer is byte-identical to P4/P1 (the send path unchanged, G2). Add a **context-bar region above
the textarea** that hosts `FileChips` + `ImageContextBar` + `SelectionIndicator` when their props are
non-empty. The composer gains optional props (`attachedFiles?`, `images?`, `capturedSelection?`,
`supportsBrowserSelection?`) and re-emits the children's `remove`/`open`/`preview`/`clear` to the parent
(which owns the store sets, ADR-CA-001 §2). On submit the parent folds the present sets into the
`ChatTurnRequest` and **clears** them (REQ-CA-004/010/019); on new/loaded conversation the parent resets
them (REQ-CA-006, EC-CA-6/11). The context bar is hidden when all three are empty (the composer renders
exactly as P4). `data-testid`: `composer-context-bar`. Tested via PageObject extension
(TEST-CA-004/006, A-leg).

## SPEC-CA-023 — `modalSeam.ts` additions (`src/ui/chat/modalSeam.ts`)

**REQ:** REQ-CA-008/020 · **ADR:** ADR-CA-004 §1 · **Extends:** SPEC-CP-027 (the `InstructionConfirmFn`
pattern). **Additive** — the four P3/P4 seam handles + keys + composables stay byte-identical. Add the
inline-edit + image-preview launchers (mirroring `InstructionConfirmFn`):

```ts
/** The inline-edit decision the modal resolves (REQ-CA-024/025); null on dismiss → reject (note unchanged). */
export type InlineEditDecision =
  | { kind: 'accept'; editedText: string }   // apply the (possibly insertion-vs-replacement) edited text (REQ-CA-024)
  | { kind: 'reject' };                        // note unchanged, highlight restored (REQ-CA-025)

/** Open the inline-edit modal, pre-bound to the selection; resolves the decision or null on dismiss. */
export type OpenInlineEditFn = (
  selectedText: string,
  notePath?: string,
) => Promise<InlineEditDecision | null>;

/** Open the full-size image preview; resolves when dismissed (REQ-CA-008). */
export type OpenImagePreviewFn = (image: AttachedImage) => Promise<void>;

export const OPEN_INLINE_EDIT: InjectionKey<OpenInlineEditFn> = Symbol('OpenInlineEdit');
export const OPEN_IMAGE_PREVIEW: InjectionKey<OpenImagePreviewFn> = Symbol('OpenImagePreview');

/** Inject the inline-edit launcher; falls back to an AUTO-REJECT (null) when absent (no silent apply). */
export function useOpenInlineEdit(): OpenInlineEditFn;
/** Inject the image-preview launcher; falls back to a no-op resolve when absent. */
export function useOpenImagePreview(): OpenImagePreviewFn;
```

**Contract:** `useOpenInlineEdit` falls back to `() => Promise.resolve(null)` when unprovided (a missing
launcher must never silently apply an edit — mirrors `useInstructionConfirm`'s auto-reject, NFR-CA-003);
`useOpenImagePreview` falls back to a no-op resolve. The real launchers open the Obsidian
`InlineEditModal` / `ImagePreviewModal` (SPEC-CA-024); the standalone entry provides browser-safe
stand-ins (no `window.*`). Unit-testable as the fallback contract (TEST-CA-020, A-leg); the real modals
are the manual leg (TEST-CA-M2).

## SPEC-CA-024 — `InlineEditModal.ts` + `ImagePreviewModal.ts` (`src/plugin/modals/`)

**REQ:** REQ-CA-020/023/024/025/026 · **NFR:** NFR-CA-003/008 · **Claudian ground-truth:**
`features/inline-edit/ui/InlineEditModal.ts` (`openAndWait:251`), the image-modal css. Obsidian `Modal`
subclasses (they import `obsidian`, so they live in `src/plugin/`, never `src/ui/**`).

**`InlineEditModal`** drives the DESIGN-CA-001 A.4 state machine (Prompt → Querying → Preview / Clarify /
Failed → Applied / Rejected):
- **Prompt** — an instruction input pre-bound to `selectedText` + `notePath` (REQ-CA-020); an
  **empty/whitespace instruction submits nothing** (no aux query, modal stays on the prompt —
  DESIGN-CA-001 C.5).
- **Querying** — calls `InlineEditUseCase.execute(selectedText, instruction, notePath, signal)`
  (cold-start aux, REQ-CA-021); abortable — dismiss aborts the `signal` → the use case returns
  `Result.err` (EC-CA-8).
- **Preview** — for a `replacement` outcome, render the **word-diff** by mounting the **unchanged
  `DiffView`** with the `InlineEditOutcome.diff` `ToolDiffData` (the renderer reuse, ADR-CA-004 §3,
  REQ-CA-023). Accept (Enter / accept control) resolves `{ kind:'accept', editedText }` →
  the caller replaces the note range (REQ-CA-024); reject (Escape / reject control) resolves
  `{ kind:'reject' }` → note unchanged, highlight restored (REQ-CA-025).
- **Clarify** — render the `clarification.question`, accept a reply, call `InlineEditUseCase.continue`
  (REQ-CA-026).
- **Failed** — on `Result.err`, surface a non-blocking `NotificationPort` notice, note unchanged,
  resolve `null` (REQ-CA-027, EC-CA-9).
- A11y: focus trapped on open, restored on close, Escape dismisses, accept/reject/clarify are labelled
  buttons (NFR-CA-008). The word-diff uses background highlight only (inherited from `DiffView`/`diff.css`,
  REQ-RR-025).

**`ImagePreviewModal`** shows the full-size image (declarative `createEl('img', { attr: { src } })`, no
`innerHTML`), dismissable by Escape + an explicit close control (REQ-CA-008, NFR-CA-008). Both are
**coverage-excluded** (Obsidian Modal) → manual leg (TEST-CA-M2). The note-range replacement on accept
is performed by the launcher/caller (the Obsidian editor write, manual leg).

## SPEC-CA-025 — Selection + aux composables (`src/ui/composables/`)

**REQ:** REQ-CA-013/021 · **Extends:** SPEC-CC-017 (the port-composable pattern). Add three composables
mirroring `useVaultPort` (inject the key; throw a helpful error when unprovided):

```ts
export function useAuxModelPort(): AuxModelPort;                   // inject AUX_MODEL_PORT
export function useSelectionSourcePort(): SelectionSourcePort;     // inject SELECTION_SOURCE_PORT
export function useSelectionHighlightPort(): SelectionHighlightPort; // inject SELECTION_HIGHLIGHT_PORT
```

A small **selection composable** (`useCapturedSelection`) subscribes `source.onSelectionChange`, computes
the **focus-within-chat** signal (whether the active element is inside the chat surface — the focus
hand-off retain, REQ-CA-016), and feeds `CaptureSelectionUseCase.onChange(sel, focusWithinChat)`,
exposing the reactive `current` selection + a `clear()` for `SelectionIndicator`. Tested via the Mock
ports (TEST-CA-013/016, A-leg).

## SPEC-CA-026 — Wiring (`src/plugin/AgentSidebarView.ts` + `src/ui/main.ts`)

**REQ:** REQ-CA-008/020/021 · **Extends:** SPEC-CP-028 (the provide pattern). **`AgentSidebarView`**
(production) `app.provide`s: `AUX_MODEL_PORT` (the ObsidianBridge aux), `SELECTION_SOURCE_PORT` +
`SELECTION_HIGHLIGHT_PORT` (the ObsidianBridge selection impls), `OPEN_INLINE_EDIT` (a launcher opening
`InlineEditModal`, wiring `InlineEditUseCase` over the aux + applying the accepted edit to the note via
the Obsidian editor), and `OPEN_IMAGE_PREVIEW` (a launcher opening `ImagePreviewModal`). It also
registers the inline-edit **command/affordance** on a non-empty note selection (REQ-CA-020).
**`ui/main.ts`** (standalone) provides the `MockBridge`/`LocalStorageBridge` aux + inert selection ports
+ browser-safe seam stand-ins (no `window.*`). Verified on the manual Obsidian leg (TEST-CA-M1/M2). The
inline-edit launcher is the cold-start `AuxModelPort` consumer per ADR-CA-004.

---

# 5. Styles — `--sp-*` token additions (SPEC-CA-027)

## SPEC-CA-027 — token additions (`src/ui/styles/tokens.css`, appended)

**NFR:** NFR-CA-007 · Reuse the existing token set (DESIGN-CA-001 B.1); add **only** what the new
surfaces genuinely need. **No hex, no raw Obsidian var outside the token layer, no physical CSS
property** (`lint-style-tokens` guard). The **word-diff preview rides the P2 diff tokens unchanged**
(`--sp-diff-insert-bg`/`--sp-diff-delete-bg`/`--sp-diff-gutter`/`--sp-diff-max-height`) — the renderer
reuse means no new diff token. Reused: `--sp-border`, `--sp-radius-*`, `--sp-bg-*`, `--sp-text-*`,
`--sp-accent`/`--sp-interactive-accent`, `--sp-space-1..3`, `--sp-font-*`.

| New token (only if not already present) | Surface | Default (token-layer var lookup) | Justification (Claudian rule) |
|---|---|---|---|
| `--sp-chip-bg` | file + image chips | `var(--sp-bg-secondary)` | `file-context.css` chip surface |
| `--sp-chip-border` | chips | `var(--sp-border)` | chip border |
| `--sp-chip-radius` | chips | `var(--sp-radius-sm)` | chip corner |
| `--sp-context-bar-gap` | context bar | `var(--sp-space-2)` | chip row spacing |
| `--sp-image-thumb-size` | image thumbnail | a fixed thumb box | `image-*.css` thumbnail |
| `--sp-image-modal-max` | image preview modal | a full-size cap | image-modal css |
| `--sp-selection-highlight-bg` | selection highlight | a forced-colors-safe tint | `SelectionHighlight` highlight |
| `--sp-inline-edit-modal-w` | inline-edit modal | the modal width | `inline-edit.css` |

> Prefer reuse over minting a near-duplicate (DESIGN-CA-001 B.1); each minted token is justified against
> a Claudian `style/**/{file-context,file-link,image-*,inline-edit}.css` rule at the review gate. A
> `lint-style-tokens` test asserts no raw hex / raw Obsidian var / physical property leaks (TEST-CA-027).

---

# 6. Cross-cutting invariants (SPEC-CA-028..030)

## SPEC-CA-028 — Additivity invariant

**NFR:** NFR-CA-001. P1–P4 stay byte-identical: the **only** growth is the five optional
`ChatTurnRequest` fields (SPEC-CA-001), the one `VaultPort.readBinary` method (SPEC-CA-006), the three
new ports (`AuxModelPort`/`SelectionSourcePort`/`SelectionHighlightPort`) + their keys + barrel
re-exports, the new DTOs, the new app fns/use cases, the new UI components, and the **additive** seam
handles + composer slot. `PreparedChatTurn`, `ChatRuntimeQueryOptions`, `ChatRuntimePort`'s 12 members +
5 capability flags, `DiffView`/`DiffLine`/`ToolDiffData`, and the four P3/P4 modal-seam handles are
unchanged. The two re-pointed use cases (SPEC-CA-018) keep their **observable behaviour** identical
(only their injected seam changes). TEST-CA-002 asserts a `{ text }`-only request is byte-identical to
P1; TEST-CA-028 asserts the unchanged members.

## SPEC-CA-029 — No-provider-branch + capability-gate invariant

**REQ:** REQ-CA-018/028. Inline edit is addressed through `AuxModelPort` (which delegates to the active
tab's runtime) — **zero `if (providerId === 'claude')` branch** in any use case or component (parity
with REQ-TS-026 / REQ-CP-018). The browser-selection leg is gated **only** on
`SelectionSourcePort.supportsBrowserSelection` — never on a provider id; where `false`, the affordance
does not render and no error surfaces (REQ-CA-018, EC-CA-7). `ClaudeInlineEditService` is the only wired
impl (Codex/Opencode = P9, NG4). TEST-CA-028/029 grep-assert no provider-id branch + the gated
affordance.

## SPEC-CA-030 — Result / image-no-secret / DOM-rule / observability invariant

**NFR:** NFR-CA-003/009/010/006. Every use case returns `Result<T,E>`; `AuxModelPort.run` maps
error/empty/abort → `err`; no exception crosses a boundary (the pure transforms are total). The image
payload is **bytes + MIME + size only** — no token/API key/secret, `byteSize ≤ 8 MiB`, nothing written
to `data.json` (NFR-CA-009; TEST-CA-030 asserts no secret in the payload + `data.json` untouched). No
`v-html`/`innerHTML`/`outerHTML`/`insertAdjacentHTML`; the inline-edit + image-preview modals are
Obsidian `Modal`s via the seam; no `window.confirm`/`alert`/`prompt` (NFR-CA-003; a lint invariant +
TEST-CA-011). **Observability:** the use cases emit `LoggerPort` events at boundaries (attach declined,
aux query failed, selection captured) but **never log message/selection/image content or a secret**
(NFR-CA-006) — the same posture as SPEC-CP-036.

---

# 7. Edge cases (EC-CA-*)

| ID | Scenario | Specified behaviour | Spec item · REQ |
|---|---|---|---|
| EC-CA-1 | Oversize image (> 8 MiB) attached | declined before encode; `NotificationPort.showWarning`; set unchanged | SPEC-CA-010/015 · REQ-CA-012 |
| EC-CA-2 | Non-image file (`.exe`) attached as image | MIME ∉ allow-list → declined with a warning; set unchanged | SPEC-CA-010/015 · REQ-CA-012 |
| EC-CA-3 | Duplicate file chip (re-attach same path) | idempotent — no duplicate chip, set unchanged | SPEC-CA-014 · REQ-CA-002 |
| EC-CA-4 | Remove a chip | path leaves the set, chip disappears | SPEC-CA-014/019 · REQ-CA-003 |
| EC-CA-5 | Empty / whitespace selection | not captured (non-empty precondition) | SPEC-CA-003/016 · REQ-CA-013 |
| EC-CA-5-clear | Selection dropped + focus not in chat | captured selection cleared, highlight removed | SPEC-CA-016 · REQ-CA-015 |
| EC-CA-6 | New / loaded conversation | attached-file + image + selection sets cleared for the tab | SPEC-CA-022 · REQ-CA-006 |
| EC-CA-7 | Browser selection where unavailable | no affordance, no capture, no error (gated) | SPEC-CA-021/029 · REQ-CA-018 |
| EC-CA-8 | Inline-edit modal dismissed mid-query | `AbortSignal` → `Result.err`, note unchanged | SPEC-CA-017/024 · REQ-CA-027 |
| EC-CA-9 | Inline-edit aux failure / empty | non-blocking notice, no apply, `Result.err` | SPEC-CA-017/024 · REQ-CA-027 |
| EC-CA-10 | Word-diff of identical text | all-equal diff, no-op preview, never throws | SPEC-CA-011 · REQ-CA-023 |
| EC-CA-11 | Focus hand-off editor → composer | selection retained (not a deselection) | SPEC-CA-016/025 · REQ-CA-016 |
| EC-CA-12 | Transient selection-poll error | swallowed inside the bridge impl, degrades to `null`, no crash | SPEC-CA-005/007 · NFR-CA-010 |
| EC-CA-13 | Inline-edit clarification then dismiss | `null` decision → reject (note unchanged) | SPEC-CA-017/024 · REQ-CA-026/025 |
| EC-CA-14 | `<script>`/raw HTML in attached or edited text | rendered verbatim as text (declarative spans / `DiffView` `{{ }}`); no `v-html`/`innerHTML` | SPEC-CA-019/024/030 · NFR-CA-003 |
| EC-CA-15 | Image file moved/deleted after attach | the base64 snapshot captured at attach time keeps the turn stable | SPEC-CA-002/015 · ADR-CA-001 §3 |
| EC-CA-16 | Canvas selection when no canvas open | no canvas capture; editor/none path unaffected | SPEC-CA-003/016 · REQ-CA-017 |

---

# 8. Test scenarios (TEST-CA-*) — U / A / M split

> **U** = pure unit (transforms, use cases, the AuxModelPort re-point, DTOs) over the Mock ports. **A** =
> component via co-located `data-testid` PageObject (mount + assert). **M** = manual Obsidian leg
> (coverage-excluded real CM6/canvas/binary-read/Modal/real-CLI image turn) accumulating for the single
> final human review gate (autonomous-drive). Each maps 1:1 to a REQ-CA or an EC-CA.

| TEST | Asserts | Layer | Covers |
|---|---|---|---|
| TEST-CA-001 | `add` builds a chip + the additive request field type-shape | U | REQ-CA-001; SPEC-CA-001/002/014 |
| TEST-CA-002 | a `{ text }`-only `ChatTurnRequest` serialises byte-identically to P1 | U | NFR-CA-001; SPEC-CA-001/028 |
| TEST-CA-003 | the attachment DTO shapes + `displayName` basename-no-ext | U | REQ-CA-001/003; SPEC-CA-002 |
| TEST-CA-004 | attached files travel with the turn + the set clears on submit | A | REQ-CA-004; SPEC-CA-022 |
| TEST-CA-005 | a file chip opens via `WorkspacePort` (no `obsidian` import); keyboard-activatable | A | REQ-CA-005; SPEC-CA-019 |
| TEST-CA-006 | new/loaded conversation clears the attached-file set | A | REQ-CA-006; SPEC-CA-022 |
| TEST-CA-007 | an image attaches → a thumbnail chip + the image-set entry | A | REQ-CA-007; SPEC-CA-015/020 |
| TEST-CA-008 | (manual) the image preview modal shows full-size; Escape + close | M | REQ-CA-008; SPEC-CA-024 |
| TEST-CA-009 | removing a thumbnail deletes it from the set | A | REQ-CA-009; SPEC-CA-020 |
| TEST-CA-010 | `readBinary` (Mock in-memory) + bounded base64 encode | U | REQ-CA-010; SPEC-CA-006/010 |
| TEST-CA-011 | the image preview binds `:src` declaratively; no `v-html`/`innerHTML` | A | REQ-CA-011; SPEC-CA-020/030 |
| TEST-CA-012 | oversize / non-image declined with a warning; set unchanged | U/A | REQ-CA-012; EC-CA-1/2; SPEC-CA-010/015 |
| TEST-CA-013 | editor capture records `{notePath, selectedText, startLine(0-based), lineCount}`; canvas records `{canvasPath, nodeIds}` | U | REQ-CA-013/017; SPEC-CA-003/016 |
| TEST-CA-014 | highlight shows while captured + editor unfocused (recording highlight) | U | REQ-CA-014; SPEC-CA-016 |
| TEST-CA-015 | clear on deselection (focus not in chat) removes the highlight | U/A | REQ-CA-015; EC-CA-5-clear; SPEC-CA-016/021 |
| TEST-CA-016 | focus hand-off into the composer retains the selection | U/A | REQ-CA-016; EC-CA-11; SPEC-CA-016/025 |
| TEST-CA-017 | (manual) real CM6 editor + Obsidian canvas capture | M | REQ-CA-013/017; SPEC-CA-007 |
| TEST-CA-018 | re-pointed `GenerateTitleUseCase` + `RefineInstructionUseCase` over the Mock aux keep behaviour green; the pure transforms unchanged | U | ADR-CA-002 §3; SPEC-CA-018 |
| TEST-CA-018b | browser selection gated: `supportsBrowserSelection:false` → no capture, no error, no affordance | U/A | REQ-CA-018; EC-CA-7; SPEC-CA-005/021/029 |
| TEST-CA-019 | selection travels with the turn (request slot filled) | U | REQ-CA-019; SPEC-CA-001/016 |
| TEST-CA-020 | (manual) inline edit opens via the seam, pre-bound to the selection | M | REQ-CA-020; SPEC-CA-023/024 |
| TEST-CA-021 | `AuxModelPort.run` cold-start, maps error/empty/abort → `Result`; `InlineEditUseCase.execute` over the Mock aux | U | REQ-CA-021; SPEC-CA-004/017 |
| TEST-CA-022 | `parseInlineEditResponse`: replacement / insertion / clarification / failure | U | REQ-CA-022; SPEC-CA-012 |
| TEST-CA-023 | `computeWordDiff("The bank…","The riverbank…")` marks `bank` del + `riverbank` ins, equal words unmarked; mounting `DiffView` with the word-diff `ToolDiffData` renders it (renderer reuse) | U/A | REQ-CA-023; SPEC-CA-011/024 |
| TEST-CA-023b | `computeWordDiff(s, s)` is an all-equal no-op; empty inputs → empty diff; never throws | U | EC-CA-10; SPEC-CA-011 |
| TEST-CA-024 | (manual) accept replaces the note range, modal closes | M | REQ-CA-024; SPEC-CA-024/026 |
| TEST-CA-025 | (manual) reject leaves the note unchanged, restores the highlight | M | REQ-CA-025; SPEC-CA-024 |
| TEST-CA-026 | clarification → `continue` produces a replacement/insertion preview | U | REQ-CA-026; SPEC-CA-017 |
| TEST-CA-026b | clarification then dismiss → reject (note unchanged) | U/A | EC-CA-13; SPEC-CA-017/024 |
| TEST-CA-027 | inline-edit failure → non-blocking notice, no apply, `Result.err` | U | REQ-CA-027; EC-CA-8/9; SPEC-CA-017 |
| TEST-CA-028 | additivity: P1–P4 members byte-identical; no provider-id branch | U | NFR-CA-001; REQ-CA-028; SPEC-CA-028/029 |
| TEST-CA-029 | (manual) a real-CLI turn carries an attached image (base64) | M | REQ-CA-010; SPEC-CA-007 |
| TEST-CA-030 | image payload carries no secret; `data.json` untouched; transient poll error does not crash | U | NFR-CA-009/010; SPEC-CA-030; EC-CA-12 |
| TEST-CA-031 | `<script>` in attached/edited text renders verbatim (no `v-html`/`innerHTML`) | A | NFR-CA-003; EC-CA-14; SPEC-CA-019/024/030 |
| TEST-CA-032 | `--sp-*` tokens: no raw hex / Obsidian var / physical property leaks | U/A | NFR-CA-007; SPEC-CA-027 |
| TEST-CA-M1 | (manual) the three ObsidianBridge ports wire end-to-end in Obsidian | M | NFR-CA-001; SPEC-CA-007/026 |
| TEST-CA-M2 | (manual) the inline-edit + image-preview modals render + dismiss (parity screenshots) | M | NFR-CA-007; SPEC-CA-024 |
| TEST-CA-M3 | (manual) real `VaultPort.readBinary` reads vault image bytes | M | REQ-CA-010; SPEC-CA-006/007 |

**Split tally:** **U ≈ 18** (DTOs, the four use cases, the two pure transforms + prompt, the
AuxModelPort re-point, additivity/no-secret/no-branch invariants, word-diff including the no-op),
**A ≈ 9** (FileChips/ImageContextBar/SelectionIndicator/composer-context-bar PageObjects, the
declarative `:src`, the verbatim `<script>` render, the seam fallback, the gated browser affordance,
tokens — several are U/A spanning both), **M ≈ 8** (real CM6/canvas capture, the two real Modals, the
real binary read, the real-CLI image turn, the end-to-end wiring, the parity screenshots). The U/A items
hold the 80/70/80/80 coverage gate (NFR-CA-006); the M legs accumulate for the single final human
review gate (autonomous-drive).

---

# 9. Requirements coverage — REQ-CA ↔ SPEC-CA ↔ TEST-CA

| REQ / NFR | SPEC-CA | TEST-CA |
|---|---|---|
| REQ-CA-001 | SPEC-CA-001/002/014/019/022 | TEST-CA-001/003 |
| REQ-CA-002 | SPEC-CA-014 | TEST-CA-001 (idempotent); EC-CA-3 |
| REQ-CA-003 | SPEC-CA-014/019 | TEST-CA-003; EC-CA-4 |
| REQ-CA-004 | SPEC-CA-001/022 | TEST-CA-004 |
| REQ-CA-005 | SPEC-CA-019 | TEST-CA-005 |
| REQ-CA-006 | SPEC-CA-022 | TEST-CA-006 |
| REQ-CA-007 | SPEC-CA-015/020 | TEST-CA-007 |
| REQ-CA-008 | SPEC-CA-020/023/024 | TEST-CA-008 (M) |
| REQ-CA-009 | SPEC-CA-020 | TEST-CA-009 |
| REQ-CA-010 | SPEC-CA-001/006/010/015 | TEST-CA-010/029 (M) |
| REQ-CA-011 | SPEC-CA-020/030 | TEST-CA-011 |
| REQ-CA-012 | SPEC-CA-010/015 | TEST-CA-012; EC-CA-1/2 |
| REQ-CA-013 | SPEC-CA-003/005/016 | TEST-CA-013; TEST-CA-017 (M) |
| REQ-CA-014 | SPEC-CA-005/016 | TEST-CA-014 |
| REQ-CA-015 | SPEC-CA-016/021 | TEST-CA-015 |
| REQ-CA-016 | SPEC-CA-016/025 | TEST-CA-016 |
| REQ-CA-017 | SPEC-CA-003/016 | TEST-CA-013; TEST-CA-017 (M); EC-CA-16 |
| REQ-CA-018 | SPEC-CA-005/021/029 | TEST-CA-018b; EC-CA-7 |
| REQ-CA-019 | SPEC-CA-001/016 | TEST-CA-019 |
| REQ-CA-020 | SPEC-CA-023/024/026 | TEST-CA-020 (M) |
| REQ-CA-021 | SPEC-CA-004/013/017 | TEST-CA-021 |
| REQ-CA-022 | SPEC-CA-012 | TEST-CA-022 |
| REQ-CA-023 | SPEC-CA-011/024 | TEST-CA-023; TEST-CA-023b |
| REQ-CA-024 | SPEC-CA-024/026 | TEST-CA-024 (M) |
| REQ-CA-025 | SPEC-CA-024 | TEST-CA-025 (M); EC-CA-13 |
| REQ-CA-026 | SPEC-CA-017/024 | TEST-CA-026/026b |
| REQ-CA-027 | SPEC-CA-017/024 | TEST-CA-027; EC-CA-8/9 |
| REQ-CA-028 | SPEC-CA-004/017/029 | TEST-CA-028 |
| NFR-CA-001 | SPEC-CA-005/006/007/008/009/028 | TEST-CA-002/028; TEST-CA-M1 (M) |
| NFR-CA-002 | SPEC-CA-019/020/021/024 (ports/seam) | TEST-CA-005/011 |
| NFR-CA-003 | SPEC-CA-023/024/030 | TEST-CA-011/031 |
| NFR-CA-004 | SPEC-CA-004/014/015/016/017/030 | TEST-CA-021/027 |
| NFR-CA-005 | every `.vue` has a `.po.ts` (SPEC-CA-019..022) | A-leg tests |
| NFR-CA-006 | SPEC-CA-030 (no content/secret logged) | coverage 80/70/80/80 gate |
| NFR-CA-007 | SPEC-CA-027 | TEST-CA-032; TEST-CA-M2 (M) |
| NFR-CA-008 | SPEC-CA-019/020/021/024 (a11y) | A-leg + TEST-CA-M2 |
| NFR-CA-009 | SPEC-CA-002/010/015/030 | TEST-CA-012/030 |
| NFR-CA-010 | SPEC-CA-004/005/016/017/030 | TEST-CA-030; EC-CA-12 |
| NFR-CA-011 | SPEC-CA-011 (in-repo word-diff) | TEST-CA-023 (no new dep) |
| NFR-CA-012 | manifest untouched (cross-cutting) | review check |
| NFR-CA-013 | new strings via `TranslationPort` (cross-cutting) | review check |

**All 28 REQ-CA + 13 NFR-CA covered by ≥ 1 SPEC-CA and ≥ 1 TEST-CA. No `TBD`.**

---

# 10. Quality gate

- [x] Every public interface specified (signature · behaviour · pre/post · errors · side effects ·
      REQ links) — DOMAIN ports/DTOs (SPEC-CA-001..006), the use cases + transforms (SPEC-CA-011..018),
      the UI components + seam (SPEC-CA-019..026).
- [x] Data structures specified with per-field validation rules (SPEC-CA-001/002/003/004/005).
- [x] State transitions modelled (the inline-edit state machine — DESIGN-CA-001 A.4 referenced;
      SPEC-CA-024 enumerates the legs).
- [x] Edge cases enumerated, not `TBD` (EC-CA-1..16).
- [x] Test scenarios derived, U/A/M split, 1:1 to REQ/EC (TEST-CA-001..032 + M1/M2/M3).
- [x] Observability specified (SPEC-CA-030 — boundary logs, no content/secret).
- [x] Performance budgets inherited (image ≤ 8 MiB; no new threshold beyond the PRD `[NEW]`).
- [x] Compatibility: **fully additive** — P1–P4 byte-identical, no migration (SPEC-CA-028, NFR-CA-012).
- [x] Every spec item traces to ≥ 1 REQ; full coverage table (§9).
- [x] Two independent teams would build the same thing (the two design open items RESOLVED in §0).
- [x] Every irreversible architectural choice already has an ADR (ADR-CA-001..004, accepted) — no new
      ADR needed; this spec only refines field-level details the ADRs delegated to spec.

> **No open clarifications block the planner.** The two design open items (startLine indexing, wikilink
> display format) are RESOLVED in §0. Hand-off to `/spec:tasks` (planner) in `workflow-state.md`.
