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
  // Match both `~/.claude` (bare directory reference) and `~/.claude/`
  // (path under the directory). Codex P2 PR #348 — without the trailing
  // slash the literal previously slipped through. The lookahead requires
  // the next character to be a non-identifier so `~/.claude-foo` won't
  // false-positive.
  { regex: /~\/\.claude(?![a-zA-Z0-9_-])/, label: '~/.claude' },
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
  if (!node) return false
  // `process.env?.HOME` parses to a `ChainExpression` wrapping the
  // underlying MemberExpression; unwrap one level so optional-chained
  // forms aren't a bypass (Codex P1, PR #348).
  const inner = node.type === 'ChainExpression' ? node.expression : node
  if (!inner || inner.type !== 'MemberExpression') return false
  // The `process.env` part can itself be optional-chained
  // (e.g. `process?.env.HOME`), so unwrap the inner object too.
  const objectExpr =
    inner.object.type === 'ChainExpression'
      ? inner.object.expression
      : inner.object
  const objectIsProcessEnv =
    objectExpr.type === 'MemberExpression' &&
    objectExpr.object.type === 'Identifier' &&
    objectExpr.object.name === 'process' &&
    objectExpr.property.type === 'Identifier' &&
    objectExpr.property.name === 'env'
  if (!objectIsProcessEnv) return false
  if (inner.property.type === 'Identifier') return inner.property.name === 'HOME'
  if (isStringLiteral(inner.property)) return inner.property.value === 'HOME'
  return false
}

function isOsHomedirCall(node) {
  if (!node) return false
  // Same optional-chain unwrap for `os?.homedir()` (Codex P1, PR #348).
  const inner = node.type === 'ChainExpression' ? node.expression : node
  if (!inner || inner.type !== 'CallExpression') return false
  const calleeRaw = inner.callee
  // The callee itself may be optional-chained (`os?.homedir`); unwrap.
  const callee =
    calleeRaw && calleeRaw.type === 'ChainExpression'
      ? calleeRaw.expression
      : calleeRaw
  if (!callee) return false
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

/**
 * Template-literal shape: `${process.env.HOME}/.claude` or
 * `${os.homedir()}/.claude/sessions`. Returns true when ANY expression in
 * the template is a HOME-shaped node AND the adjacent quasi (the literal
 * segment immediately following that expression) starts with `/.claude`
 * (Codex P1, PR #348 — closes the BinaryExpression-only bypass).
 */
function templateInterpolatesClaudeDir(node) {
  if (node.type !== 'TemplateLiteral') return false
  for (let i = 0; i < node.expressions.length; i += 1) {
    const expr = node.expressions[i]
    if (!isProcessEnvHomeNode(expr) && !isOsHomedirCall(expr)) continue
    const trailingQuasi = node.quasis[i + 1]
    if (trailingQuasi === undefined) continue
    if (/^\/?\.claude(?:\/|$|[^a-zA-Z0-9_-])/.test(trailingQuasi.value.cooked)) {
      return true
    }
  }
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
        // Pattern A: the literal quasis spell out a forbidden token
        // (e.g. `~/.claude/foo`). Same surface as a string literal.
        const value = stringValueOf(node)
        if (value !== null) {
          for (const { regex, label } of FORBIDDEN_LITERAL_PATTERNS) {
            if (regex.test(value)) {
              context.report({ node, messageId: 'forbidden', data: { label } })
              return
            }
          }
        }
        // Pattern B: `${process.env.HOME}/.claude` or `${os.homedir()}/.claude`
        // — the HOME-shaped expression interpolates into a quasi that starts
        // with `/.claude` (Codex P1, PR #348).
        if (templateInterpolatesClaudeDir(node)) {
          context.report({
            node,
            messageId: 'forbidden',
            data: {
              label: '~/.claude/ (via template literal with process.env.HOME / os.homedir())',
            },
          })
        }
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
