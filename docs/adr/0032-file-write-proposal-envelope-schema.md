---
id: ADR-0032
title: Model trust-first vault writes as an inspectable proposal envelope with explicit Accept / Reject gating
status: accepted
date: 2026-05-14
deciders:
  - architect
consulted:
  - pm
  - ux-designer
  - analyst
informed:
  - dev
supersedes: []
superseded-by: []
tags: [chat, trust-first, vault-write, proposal, agent-sidepanel-mvp]
---

# ADR-0032 — Model trust-first vault writes as an inspectable proposal envelope with explicit Accept / Reject gating

## Status

Accepted

## Context

The constitutional posture for vault writes from a model-generated action is
*trust-first*: no model proposal lands on disk without an explicit user gesture. This
is restated in IDEA-ASM-001 constraints, PRD-ASM-001 NFR-ASM-011, and the project
constitution Article IX (Reversibility). The Agent Sidepanel MVP is the first feature
in which a model can propose a vault mutation, so it is also the first feature for
which this posture has a concrete shape.

Three plausible shapes were considered:

1. **Write-then-undo.** The model proposes a file, the plugin writes it immediately,
   and the UI exposes a time-bounded undo button. Smallest UX surface but violates
   trust-first by construction: a write that lands on disk has already happened, even
   if it is reverted moments later (Obsidian Sync may have already propagated it; a
   pre-commit hook in the vault's git workspace may have already fired; an open
   editor may have already auto-saved).
2. **Server-side tool execution.** The Claude CLI's built-in `Write` tool is enabled,
   the model uses it, the plugin observes the write after the fact. Smallest plugin-
   side code but violates trust-first identically and additionally moves the decision
   surface out of the plugin (the user can't see the proposal in plain language; they
   see a tool-call event log).
3. **Propose-then-accept.** The model returns a structured envelope describing the
   intended write; the plugin renders the envelope as a proposal card with Accept /
   Reject controls; only on Accept does any vault mutation occur. The model has no
   write authority; the plugin owns every `VaultPort.writeFile` call site.

The envelope shape itself has design surface. Five candidate shapes were considered
for Increment 1:

A. `{ path, content }` — minimum viable. No discriminator, no rationale, no folder
   hint, no future-proofing.
B. `{ action, path, content }` — adds a discriminator for future envelopes (edit,
   delete, move) without changing the parse pipeline.
C. `{ action, path, content, rationale }` — adds a one-line user-facing explanation.
D. `{ action, path, content, rationale, folderHint }` — adds an idempotent folder-
   creation hint so the model can request a folder that doesn't exist yet.
E. `{ action, path, content, rationale, folderHint, expectedHash }` — adds an
   optimistic-concurrency token for edit envelopes in Increment 2.

The Increment-1 scope is `createFile` only (REQ-ASM-022; D-ASM-008). `editFile` and
`deleteFile` envelopes are deferred to Increment 2 along with `expectedHash` for
optimistic-concurrency-controlled edits.

## Decision

The Agent Sidepanel MVP models every model-proposed vault write as an inspectable
**proposal envelope** with explicit Accept / Reject gating in the chat UI. The
Increment-1 envelope shape is option D (REQ-ASM-022):

```ts
type CreateFileEnvelope = {
  readonly action: 'createFile'           // discriminator (literal const)
  readonly path: string                   // vault-relative, must match /^[^/].*\.md$/
  readonly content: string                // non-empty
  readonly rationale?: string             // optional one-line explanation
  readonly folderHint?: string            // optional folder prefix to create idempotently
}
```

The envelope is validated by Zod at the application boundary (see ADR-0030). The
Zod schema lives in `src/application/chat/proposalEnvelope.ts` and is the canonical
shape. The TypeScript type is `z.infer<typeof createFileEnvelopeSchema>`.

The full proposal lifecycle is:

1. **Proposal.** The model is prompted via a structured-output call (ADR-0030); the
   resulting envelope is validated.
2. **Render.** On successful validation, the chat panel renders a
   `FileWriteProposalCard.vue` showing:
   - The full `path`.
   - The first 40 lines of `content` (with a "show more" affordance for the rest)
     (REQ-ASM-041).
   - The `rationale` if present.
   - Two buttons — Accept (primary) and Reject (secondary). Both are
     keyboard-activatable; their `aria-label` attributes carry the exact path
     (REQ-ASM-042; NFR-ASM-007).
   - A "Retry" button that resubmits the prior user turn (REQ-ASM-050).
3. **Pre-Accept guards.** Before the card is rendered, the path is checked for
   vault-escape patterns (`..` segments, leading `/`, paths that resolve outside the
   vault root); failure causes the card to render in a non-actionable error state
   with no Accept button (REQ-ASM-048).
