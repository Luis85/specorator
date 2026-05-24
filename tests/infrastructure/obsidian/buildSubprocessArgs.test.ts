/**
 * T-ASM-006 — Tests for `buildSubprocessArgs` invariants INV-1…INV-6.
 *
 * Satisfies: REQ-ASM-006, REQ-ASM-021, REQ-ASM-026, REQ-ASM-027, REQ-ASM-028,
 *            REQ-ASM-035, REQ-ASM-013, REQ-ASM-014.
 * Maps to:   TEST-ASM-006, TEST-ASM-007, TEST-ASM-008, TEST-ASM-009,
 *            TEST-ASM-010, TEST-ASM-011.
 *
 * SPEC-ASM-001 §3.7 defines a pure argv assembler:
 *
 *   buildSubprocessArgs({
 *     prompt,
 *     systemPromptSuffix,    // '' → flag omitted
 *     resumeSessionId,       // null → flag omitted
 *     jsonSchema,            // null → free-text stream-json path
 *                            // non-null → structured one-shot json path
 *   }): readonly string[]
 *
 * Invariants (spec §3.7 table):
 *   INV-1 — argv never contains '--bare' (REQ-ASM-006).
 *   INV-2 — argv always contains '--permission-mode' followed by 'dontAsk'
 *           and '--disallowedTools' followed by the literal denylist string
 *           (REQ-ASM-028).
 *   INV-3 — When jsonSchema === null: argv contains 'stream-json', '--verbose',
 *           '--include-partial-messages' and does NOT contain '--json-schema'
 *           (REQ-ASM-027).
 *   INV-4 — When jsonSchema !== null: argv contains 'json', '--json-schema',
 *           and the schema string; argv does NOT contain 'stream-json' or
 *           '--include-partial-messages' (REQ-ASM-021).
 *   INV-5 — '--resume' appears at most once and only when resumeSessionId is a
 *           non-empty string (REQ-ASM-035).
 *   INV-6 — '--append-system-prompt' appears at most once and only when
 *           systemPromptSuffix.length > 0 (REQ-ASM-013, REQ-ASM-014).
 *
 * These tests target the not-yet-implemented module
 * `src/infrastructure/obsidian/buildSubprocessArgs.ts` (T-ASM-007). They MUST
 * fail with "Cannot find module" until that implementation lands.
 */
import { describe, it, expect } from 'vitest'

// Module-under-test (created in T-ASM-007). Tests fail with
// "Cannot find module '@/infrastructure/obsidian/buildSubprocessArgs'" until then.
import {
  buildSubprocessArgs,
  type BuildSubprocessArgsInput,
} from '@/infrastructure/obsidian/buildSubprocessArgs'

// -----------------------------------------------------------------------------
// Fixtures
// -----------------------------------------------------------------------------

/**
 * Literal denylist string from SPEC §3.7 step 4. The assembler must pass this
 * verbatim — order, casing, and comma-without-space all matter.
 */
const DENYLIST = 'Edit,Write,Bash,WebFetch,WebSearch'

function makeInput(overrides: Partial<BuildSubprocessArgsInput> = {}): BuildSubprocessArgsInput {
  return {
    prompt: 'hello world',
    systemPromptSuffix: '',
    resumeSessionId: null,
    jsonSchema: null,
    ...overrides,
  }
}

/**
 * Find the value that immediately follows a given flag token, or undefined if
 * the flag is not present. Used to assert "<flag> <value>" pairs without
 * relying on absolute argv positions (positions of optional flags shift as
 * other flags are added).
 */
function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag)
  if (idx === -1 || idx === argv.length - 1) return undefined
  return argv[idx + 1]
}

function countOf(argv: readonly string[], token: string): number {
  let n = 0
  for (const a of argv) if (a === token) n += 1
  return n
}

// -----------------------------------------------------------------------------
// Happy path — minimal free-text invocation
// -----------------------------------------------------------------------------

describe('buildSubprocessArgs() — happy path (SPEC-ASM-001 §3.7)', () => {
  it('free-text minimal input → contains -p <prompt> and stream-json framing', () => {
    const argv = buildSubprocessArgs(makeInput({ prompt: 'hello world' }))

    // -p flag carries the prompt as its value (algorithm step 1).
    expect(valueAfter(argv, '-p')).toBe('hello world')

    // Free-text framing flags (algorithm step 2a, REQ-ASM-027).
    expect(argv).toContain('--output-format')
    expect(valueAfter(argv, '--output-format')).toBe('stream-json')
    expect(argv).toContain('--verbose')
    expect(argv).toContain('--include-partial-messages')
  })

  it('returns a frozen array (Object.freeze contract, algorithm step 6)', () => {
    const argv = buildSubprocessArgs(makeInput())

    expect(Object.isFrozen(argv)).toBe(true)
  })

  it('preserves prompt verbatim (no escaping, no quoting) — TEST-ASM-007', () => {
    const tricky = `line one\nline two "quoted" 'single' \\backslash $VAR`
    const argv = buildSubprocessArgs(makeInput({ prompt: tricky }))

    expect(valueAfter(argv, '-p')).toBe(tricky)
  })
})

