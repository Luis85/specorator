/**
 * T-ASM-033 — Canonical Zod schema for the `createFile` envelope the LLM
 * returns when proposing a vault write, plus the JSON-Schema string forwarded
 * to `claude -p --json-schema '<schema>'` per ADR-0030.
 *
 * The Zod schema is the single source of truth (ADR-0030 D-ASM-002). The
 * JSON-Schema string is derived from it at module load via Zod 4's built-in
 * `z.toJSONSchema`, so the two never disagree.
 *
 * Satisfies REQ-ASM-021 (envelope schema), REQ-ASM-022 (strict shape — no
 * extra keys), and the structured-output discipline of ADR-0030.
 */
import { z } from 'zod'

/**
 * The createFile envelope: a request from the LLM to write a new file at
 * `path` with `content`. `.strict()` rejects any extra fields so the model
 * cannot smuggle additional instructions through the envelope.
 */
export const createFileEnvelopeSchema = z
  .object({
    action: z.literal('createFile'),
    path: z.string().min(1),
    content: z.string(),
  })
  .strict()

export type CreateFileEnvelope = z.infer<typeof createFileEnvelopeSchema>

/**
 * JSON-Schema string passed to `claude -p --json-schema '<schema>'`. Generated
 * once at module load from the Zod schema; the call sites cache nothing
 * further. Per ADR-0030 the Zod schema is canonical and this string is a
 * derived artefact — never edit by hand.
 */
export const createFileEnvelopeJsonSchema: string = JSON.stringify(
  z.toJSONSchema(createFileEnvelopeSchema),
)