4. **Overwrite protection on Accept.** When the user clicks Accept, the plugin first
   calls `VaultPort.fileExists(path)`. If true, an Obsidian `Modal` subclass surfaces
   a confirmation dialog naming the path; the write proceeds only on explicit
   confirmation (REQ-ASM-044). This mirrors the REQ-AVS-005 overwrite-protection
   posture used elsewhere in the plugin.
5. **Folder creation on Accept.** If `folderHint` is present and non-empty, the
   plugin calls `VaultPort.createFolder(folderHint)` (idempotent) before
   `VaultPort.writeFile` (REQ-ASM-047). The hint is validated to be a non-absolute
   path and a prefix of `path`; mismatched hints cause the envelope to be rejected
   at validation time.
6. **Write on Accept.** `VaultPort.writeFile(path, content)` is called exactly once
   with the validated values (REQ-ASM-043). The session log records the decision as a
   `## proposal` block carrying `path`, `decision: accepted`, `decided_at` (ISO 8601),
   and `rationale` if present (REQ-ASM-046).
7. **Rejection on Reject.** No `VaultPort` mutation method is invoked. The session log
   records `decision: rejected` (REQ-ASM-045, REQ-ASM-046).

The proposal card is the *only* surface in Increment 1 that can lead to a model-
initiated vault write. There is no other path. Server-side tools are explicitly
disabled on every subprocess invocation (REQ-ASM-028) so the model has no
side-channel to write files.

## Considered options

### Option A — Write-then-undo

- Pros: smallest UX (no proposal card); model perceives instant feedback.
- Cons: violates trust-first — the write has already happened, with all the
  side-effects that implies (Sync, git hooks, editor auto-save); the undo window has
  no defensible duration; revoking trust after the fact is fundamentally weaker than
  granting it before.

### Option B — Server-side tool execution

- Pros: smallest plugin-side code; reuses the CLI's `Write` tool.
- Cons: violates trust-first identically to A; moves the decision surface out of the
  plugin; user sees a tool-call event rather than a plain-language proposal; the
  permission-mode dance to block-and-resume the tool is fragile and not consistent
  across CLI versions.

### Option C — Propose-then-accept (chosen)

- Pros: vault writes happen only after a user gesture, by construction; the user
  inspects the full envelope before any side effect; auditable in the session log
  (ADR-0031); deferring writes is the only way to honour Article IX of the
  constitution.
- Cons: extra UI surface (the card); the model must learn the envelope shape (handled
  by the schema-validated call in ADR-0030); the user sees one extra interaction per
  write.

### Envelope shape options

#### A — `{ path, content }` only

- Pros: minimum surface.
- Cons: no discriminator for future envelopes (edit, delete); no rationale for the
  user; no folder-creation hint — model must either request a folder via a separate
  call or fail.

#### D — `{ action, path, content, rationale?, folderHint? }` (chosen)

- Pros: `action` is a literal `const` that doubles as a discriminator for Increment 2's
  edit / delete envelopes (Zod discriminated union); `rationale` materially improves
  the Accept / Reject decision; `folderHint` removes a class of model failures where
  the proposed path is in a not-yet-created folder; both optional fields are nullable
  so the model can omit them when not needed.
- Cons: two optional fields the model may inconsistently populate; mitigated by Zod's
  `additionalProperties: false` equivalent rejecting unknown fields and by the
  application service treating absent rationale as "no explanation" rather than as a
  validation failure.

#### E — `{ action, path, content, rationale?, folderHint?, expectedHash? }`

- Pros: ready for Increment-2 edit envelopes.
- Cons: `expectedHash` is meaningful only for `editFile`/`updateFile`, not `createFile`;
  including it in Increment 1 leaks future schema concerns into present scope; defer.
- Increment-2 hint (non-binding): when this field is added, `expectedHash` is the
  lowercase hex-encoded SHA-256 of the on-disk file's UTF-8 bytes at the time the
  model issued the edit. Picking the algorithm now avoids a bikeshed round when the
  field is introduced; SHA-256 is already available via Node's built-in `crypto`
  module with no new dependency.

## Consequences

### Positive

- **Trust-first by construction.** No `VaultPort.writeFile` call from a model
  proposal can fire without a user gesture; the gate is a UI button, not a flag.
  Verified by an integration test that walks the entire proposal-to-write path on
  `MockBridge` and asserts the gate.
- **Auditability.** Every accept and every reject is recorded in the session log
  (ADR-0031, REQ-ASM-046) with timestamp and rationale. The audit trail is
  vault-portable and human-readable.