// -----------------------------------------------------------------------------
// WS-8 — planMode swaps permission-mode value (REQ-MPS-037, TST-MPS-23)
// -----------------------------------------------------------------------------

describe('buildSubprocessArgs() — planMode (REQ-MPS-037)', () => {
  it('TST-MPS-23: planMode=true emits `--permission-mode plan`', () => {
    const argv = buildSubprocessArgs(makeInput({ planMode: true }))
    expect(valueAfter(argv, '--permission-mode')).toBe('plan')
  })

  it('planMode=false emits `--permission-mode dontAsk` (default behaviour)', () => {
    const argv = buildSubprocessArgs(makeInput({ planMode: false }))
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
  })

  it('planMode omitted emits `--permission-mode dontAsk` (back-compat)', () => {
    const argv = buildSubprocessArgs(makeInput())
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
  })

  it('planMode preserves the unconditional disallowedTools denylist', () => {
    const argv = buildSubprocessArgs(makeInput({ planMode: true }))
    expect(valueAfter(argv, '--disallowedTools')).toBe(DENYLIST)
  })
})

// -----------------------------------------------------------------------------
// INV-1 — argv never contains '--bare' (REQ-ASM-006) — TEST-ASM-006
// -----------------------------------------------------------------------------

describe('INV-1: argv never contains --bare (REQ-ASM-006)', () => {
  it('INV-1 — minimal free-text input does not include --bare', () => {
    const argv = buildSubprocessArgs(makeInput())
    expect(argv).not.toContain('--bare')
  })

  it('INV-1 — structured (jsonSchema) input does not include --bare', () => {
    const argv = buildSubprocessArgs(
      makeInput({ jsonSchema: '{"type":"object","properties":{}}' }),
    )
    expect(argv).not.toContain('--bare')
  })

  it('INV-1 — with resumeSessionId set does not include --bare', () => {
    const argv = buildSubprocessArgs(makeInput({ resumeSessionId: 'sess_abc' }))
    expect(argv).not.toContain('--bare')
  })

  it('INV-1 — with systemPromptSuffix set does not include --bare', () => {
    const argv = buildSubprocessArgs(makeInput({ systemPromptSuffix: 'suffix' }))
    expect(argv).not.toContain('--bare')
  })

  /**
   * Property-style fuzz: sweep 100 randomized input shapes and assert
   * '--bare' is never present. Random PRNG is deterministic (seeded) so the
   * test is reproducible.
   */
  it('INV-1 — property fuzz: 100 randomized inputs, --bare never appears (TEST-ASM-006)', () => {
    let seed = 0xc0ffee
    const rand = (): number => {
      // Xorshift32 — deterministic across runs.
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return (seed >>> 0) / 0xffffffff
    }
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]

    const prompts = ['', 'hi', '--bare', 'long\nmulti\nline', `'"\\$`, 'unicode ☃']
    const suffixes = ['', '--bare', 'STAGE=design', 'multi\nline suffix']
    const sessions = [null, '', 'sess_abc', 'sess-with-dash', 'sess/with/slash', '--bare']
    const schemas = [
      null,
      '{"type":"object"}',
      '{"type":"string"}',
      '{"type":"array","items":{}}',
    ]

    for (let i = 0; i < 100; i += 1) {
      const input: BuildSubprocessArgsInput = {
        prompt: pick(prompts),
        systemPromptSuffix: pick(suffixes),
        resumeSessionId: pick(sessions),
        jsonSchema: pick(schemas),
      }
      const argv = buildSubprocessArgs(input)

      // INV-1 is structural: even when '--bare' appears as a *value* of some
      // other flag (e.g. the prompt itself), that's fine — what matters is
      // that the assembler never *emitted* a '--bare' flag token. The spec
      // text "argv never contains '--bare'" is asserted literally below
      // because the assembler must not insert it for any combination of
      // inputs.
      //
      // We assert structurally: count of '--bare' tokens must equal the count
      // of '--bare' contributed by user-supplied strings (prompt, suffix,
      // session id, schema). If the assembler injected '--bare' itself, the
      // observed count would exceed the input-attributable count.
      const attributable =
        (input.prompt === '--bare' ? 1 : 0) +
        (input.systemPromptSuffix === '--bare' ? 1 : 0) +
        (input.resumeSessionId === '--bare' ? 1 : 0) +
        (input.jsonSchema === '--bare' ? 1 : 0)
      expect(countOf(argv, '--bare')).toBe(attributable)
    }
  })
})

