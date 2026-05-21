/**
 * Pure argv assembler for the Cursor CLI subprocess transport.
 *
 * Mirror of `buildSubprocessArgs` (Claude). Single source of truth for the
 * command-line arguments passed to the `cursor-agent` binary by
 * `CursorCliAdapter`. Holding this in a separate pure module lets the
 * invariants be asserted without spawning a process.
 *
 * Spec:      SPEC-MPS-001 §6 (placeholder pending CQ-MPS-01)
 * Satisfies: REQ-MPS-015, REQ-MPS-037
 * Tests:     tests/infrastructure/obsidian/buildCursorSubprocessArgs.test.ts
 *
 * Constraints:
 *  - Pure: no I/O, no spawn, no async, no side effects.
 *  - No `obsidian` imports (ADR-008).
 *  - Return value is `Object.freeze`-ed so callers cannot mutate the canonical
 *    argv post-return.
 */

export interface BuildCursorSubprocessArgsInput {
  readonly prompt: string
  /** `null` or `''` → `--model` flag omitted. */
  readonly model: string | null
  /** `true` → append `--mode plan`. */
  readonly planMode: boolean
  /** `null` or `''` → `--resume` flag omitted. */
  readonly resumeSessionId: string | null
}

/**
 * Assemble the argv array for a single `cursor-agent` invocation.
 *
 * Output shape (SPEC-MPS-001 §6, placeholder pending CQ-MPS-01):
 *
 *   ['chat', '--stream-json', '--prompt', prompt,
 *    ...(model      ? ['--model',  model]            : []),
 *    ...(planMode   ? ['--mode',   'plan']           : []),
 *    ...(resume     ? ['--resume', resumeSessionId]  : [])]
 */
export function buildCursorSubprocessArgs(
  input: BuildCursorSubprocessArgsInput,
): readonly string[] {
  const argv: string[] = ['chat', '--stream-json', '--prompt', input.prompt]

  if (input.model !== null && input.model.length > 0) {
    argv.push('--model', input.model)
  }

  if (input.planMode) {
    argv.push('--mode', 'plan')
  }

  if (input.resumeSessionId !== null && input.resumeSessionId.length > 0) {
    argv.push('--resume', input.resumeSessionId)
  }

  return Object.freeze(argv)
}