- **Discriminator-ready.** The `action: 'createFile'` literal lets Increment 2 add
  `editFile`, `deleteFile`, `moveFile` envelopes as a Zod discriminated union without
  touching the parse pipeline.
- **Path safety in depth.** Both Zod's regex (`^[^/].*\\.md$`) and the application-
  layer vault-escape check (REQ-ASM-048) reject pathological inputs before the Accept
  button can render.
- **Overwrite protection inherited.** REQ-ASM-044 reuses the REQ-AVS-005 posture used
  elsewhere in the plugin; no new modal pattern is introduced.

### Negative

- **Extra UI surface.** The chat panel grows a `FileWriteProposalCard` component plus
  its accept and reject state plumbing. Mitigated by the card being purely a function
  of an already-validated envelope — there is no business logic in the component.
- **`folderHint` semantics must be enforced.** A hint that is not a prefix of `path`
  is meaningless and must be rejected at validation time, not silently ignored.
  Mitigated by an explicit Zod refinement and a unit test enumerating mismatch cases.
- **Increment-1 schema is markdown-only.** The `path` regex requires a `.md`
  extension. Non-markdown files (code, JSON, YAML, images) cannot be proposed in
  Increment 1; deferred to Increment 2. Documented in the PRD's out-of-scope list.

### Neutral

- The card is rendered in the same chat panel as free-text replies; it is not a
  modal or a separate route. Users do not context-switch when a proposal arrives.
- The `Retry` button (REQ-ASM-050, `should` priority) is a discoverability nicety,
  not a load-bearing requirement; it shares its plumbing with the normal send
  pathway.
- The session-log `## proposal` block is the only audit record in Increment 1.
  A vault-level `audit.md` separate from the per-thread session log is deferred to
  Increment 2 (PRD-ASM-001 out-of-scope).

## Compliance

- `src/application/chat/proposalEnvelope.ts` exports the Zod schema; a snapshot test
  pins the emitted JSON Schema byte-for-byte (REQ-ASM-022, ADR-0030 compliance).
- `src/application/chat/validateProposalPath.ts` exports the vault-escape check; a
  unit test enumerates `..`, leading `/`, double-slash, percent-encoded escapes, and
  Unicode look-alikes (REQ-ASM-048).
- `src/application/chat/commitProposal.ts` exports the Accept-side commit pipeline:
  fileExists check → confirmation modal → folder creation → writeFile → session-log
  append. The commit pipeline is unit-tested end-to-end with `fakeModulePorts()`.
- `src/ui/components/chat/FileWriteProposalCard.vue` carries `data-testid` attributes
  for every interactive element; component tests assert keyboard activation on
  Enter and Space (REQ-ASM-042 acceptance).
- A component test under `tests/ui/components/chat/FileWriteProposalCard.test.ts`
  asserts that clicking Reject calls no `VaultPort` mutation method (REQ-ASM-045
  acceptance) and that clicking Accept on a pre-existing path triggers the
  confirmation modal (REQ-ASM-044 acceptance).
- An integration test under `tests/integration/proposal-to-write.test.ts` walks the
  full chain on `MockBridge`: structured-output envelope → validated → card rendered
  → Accept clicked → `VaultPort.writeFile` called once with the exact validated
  values (NFR-ASM-011).
- A unit test asserts that `folderHint` not a prefix of `path` causes the envelope to
  fail validation (REQ-ASM-047 mismatch branch).
- The `FileWriteProposalCard` template carries no `v-html`; the `content` preview
  uses `textContent` / `setText` (CLAUDE.md DOM construction rule).

## References

- Constitution Article IX (Reversibility).
- IDEA-ASM-001 — Constraints (Trust-first writes); Success criteria (proposal card).
- PRD-ASM-001 — REQ-ASM-022, REQ-ASM-041, REQ-ASM-042, REQ-ASM-043, REQ-ASM-044,
  REQ-ASM-045, REQ-ASM-046, REQ-ASM-047, REQ-ASM-048, REQ-ASM-049, REQ-ASM-050;
  NFR-ASM-007, NFR-ASM-011.
- RES-ASM-001 — D-ASM-008 (Increment-1 schema); D-ASM-010 (tools disabled); F4
  (Structured JSON output discipline).
- ADR-005 — Vault structure (overwrite-protection family / REQ-AVS-005).
- ADR-006 — Obsidian API and vault-write safety.
- ADR-008 — Narrow ports (`VaultPort` is the only mutation surface).
- ADR-0027 — Context as a single user turn.
- ADR-0029 — Transport split.
- ADR-0030 — Structured JSON output via JSON Schema (envelope parsing pipeline).
- ADR-0031 — Session-id persistence (proposal audit trail location).

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only
> the predecessor's `status` and `superseded-by` pointer fields may be updated.
