---
id: ADR-CA-001
title: Attach file/image/selection context by regrowing the reserved ChatTurnRequest fields additively, with VaultPort-backed image read/encode and a bounded base64 transport
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
tags: [architecture, attachments, context, transport, claudian-reboot, P5]
---

# ADR-CA-001 — Attachment / context model + image transport

## Status

**Accepted** — autonomous-drive mode (workflow-state directive 2026-05-25): architect files, PM
accepts, human defers to one final epic-review gate. Resolves **CLAR-CA-001**. Unblocks
`PRD-CA-001` (REQ-CA-001..012, REQ-CA-019; NFR-CA-009).

## Context

P5 attaches three kinds of context to a turn — pinned vault files (chips), images, and a captured
selection (editor / canvas / browser) — reproducing Claudian's "context footer" (`FileContext.ts`,
`ImageContext.ts`, the selection controllers). P1 deliberately shipped only `ChatTurnRequest.text`
(+ optional `currentNotePath`) and left the rest of Claudian's request shape **reserved** as a
doc-comment at `ChatTurn.ts:12-13`:

```ts
// images?, editorSelection?, browserSelection?, canvasSelection?,
// externalContextPaths?, enabledMcpServers? — EXCLUDED from P1 (regrow P2+).
```

P5 is the phase those fields regrow (minus `enabledMcpServers`, which stays P8 per NG3). Two forces
shape the decision:

1. **Additive only (G2, REQ-CA-004 note).** The P1 send path must stay byte-identical when no
   context is attached — a turn with only `text` must serialise exactly as it does today.
2. **Image transport must match what `claude --print` accepts, carry no secret, and be bounded**
   (NFR-CA-009). Claudian's `imageEmbed` resolves an Obsidian `getResourcePath` for *display*; the
   actual model payload is the question. The CLI subprocess (ADR-014 / SPEC-CC) reads a single user
   turn from `--print`; it has no separate attachment channel, so an image must be carried either as
   an inline data block in the prompt text the runtime builds, or as a vault path the runtime reads.

ADR-008's governing rule applies: *no port before its consumer earns it; one port per consumer;
three bridge impls.* The question is whether attachment needs a **new port**, or whether the
existing `VaultPort` (read) + the existing `ChatRuntimePort.prepareTurn` (assemble) suffice.

## Decision

### 1. Regrow the reserved `ChatTurnRequest` fields additively (Option A) — no separate context port

We **grow `ChatTurnRequest`** with the reserved optional fields rather than adding a context port.
The composer/store assembles the context; the runtime's `prepareTurn` folds it into the prompt it
already builds. All fields are **optional**; an unset request is byte-identical to P1 (G2).

```ts
// src/domain/chat/ChatTurn.ts — additive (the reserved ChatTurn.ts:12-13 fields regrow here)
export interface ChatTurnRequest {
  text: string;
  currentNotePath?: string;
  // ---- P5 additive (SPEC-CA, ADR-CA-001) ----
  attachedFiles?: readonly AttachedFileRef[];   // file chips (REQ-CA-001..006)
  images?: readonly AttachedImage[];            // image context (REQ-CA-007..012)
  editorSelection?: EditorSelectionContext;     // REQ-CA-013/019
  canvasSelection?: CanvasSelectionContext;     // REQ-CA-017/019
  browserSelection?: BrowserSelectionContext;   // REQ-CA-018/019 (capability-gated — ADR-CA-003)
}
```

The attachment DTOs are **pure domain data** (`src/domain/chat/attachments/`) — no `obsidian`, no
`node:*`, no class, plain readonly fields, so they cross the Pinia store boundary (NFR-CA-004) and
serialise cleanly:

