/**
 * T-ASM-078 — `no-claude-home-reads` ESLint rule.
 *
 * Bans any code path that would read from Claude Code's local on-disk state
 * (the OAuth credentials, the session log, environment-tunnelled refresh
 * tokens). Enforces SPEC-ASM-001 §13.2 and NFR-ASM-004: the plugin must
 * never touch `~/.claude/` or `.credentials.json`, and must never shell out
 * with `CLAUDE_CODE_OAUTH_TOKEN` in the spawned environment.
 *
 * CommonJS — runs in Node's ESLint host (eslint.config.js loads via
 * `await import` and `module.exports` round-trips cleanly).
 *
 * Patterns flagged:
 *   1. String literals containing `~/.claude/` (e.g. `'~/.claude/'`).
 *   2. String literals containing `.credentials.json`.
 *   3. String literals matching `CLAUDE_CODE_OAUTH_TOKEN`.
 *   4. `process.env.HOME + '/.claude'` (and similar `.claude` concatenations).
 *   5. `path.join(os.homedir(), '.claude', ...)`.
 *
 * Allow-list: applied at the call-site in `eslint.config.js` — fixtures
 * under `tests/**`, work packages under `inputs/**`, and prose under
 * `docs/**` are exempt.
 */

'use strict'

const FORBIDDEN_LITERAL_PATTERNS = [
  { regex: /~\/\.claude\//, label: '~/.claude/' },
  { regex: /\.credentials\.json/, label: '.credentials.json' },
  { regex: /CLAUDE_CODE_OAUTH_TOKEN/, label: 'CLAUDE_CODE_OAUTH_TOKEN' },
]

function isStringLiteral(node) {
  return node && node.type === 'Literal' && typeof node.value === 'string'
}

function isTemplateLiteral(node) {
  return node && node.type === 'TemplateLiteral'
}

function stringValueOf(node) {
  if (isStringLiteral(node)) return node.value
  if (isTemplateLiteral(node)) {
    // Concatenate quasis only — expressions are opaque; the quasis carry the
    // literal segments the developer typed.
    return node.quasis.map((q) => q.value.cooked).join('')
  }
  return null
}

function isProcessEnvHomeNode(node) {
  // process.env.HOME or process.env['HOME']
  if (!node || node.type !== 'MemberExpression') return false
  const objectIsProcessEnv =
    node.object.type === 'MemberExpression' &&
    node.object.object.type === 'Identifier' &&
    node.object.object.name === 'process' &&
    node.object.property.type === 'Identifier' &&
    node.object.property.name === 'env'
  if (!objectIsProcessEnv) return false
  if (node.property.type === 'Identifier') return node.property.name === 'HOME'
  if (isStringLiteral(node.property)) return node.property.value === 'HOME'
  return false
}

function isOsHomedirCall(node) {
  if (!node || node.type !== 'CallExpression') return false
  const callee = node.callee
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'os' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'homedir'
  ) {
    return true
  }
  // Also catch destructured `homedir()` if called directly.
  if (callee.type === 'Identifier' && callee.name === 'homedir') return true
  return false
}

function concatenatesClaudeDir(node) {
  // node is a BinaryExpression with operator '+'.
  // Returns true if one side is a process.env.HOME / os.homedir() expression
  // AND the other side is a string containing '.claude'.
  if (node.type !== 'BinaryExpression' || node.operator !== '+') return false
  const left = node.left
  const right = node.right
  const leftIsHome = isProcessEnvHomeNode(left) || isOsHomedirCall(left)
  const rightIsHome = isProcessEnvHomeNode(right) || isOsHomedirCall(right)
  const leftString = stringValueOf(left)
  const rightString = stringValueOf(right)
  if (leftIsHome && rightString !== null && rightString.includes('.claude')) return true
  if (rightIsHome && leftString !== null && leftString.includes('.claude')) return true
  return false
}

function isPathJoinClaudeCall(node) {
  // path.join(os.homedir(), '.claude', ...) or path.join(homedir(), '.claude').
  if (node.type !== 'CallExpression') return false
  const callee = node.callee
  const isPathJoin =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'path' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'join'
  if (!isPathJoin) return false
  const firstArg = node.arguments[0]
  const secondArg = node.arguments[1]
  if (firstArg === undefined || secondArg === undefined) return false
  if (!isOsHomedirCall(firstArg) && !isProcessEnvHomeNode(firstArg)) return false
  const secondValue = stringValueOf(secondArg)
  return secondValue !== null && secondValue.includes('.claude')
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid any path/token reference that would read from ~/.claude/ ' +
        '(SPEC-ASM-001 §13.2, NFR-ASM-004). The plugin must never touch ' +
        'Claude Code\'s on-disk OAuth state.',
    },
    schema: [],
    messages: {
      forbidden:
        '{{label}} references are forbidden: the plugin must never read ' +
        '~/.claude/ or any Claude Code credential surface ' +
        '(SPEC-ASM-001 §13.2, NFR-ASM-004).',
    },
  },
  create(context) {
    function checkStringValue(node, value) {
      for (const { regex, label } of FORBIDDEN_LITERAL_PATTERNS) {
        if (regex.test(value)) {
          context.report({ node, messageId: 'forbidden', data: { label } })
          return
        }
      }
    }
    return {
      Literal(node) {
        if (typeof node.value !== 'string') return
        checkStringValue(node, node.value)
      },
      TemplateLiteral(node) {
        const value = stringValueOf(node)
        if (value === null) return
        checkStringValue(node, value)
      },
      BinaryExpression(node) {
        if (concatenatesClaudeDir(node)) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { label: '~/.claude/ (via process.env.HOME / os.homedir() concatenation)' },
          })
        }
      },
      CallExpression(node) {
        if (isPathJoinClaudeCall(node)) {
          context.report({
            node,
            messageId: 'forbidden',
            data: { label: '~/.claude/ (via path.join + os.homedir())' },
          })
        }
      },
    }
  },
}
