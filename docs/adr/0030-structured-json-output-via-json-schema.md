---
id: ADR-0030
title: Use `--output-format json --json-schema` plus Zod revalidation for every structured proposal call
status: accepted
date: 2026-05-14
deciders:
  - architect
consulted:
  - pm
  - analyst
informed:
  - dev
supersedes: []
superseded-by: []
tags: [chat, structured-output, agent-sidepanel-mvp, validation, trust-first]
---

# ADR-0030 — Use `--output-format json --json-schema` plus Zod revalidation for every structured proposal call

## Status

Accepted

## Context

The Agent Sidepanel MVP's trust-first write loop (IDEA-ASM-001 success criteria;
PRD-ASM-001 §File-write proposals) requires the model to return a **parseable**
envelope describing a proposed vault write. The plugin must surface that envelope as a
proposal card with Accept / Reject controls; only on Accept does any vault mutation
occur (REQ-ASM-043).

Free-text replies cannot fulfil this contract. RES-ASM-001 §F4 enumerates the failure
modes when no schema is enforced (citing [anthropics/claude-code#9058](https://github.com/anthropics/claude-code/issues/9058)):

- Leading prose preambles ("Here's the file you asked for: ...").
- Markdown code-fence wrapping (` ```json … ``` `).
- Truncated JSON when the model runs out of budget.
- Trailing commentary or follow-up questions.

The `claude` CLI exposes two relevant framings:

1. `--output-format json` (no schema). Result envelope contains `.result` with the
   free-text answer. **All four failure modes above remain.**
2. `--output-format json --json-schema '<schema>'`. Result envelope contains both
   `.result` (free text, may still have preamble) and `.structured_output` — a
   server-validated payload conforming to the supplied JSON Schema.

Even the schema-validated path is not bulletproof. Anthropic may relax validation
upstream (R-ASM-004); the schema rejects only structural problems, not semantic ones
(e.g., a `path` that escapes the vault root); and the network shape of the envelope
may change.

Three strategies were considered:

1. **Free-text plus regex extraction.** Pure regex on `.result` to pull out the first
   `{…}` block. Fragile against nested objects inside the `content` field and against
   unescaped braces in markdown payloads.
2. **`--json-schema` only, trust `.structured_output` blindly.** Skip client-side
   revalidation. Smallest code but leaves a single upstream change able to corrupt
   every vault write.
3. **`--json-schema` plus Zod revalidation at the application boundary.** Use the
   server-side schema for primary validation, then revalidate the same shape with Zod
   at the application seam as defence-in-depth. Includes a brace-depth-counting
   fallback parser when `.structured_output` is missing or fails Zod.

## Decision

We adopt strategy 3 — server-side JSON Schema **plus** application-layer Zod
revalidation, with a single defensive fallback path.

Every structured-output call follows this exact recipe:

1. **Invocation.** The subprocess transport is spawned with
   `--output-format json --json-schema '<schema>'` (REQ-ASM-021). The schema is the
   Increment-1 envelope literal (REQ-ASM-022):

   ```json
   {
     "type": "object",
     "properties": {
       "action": { "const": "createFile" },
       "path": { "type": "string", "pattern": "^[^/].*\\.md$" },
       "content": { "type": "string", "minLength": 1 },
       "rationale": { "type": "string" },
       "folderHint": { "type": "string" }
     },
     "required": ["action", "path", "content"],
     "additionalProperties": false
   }
   ```

2. **System-prompt suffix.** The literal string `"Return only the JSON object — no
   commentary."` is appended to the system prompt (REQ-ASM-026). This is defence-in-
   depth — it does not replace the schema, but it makes the schema's job easier when
   the model is tempted to add commentary.

3. **Tools disabled.** Every structured call carries `--permission-mode dontAsk
   --disallowedTools "Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch"` (REQ-ASM-028;
   D-ASM-010). The trust-first gate is on the client; allowing server-side tools would
   bypass it.

4. **Primary parse.** Read `.structured_output` from the result envelope. Pass it
   through the canonical Zod schema (`src/application/chat/proposalEnvelope.ts`).
   Zod's `additionalProperties: false`-equivalent (`.strict()`) rejects unknown
   fields — a property the JSON Schema also enforces server-side but which we
   independently verify (REQ-ASM-023).

5. **Defensive fallback.** If `.structured_output` is absent or fails Zod, scan
   `.result` for the first balanced `{…}` block using a brace-depth counter (REQ-ASM-024).
   The counter must correctly handle nested objects inside the `content` string field,
   so a naive `result.match(/\{.*\}/s)` is forbidden. The extracted substring is then
   re-validated against the same Zod schema.

6. **Single failure surface.** If both the primary parse and the fallback fail Zod,
   the application service returns `Result.error` carrying
   `errorCode: 'STRUCTURED_PARSE_FAILED'`. The UI renders the plain-language string
   "Assistant returned an unexpected response. Please try again." (REQ-ASM-025). Raw
   model output is never quoted to the user — that would leak SDK terminology
   (NFR-CCS-012, NFR-ASM-009).

7. **Path security.** Even when Zod validation passes, `path` is independently checked
   for vault-escape patterns (REQ-ASM-048): `..` segments, leading `/`, or any
   resolved path outside the vault root all cause the proposal to be treated as
   invalid and the Accept button is not rendered.

The Zod schema lives in `src/application/chat/proposalEnvelope.ts` and is exported as
`createFileEnvelopeSchema`. The schema string passed to `--json-schema` is generated
once at module load by `zod-to-json-schema(createFileEnvelopeSchema)`, then frozen and
cached so the byte-for-byte snapshot test (REQ-ASM-022 acceptance) is stable.

## Considered options

### Option A — Free-text plus regex extraction

- Pros: zero new flags; works with any CLI version.
- Cons: every failure mode in F4 hits the user; regex on `.result` cannot distinguish
  the envelope object from a code-fenced example or from braces inside `content`;
  Zod-rejection rate would be high; user-facing error rate unacceptable.

### Option B — `--json-schema` only, trust `.structured_output` blindly

- Pros: simplest application-layer code (one property read, one type cast).
- Cons: single upstream change (server-side validator regression — R-ASM-004) corrupts
  every vault write; no defence-in-depth against malformed payloads; the seam between
  infrastructure and application has no type guarantee; the brace-depth fallback would
  be a fresh code path written later under pressure.

### Option C — `--json-schema` plus Zod revalidation with defensive fallback (chosen)

- Pros: defence-in-depth at the application boundary; Zod is the single source of
  truth for the envelope shape (the JSON Schema is generated from it); fallback
  parser catches structurally-valid JSON that arrived outside `.structured_output`;
  `additionalProperties: false` plus `.strict()` rejects field-inflation attacks;
  failure surface is one error code, one copy string.
- Cons: small amount of duplicate validation (server + client); requires the
  `zod-to-json-schema` dev dependency (already in use elsewhere in the codebase).

## Consequences

### Positive

- **Trust-first writes by default.** No vault path or content reaches the proposal
  card without passing both server-side schema validation and application-layer Zod
  revalidation.
- **Single source of truth for the envelope shape.** `createFileEnvelopeSchema` in
  `src/application/chat/proposalEnvelope.ts` is the canonical definition; the
  `--json-schema` argument is generated from it; the Vue `FileWriteProposalCard.vue`
  imports the inferred TypeScript type.
- **Bounded failure surface.** Every parse failure maps to
  `STRUCTURED_PARSE_FAILED` and one user-facing string. UI does not need to enumerate
  failure modes.
- **Compatibility with future schemas.** Adding `editFile` or `deleteFile` envelopes
  in Increment 2 is a discriminated-union extension of `createFileEnvelopeSchema`; no
  change to the parse-and-revalidate pipeline.

### Negative

- **Two validation layers.** The same shape is validated server-side and client-side.
  This is intentional defence-in-depth (R-ASM-004) but increases the amount of code
  that must agree about the envelope shape. Mitigated by generating one from the other.
- **Brace-depth parser must handle nested objects inside `content`.** The fallback
  parser is more than a one-liner. A unit test enumerates the parse-failure cases
  from F4 to keep the parser honest.
- **Free-text chat must opt out.** Free-text chat (REQ-ASM-027) uses `--output-format
  stream-json --verbose --include-partial-messages` and **must not** pass
  `--json-schema`; the argument builder is the single place where this branch is
  enforced and is unit-tested for both call modes.

### Neutral

- The system-prompt suffix is appended in addition to the stage-aware preamble
  (REQ-ASM-013, REQ-ASM-026). Concatenation order is: stage preamble → CCS context
  preamble (REQ-ASM-054) → "Return only the JSON object — no commentary." This order
  is asserted by a unit test.
- The Increment-1 schema is `createFile` only. Edit / delete envelopes are deferred
  to Increment 2. The discriminator field is present (`action: "createFile"` as a
  literal `const`) so future envelopes can be added as a Zod discriminated union
  without changing the existing schema.

## Compliance

- `src/application/chat/proposalEnvelope.ts` exports `createFileEnvelopeSchema` (Zod)
  and `createFileEnvelopeJsonSchema` (the result of `zod-to-json-schema`).
  `createFileEnvelopeJsonSchema` is the literal passed to `--json-schema`.
- The Zod schema uses `.strict()` and the JSON Schema sets `additionalProperties:
  false`. A unit test asserts that an envelope with an unknown field is rejected by
  both.
- `src/application/chat/parseStructuredEnvelope.ts` exports the
  `parseStructuredEnvelope(rawResult, structuredOutput)` function returning
  `Result<CreateFileEnvelope, ProposalParseError>`. The fallback parser is its own
  exported helper for direct unit testing.
- A snapshot test under `tests/application/chat/proposalEnvelope.test.ts` pins the
  emitted JSON Schema string byte-for-byte (REQ-ASM-022). The test normalises key
  order (recursive `Object.keys().sort()` before serialising) so a Zod or
  `zod-to-json-schema` minor-version bump that reorders properties without changing
  semantics does not break the snapshot; only a genuine shape change should fail it.
- An argument-builder test under `tests/infrastructure/obsidian/subprocess-args.test.ts`
  asserts the structured-call argv contains `--output-format json --json-schema` and
  the literal system-prompt suffix from REQ-ASM-026, and that the free-text-call argv
  contains neither (REQ-ASM-027).
- A path-validation unit test enumerates `..`, leading `/`, and `<vault-root>/../` —
  all must yield `Result.error` before the Accept button is rendered (REQ-ASM-048).
- ESLint `no-restricted-imports` continues to forbid raw `fs` imports in the
  envelope-parsing module; the only side effect a parser may have is reading the
  string it was given.

## References

- IDEA-ASM-001 — Constraints (structured output; Zod at the application boundary).
- PRD-ASM-001 — REQ-ASM-021, REQ-ASM-022, REQ-ASM-023, REQ-ASM-024, REQ-ASM-025,
  REQ-ASM-026, REQ-ASM-027, REQ-ASM-028, REQ-ASM-048.
- RES-ASM-001 — D-ASM-003, D-ASM-004, D-ASM-008, D-ASM-010; F1 (CLI reference), F4
  (Structured JSON output discipline); R-ASM-004 (validator regressions).
- ADR-004 — `Result<T, E>` discriminated union.
- ADR-008 — Narrow ports.
- ADR-0027 — Context as a single user turn (prompt-assembly seam).
- [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [anthropics/claude-code#9058](https://github.com/anthropics/claude-code/issues/9058)

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only
> the predecessor's `status` and `superseded-by` pointer fields may be updated.