```ts
// src/domain/chat/attachments/Attachments.ts
export interface AttachedFileRef {
  readonly path: string;        // vault-relative, no leading slash (VaultPort contract)
  readonly displayName: string; // chip label (basename without extension — fileLink parity)
}

export interface AttachedImage {
  readonly path: string;        // vault-relative source (the thumbnail + the read source)
  readonly mimeType: string;    // image/png | image/jpeg | image/webp | image/gif (allow-list)
  readonly byteSize: number;    // measured at attach time; the size-limit gate reads it
  readonly dataBase64: string;  // the bounded base64 payload the runtime embeds (see §3)
}
```

(`EditorSelectionContext` / `CanvasSelectionContext` / `BrowserSelectionContext` are defined by
ADR-CA-003, which owns the selection sub-surface; ADR-CA-001 only reserves their slots on the
request.)

### 2. Context lives on the active tab's composer state; travels with the turn; clears on submit + new/loaded conversation

The attached-file set, image-context set, and captured selection are **per-tab composer state**
(the P3 `tabsStore` `TabState`, not a domain aggregate — they are draft input, not conversation
history). On submit the store folds them into the `ChatTurnRequest` and **clears** them
(REQ-CA-004/010/019); on `new conversation` / `load conversation` the tab resets them
(REQ-CA-006, mirroring `FileContextState.resetForNewConversation`/`resetForLoadedConversation`).
File-chip set semantics are a keyed set (path-unique) so re-attaching is idempotent (REQ-CA-002).

### 3. Image transport: bounded **base64-inline**, read + encoded through `VaultPort` — no new port

The image travels as **base64 inline** in the request (`AttachedImage.dataBase64`), produced at
attach time by reading the vault file through the existing `VaultPort` and encoding it. We do **not**
add an `AttachmentPort`: the only Obsidian-coupled operation is *read the bytes of a vault file*,
which `VaultPort` already owns conceptually. `VaultPort.readFile` returns a `string` (text); reading
**binary** bytes is the one capability it lacks, so we grow `VaultPort` with **one additive method**
rather than a whole new port (ADR-008 "one port per consumer" — the consumer here is the same
vault-IO seam):

```ts
// src/domain/ports/VaultPort.ts — additive
readBinary(path: string): Promise<Uint8Array>;   // P5 (SPEC-CA); image read for base64 encode
```

Rationale for base64-inline over vault-path-reference:

- **The CLI subprocess accepts an inline data block, not an out-of-band attachment handle.** A
  vault-path reference would require the runtime to re-read the file and the model side to resolve a
  path it has no access to; inline base64 in the prompt is self-contained and is exactly how a
  one-shot `--print` turn can carry an image (parity with how Claudian's SDK transport inlines
  image content blocks).
- **Self-contained = no lifetime coupling.** A vault-path reference breaks if the file is renamed or
  deleted between attach and send; the base64 snapshot captured at attach time is stable for the
  turn.
- The **thumbnail preview** still uses an Obsidian-resolved resource path for *display* (declarative
  `<img :src>`, REQ-CA-011) — display and transport are separate concerns; only transport is base64.

**Bound + no-secret (NFR-CA-009):**

- An **allow-list** of image MIME types (`image/png`, `image/jpeg`, `image/webp`, `image/gif`),
  ported from Claudian `imageEmbed.IMAGE_EXTENSIONS`. A non-image is declined with a non-blocking
  `NotificationPort` warning (REQ-CA-012).
- A **size limit of 8 MiB** per image (`MAX_IMAGE_BYTES = 8 * 1024 * 1024`), checked on
  `AttachedImage.byteSize` before encode. Over-limit is declined with a notice (REQ-CA-012). 8 MiB
  is the PM-blessed starting point ("a few MB"); it is a load-or-default constant (settings UX is
  P10, NG5), not a steering threshold.
- The payload is **only** image bytes + MIME + size — no token, API key, vault metadata, or path
  outside the vault. Nothing is written to `data.json` (the request is transient turn input).

## Considered options