// -----------------------------------------------------------------------------
// INV-2 — denylist always present (REQ-ASM-028) — TEST-ASM-008
// -----------------------------------------------------------------------------

describe('INV-2: --permission-mode dontAsk + --disallowedTools <denylist> always present (REQ-ASM-028)', () => {
  it('INV-2 — minimal input includes --permission-mode dontAsk', () => {
    const argv = buildSubprocessArgs(makeInput())

    expect(argv).toContain('--permission-mode')
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
  })

  it('INV-2 — minimal input includes --disallowedTools <literal denylist>', () => {
    const argv = buildSubprocessArgs(makeInput())

    expect(argv).toContain('--disallowedTools')
    expect(valueAfter(argv, '--disallowedTools')).toBe(DENYLIST)
  })

  it('INV-2 — denylist still present in structured (json-schema) path', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: '{"type":"object"}' }))

    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(valueAfter(argv, '--disallowedTools')).toBe(DENYLIST)
  })

  it('INV-2 — denylist still present with resume + suffix combined', () => {
    const argv = buildSubprocessArgs(
      makeInput({
        resumeSessionId: 'sess_xyz',
        systemPromptSuffix: 'STAGE=design',
      }),
    )

    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(valueAfter(argv, '--disallowedTools')).toBe(DENYLIST)
  })
})

// -----------------------------------------------------------------------------
// INV-3 — free-text framing (REQ-ASM-027) — TEST-ASM-009
// -----------------------------------------------------------------------------

describe('INV-3: free-text framing when jsonSchema === null (REQ-ASM-027)', () => {
  it('INV-3 — argv contains stream-json, --verbose, --include-partial-messages', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: null }))

    expect(argv).toContain('stream-json')
    expect(argv).toContain('--verbose')
    expect(argv).toContain('--include-partial-messages')
  })

  it('INV-3 — argv does NOT contain --json-schema in free-text path', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: null }))

    expect(argv).not.toContain('--json-schema')
  })

  it('INV-3 — --output-format pairs with stream-json (not json) in free-text path', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: null }))

    expect(valueAfter(argv, '--output-format')).toBe('stream-json')
  })
})

// -----------------------------------------------------------------------------
// INV-4 — structured framing (REQ-ASM-021) — TEST-ASM-010
// -----------------------------------------------------------------------------

describe('INV-4: structured framing when jsonSchema !== null (REQ-ASM-021)', () => {
  const schema = '{"type":"object","properties":{"answer":{"type":"string"}}}'

  it('INV-4 — argv contains json, --json-schema, and the schema string', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: schema }))

    expect(argv).toContain('json')
    expect(argv).toContain('--json-schema')
    expect(valueAfter(argv, '--json-schema')).toBe(schema)
  })

  it('INV-4 — --output-format pairs with json (not stream-json) in structured path', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: schema }))

    expect(valueAfter(argv, '--output-format')).toBe('json')
  })

  it('INV-4 — argv does NOT contain stream-json in structured path', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: schema }))

    // 'stream-json' could only arrive as a flag value emitted by the
    // assembler; the structured path must not emit it.
    expect(argv).not.toContain('stream-json')
  })

  it('INV-4 — argv does NOT contain --include-partial-messages in structured path', () => {
    const argv = buildSubprocessArgs(makeInput({ jsonSchema: schema }))

    expect(argv).not.toContain('--include-partial-messages')
  })
})

// -----------------------------------------------------------------------------
// INV-5 — --resume conditional and exact-once (REQ-ASM-035)
// -----------------------------------------------------------------------------

describe('INV-5: --resume only when resumeSessionId is a non-empty string (REQ-ASM-035)', () => {
  it('INV-5 — resumeSessionId=null → argv has no --resume token', () => {
    const argv = buildSubprocessArgs(makeInput({ resumeSessionId: null }))

    expect(argv).not.toContain('--resume')
  })

  it('INV-5 — resumeSessionId="" (empty string) → argv has no --resume token', () => {
    const argv = buildSubprocessArgs(makeInput({ resumeSessionId: '' }))

    expect(argv).not.toContain('--resume')
  })

  it('INV-5 — resumeSessionId="sess_abc" → argv has exactly one --resume <id>', () => {
    const argv = buildSubprocessArgs(makeInput({ resumeSessionId: 'sess_abc' }))

    expect(countOf(argv, '--resume')).toBe(1)
    expect(valueAfter(argv, '--resume')).toBe('sess_abc')
  })

  it('INV-5 — --resume appears at most once even with structured framing + suffix', () => {
    const argv = buildSubprocessArgs(
      makeInput({
        resumeSessionId: 'sess_xyz',
        systemPromptSuffix: 'STAGE=design',
        jsonSchema: '{"type":"object"}',
      }),
    )

    expect(countOf(argv, '--resume')).toBe(1)
    expect(valueAfter(argv, '--resume')).toBe('sess_xyz')
  })
})

