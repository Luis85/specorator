/**
 * T-ASM-077 — Tests for the `no-claude-home-reads` ESLint rule.
 *
 * Covers TEST-ASM-050 (REQ-ASM-007, NFR-ASM-004). Runs in Node via the
 * standard ESLint `RuleTester` (CommonJS), not Vitest. Invoked by
 * `npm run lint:rules` (see package.json).
 *
 * Covers the five disallow patterns from SPEC-ASM-001 §13.2:
 *   1. Literal `'~/.claude/'`.
 *   2. Literal `'.credentials.json'`.
 *   3. Literal `'CLAUDE_CODE_OAUTH_TOKEN'`.
 *   4. `process.env.HOME + '/.claude'` (concatenation).
 *   5. `path.join(os.homedir(), '.claude')` (call expression).
 *
 * Plus an allow-list invariant: unrelated string/path expressions produce
 * zero violations. The directory-scoped allow-list (tests/**, inputs/**,
 * docs/**) is enforced by `eslint.config.js`, not by the rule body.
 */

'use strict'

const { RuleTester } = require('eslint')
const rule = require('../no-claude-home-reads.cjs')

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

ruleTester.run('no-claude-home-reads', rule, {
  valid: [
    "const s = 'hello world'",
    "const p = '/etc/hosts'",
    "const k = 'claude-cli-path'",
    "const k = 'anthropicApiKey'",
    "const p = path.join(os.homedir(), '.config')",
    "const p = process.env.HOME + '/.config'",
    "const p = path.join('foo', 'bar', 'baz')",
    // Identifier-like suffix on `.claude` (e.g. `~/.claude-cli-bin`) is a
    // different directory and must NOT trip the rule.
    "const p = '~/.claude-cli-bin'",
    // Template literal with unrelated quasi after HOME.
    'const p = `${process.env.HOME}/.config/foo`',
    'const p = `${os.homedir()}/.config`',
  ],
  invalid: [
    // Pattern 1 — literal `'~/.claude/'`.
    {
      code: "const p = '~/.claude/'",
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: "const p = '~/.claude/sessions'",
      errors: [{ messageId: 'forbidden' }],
    },
    // Pattern 2 — literal `'.credentials.json'`.
    {
      code: "const c = '.credentials.json'",
      errors: [{ messageId: 'forbidden' }],
    },
    // Pattern 3 — literal `'CLAUDE_CODE_OAUTH_TOKEN'`.
    {
      code: "const t = 'CLAUDE_CODE_OAUTH_TOKEN'",
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: "const v = env['CLAUDE_CODE_OAUTH_TOKEN']",
      errors: [{ messageId: 'forbidden' }],
    },
    // Pattern 4 — `process.env.HOME + '/.claude'` concatenation.
    {
      code: "const p = process.env.HOME + '/.claude'",
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: "const p = process.env.HOME + '/.claude/sessions'",
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: "const p = '/.claude/x' + process.env.HOME",
      errors: [{ messageId: 'forbidden' }],
    },
    // Pattern 5 — `path.join(os.homedir(), '.claude', ...)`.
    {
      code: "const p = path.join(os.homedir(), '.claude')",
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: "const p = path.join(os.homedir(), '.claude/sessions')",
      errors: [{ messageId: 'forbidden' }],
    },
    // Codex P2 (PR #348) — bare `~/.claude` (no trailing slash) must also fire.
    {
      code: "const p = '~/.claude'",
      errors: [{ messageId: 'forbidden' }],
    },
    // Codex P1 (PR #348) — template literal `${process.env.HOME}/.claude`.
    {
      code: 'const p = `${process.env.HOME}/.claude`',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const p = `${process.env.HOME}/.claude/sessions`',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const p = `${os.homedir()}/.claude`',
      errors: [{ messageId: 'forbidden' }],
    },
    {
      code: 'const p = `${os.homedir()}/.claude/sessions`',
      errors: [{ messageId: 'forbidden' }],
    },
  ],
})

// Severity assertion (flat-config form, ESLint 9+). Confirms the rule
// reports at severity 2 (error) when wired under the host's `error` level.
const { Linter } = require('eslint')
const linter = new Linter()
const sampleResult = linter.verify(
  "const p = '~/.claude/'",
  {
    plugins: { local: { rules: { 'no-claude-home-reads': rule } } },
    rules: { 'local/no-claude-home-reads': 'error' },
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
  },
  { filename: 'sample.js' },
)
if (sampleResult.length !== 1 || sampleResult[0].severity !== 2) {
  throw new Error(
    'T-ASM-077 severity assertion failed: expected one severity-2 (error) violation, got ' +
      JSON.stringify(sampleResult),
  )
}

// eslint-disable-next-line no-console
console.log(
  'eslint-rules/no-claude-home-reads: all RuleTester cases + severity assertion passed.',
)