### Option A — Additive `ChatTurnRequest` fields, base64 image transport, `VaultPort.readBinary` *(chosen)*
- Pros: the fields are already reserved (lowest seam churn — the doc-comment becomes types); no new
  port (one additive `VaultPort` method for the one missing capability); base64 is self-contained and
  matches the CLI transport; clears/resets are a tab-state concern the store already owns; pure DTOs
  cross the store boundary cleanly.
- Cons: a large image inflates the prompt payload (bounded by the 8 MiB limit + the allow-list);
  `prepareTurn` grows to fold the context into the prompt (additive, gated on the optional fields
  being present).

### Option B — A separate `ContextAttachmentPort` the runtime reads
- Pros: isolates attachment assembly from the request shape; a clean place for a future media-folder
  policy.
- Cons: a whole new port + key + composable + three bridge impls for data the request can already
  carry; splits the turn payload across two seams (the runtime would have to correlate a request with
  a side-channel of attachments); contradicts "the reserved fields regrow here" (G2). Rejected.

### Option C — Vault-path-reference image transport (no base64)
- Pros: smaller request payload; mirrors Claudian's `getResourcePath` display path literally.
- Cons: the CLI `--print` turn cannot resolve a vault path on the model side; breaks if the file
  moves/deletes between attach and send; couples the turn's validity to vault state. Rejected for
  transport (kept only for the *thumbnail display* path, which is not transport).

## Consequences

### Positive
- The P1 send path is byte-identical when no context is attached (G2) — every new field is optional.
- One additive `VaultPort` method, no new port — the smallest seam that earns its consumer.
- Image payloads are self-contained, bounded, and secret-free (NFR-CA-009); display and transport are
  cleanly separated.
- The attachment DTOs are pure data, testable in isolation, and safe to cross the store boundary.

### Negative
- `prepareTurn` and the Claude runtime's prompt assembly grow to fold attached context into the
  one-shot prompt (additive, behind the optional-field guards). Image bytes inflate the prompt for
  large attachments (bounded).
- The 8 MiB limit + allow-list are load-or-default constants until P10 makes them configurable.

### Neutral
- `externalContextPaths` and `enabledMcpServers` from Claudian's request shape stay **excluded** (NG3
  MCP is P8; external-dir mention is the P4 `@mention`, not a P5 chip). Only the file/image/selection
  fields regrow now.

## Compliance

- A contract test asserts a `ChatTurnRequest` with only `text` serialises byte-identically to P1
  (G2) and that every P5 field is optional.
- A test asserts an over-limit or non-image attachment is declined with a `NotificationPort` warning
  and does not enter the image-context set (REQ-CA-012); the allow-list mirrors Claudian's
  `IMAGE_EXTENSIONS`.
- A test asserts no attachment payload carries a token/secret and `data.json` is untouched
  (NFR-CA-009).
- A test asserts submit + new/loaded-conversation clear the attached-file/image/selection sets
  (REQ-CA-004/006/010/019).
- A review check confirms no `AttachmentPort` was added and image read flows through
  `VaultPort.readBinary` (Decision §3).

## References

- PRD-CA-001 — REQ-CA-001..012, REQ-CA-019; CLAR-CA-001; NFR-CA-009; NG3.
- `specs/context-attachments/design.md` Part C.
- **ADR-CA-003** (the selection DTOs whose slots this reserves), **ADR-CA-004** (the inline-edit flow
  that does not use these turn fields — it is a side-query), ADR-CC-001 §3/§4 (grow per phase),
  ADR-008 (one port per consumer; no port before earned), ADR-014 (the Claude CLI transport that
  accepts the inline payload).
- Claudian reference: `features/chat/ui/FileContext.ts`, `file-context/state/FileContextState.ts`
  (`attachFile:48`/`detachFile:52`/`clearAttachments:56`/`resetForNewConversation:27`),
  `features/chat/ui/ImageContext.ts`, `utils/imageEmbed.ts` (`IMAGE_EXTENSIONS:15`), `utils/fileLink.ts`.

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the
> predecessor's `status` and `superseded-by` pointer fields may be updated.
