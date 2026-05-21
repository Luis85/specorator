/**
 * Pure argv assembler for the Claude CLI subprocess transport.
 *
 * Single source of truth for the command-line arguments passed to the `claude`
 * binary by `ClaudeSubprocessAdapter`. Holding this in a separate pure module
 * lets the invariants (INV-1…INV-6) be asserted without spawning a process.
 *
 * Spec:      SPEC-ASM-001 §3.7 (buildSubprocessArgs)
 * Satisfies: REQ-ASM-006, REQ-ASM-013, REQ-ASM-014, REQ-ASM-021, REQ-ASM-026,
 *            REQ-ASM-027, REQ-ASM-028, REQ-ASM-035
 * Tests:     tests/infrastructure/obsidian/buildSubprocessArgs.test.ts
 *
 * Constraints:
 *  - Pure: no I/O, no spawn, no async, no side effects.
 *  - No `obsidian` imports (ADR-008 — this file is infrastructure but purely
 *    data; it is consumed by `ClaudeSubprocessAdapter` which owns the spawn).
 *  - Return value is `Object.freeze`-ed per spec §3.7 step 6.
 */

/**
 * Literal denylist string from SPEC §3.7 step 4 (REQ-ASM-028). Order, casing,
 * and the comma-without-space separator are all load-bearing — the CLI parses
 * this verbatim.
 */
const DISALLOWED_TOOLS_DENYLIST = 'Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch'

export interface BuildSubprocessArgsInput {
  readonly prompt: string
  /** Empty string is permitted; empty string → flag omitted (INV-6). */
  readonly systemPromptSuffix: string
  /** `null` or `''` → flag omitted (INV-5). */
  readonly resumeSessionId: string | null
  /** `null` → free-text stream-json path; non-null → structured one-shot json path. */
  readonly jsonSchema: string | null
  /**
   * WS-8 (REQ-MPS-037, TST-MPS-23). When `true` the assembler emits
   * `--permission-mode plan` in place of `dontAsk`, telling Claude CLI to
   * propose a plan rather than execute tools. Optional; default `false`.
   */
  readonly planMode?: boolean
}

/**
 * Assemble the argv array for a single Claude CLI subprocess invocation.
 *
 * Algorithm (SPEC-ASM-001 §3.7):
 *   1. Start with `['-p', input.prompt]`.
 *   2. Framing branch on `jsonSchema`:
 *       - null     → free-text:   stream-json + --verbose + --include-partial-messages.
 *       - non-null → structured:  json + --json-schema <schema>.
 *   3. Optional `--append-system-prompt` when suffix is non-empty.
 *   4. Always push `--permission-mode dontAsk` and `--disallowedTools <denylist>`.
 *   5. Optional `--resume <id>` when session id is a non-empty string.
 *   6. Freeze and return.
 *
 * INV-1 is enforced by construction: the assembler never emits the literal
 * token `'--bare'`. User-supplied strings (prompt, suffix, session id, schema)
 * may happen to equal `'--bare'`, but they appear only as flag *values*, never
 * as flag tokens.
 */
export function buildSubprocessArgs(input: BuildSubprocessArgsInput): readonly string[] {
  // Step 1 — prompt carrier (INV-1: '-p', never '--bare').
  const argv: string[] = ['-p', input.prompt]

  // Step 2 — framing branch (INV-3 / INV-4).
  if (input.jsonSchema === null) {
    // INV-3: free-text path → stream-json + --verbose + --include-partial-messages.
    argv.push('--output-format', 'stream-json', '--verbose', '--include-partial-messages')
  } else {
    // INV-4: structured path → json + --json-schema <schema>.
    // No stream-json, no --verbose, no --include-partial-messages.
    argv.push('--output-format', 'json', '--json-schema', input.jsonSchema)
  }

  // Step 3 — INV-6: append-system-prompt iff suffix is non-empty.
  if (input.systemPromptSuffix.length > 0) {
    argv.push('--append-system-prompt', input.systemPromptSuffix)
  }

  // Step 4 — INV-2: denylist is unconditional.
  // WS-8 (REQ-MPS-037): plan mode swaps the permission-mode value but keeps
  // the unconditional denylist invariant.
  const permissionMode = input.planMode === true ? 'plan' : 'dontAsk'
  argv.push('--permission-mode', permissionMode, '--disallowedTools', DISALLOWED_TOOLS_DENYLIST)

  // Step 5 — INV-5: --resume iff sessionId is a non-empty string.
  if (input.resumeSessionId !== null && input.resumeSessionId.length > 0) {
    argv.push('--resume', input.resumeSessionId)
  }

  // Step 6 — freeze so callers cannot mutate the canonical argv (INV-1
  // structurally cannot be violated post-return).
  return Object.freeze(argv)
}