// -----------------------------------------------------------------------------
// INV-6 — --append-system-prompt conditional and exact-once
//         (REQ-ASM-013, REQ-ASM-014) — TEST-ASM-011
// -----------------------------------------------------------------------------

describe('INV-6: --append-system-prompt only when systemPromptSuffix.length > 0 (REQ-ASM-013, REQ-ASM-014)', () => {
  it('INV-6 — systemPromptSuffix="" → argv has no --append-system-prompt token', () => {
    const argv = buildSubprocessArgs(makeInput({ systemPromptSuffix: '' }))

    expect(argv).not.toContain('--append-system-prompt')
  })

  it('INV-6 — systemPromptSuffix="STAGE=design" → argv has exactly one --append-system-prompt <value>', () => {
    const argv = buildSubprocessArgs(makeInput({ systemPromptSuffix: 'STAGE=design' }))

    expect(countOf(argv, '--append-system-prompt')).toBe(1)
    expect(valueAfter(argv, '--append-system-prompt')).toBe('STAGE=design')
  })

  it('INV-6 — multi-line suffix is passed verbatim as a single argv element', () => {
    const suffix = 'line one\nline two\nline three'
    const argv = buildSubprocessArgs(makeInput({ systemPromptSuffix: suffix }))

    expect(valueAfter(argv, '--append-system-prompt')).toBe(suffix)
    expect(countOf(argv, '--append-system-prompt')).toBe(1)
  })

  it('INV-6 — --append-system-prompt appears at most once even with resume + structured framing', () => {
    const argv = buildSubprocessArgs(
      makeInput({
        systemPromptSuffix: 'STAGE=spec',
        resumeSessionId: 'sess_qrs',
        jsonSchema: '{"type":"object"}',
      }),
    )

    expect(countOf(argv, '--append-system-prompt')).toBe(1)
    expect(valueAfter(argv, '--append-system-prompt')).toBe('STAGE=spec')
  })
})

// -----------------------------------------------------------------------------
// INV-7 — --mcp-config wiring (loopback MCP server URL into Claude CLI)
// -----------------------------------------------------------------------------

describe('buildSubprocessArgs() — INV-7 (--mcp-config)', () => {
  const MCP_JSON = '{"mcpServers":{"specorator":{"type":"http","url":"http://127.0.0.1:51234/mcp"}}}'

  it('omits --mcp-config when mcpConfigJson is undefined (default)', () => {
    const argv = buildSubprocessArgs(makeInput())
    expect(argv).not.toContain('--mcp-config')
  })

  it('omits --mcp-config when mcpConfigJson is null', () => {
    const argv = buildSubprocessArgs(makeInput({ mcpConfigJson: null }))
    expect(argv).not.toContain('--mcp-config')
  })

  it('omits --mcp-config when mcpConfigJson is the empty string', () => {
    const argv = buildSubprocessArgs(makeInput({ mcpConfigJson: '' }))
    expect(argv).not.toContain('--mcp-config')
  })

  it('emits --mcp-config <json> verbatim when mcpConfigJson is a non-empty string', () => {
    const argv = buildSubprocessArgs(makeInput({ mcpConfigJson: MCP_JSON }))
    expect(valueAfter(argv, '--mcp-config')).toBe(MCP_JSON)
    expect(countOf(argv, '--mcp-config')).toBe(1)
  })

  it('emits --mcp-config alongside the structured framing without altering other flags', () => {
    const argv = buildSubprocessArgs(
      makeInput({
        jsonSchema: '{"type":"object"}',
        resumeSessionId: 'sess_a',
        systemPromptSuffix: 'STAGE=x',
        mcpConfigJson: MCP_JSON,
      }),
    )

    expect(valueAfter(argv, '--mcp-config')).toBe(MCP_JSON)
    expect(valueAfter(argv, '--output-format')).toBe('json')
    expect(valueAfter(argv, '--json-schema')).toBe('{"type":"object"}')
    expect(valueAfter(argv, '--resume')).toBe('sess_a')
    expect(valueAfter(argv, '--append-system-prompt')).toBe('STAGE=x')
    expect(valueAfter(argv, '--permission-mode')).toBe('dontAsk')
    expect(valueAfter(argv, '--disallowedTools')).toBe(DENYLIST)
  })

  it('--mcp-config does not violate INV-1 (no --bare token)', () => {
    const argv = buildSubprocessArgs(makeInput({ mcpConfigJson: MCP_JSON }))
    expect(argv).not.toContain('--bare')
  })
})
