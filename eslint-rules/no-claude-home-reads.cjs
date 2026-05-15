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

/** Strip ChainExpression wrappers (for optional-chained forms). */
function unwrapChain(node) {
  let cur = node
  while (cur && cur.type === 'ChainExpression') cur = cur.expression
  return cur
}

/** Returns true if `member.property` resolves to the string `name`, whether
 *  written as an identifier or as a computed string literal. */
function isPropertyNamed(member, name) {
  if (member.property.type === 'Identifier') return member.property.name === name
  if (isStringLiteral(member.property)) return member.property.value === name
  return false
}

/** Returns true if `node` ultimately references the global `process`
 *  identifier — either as a bare `process` or as the tail of a member
 *  expression like `globalThis.process` / `window.process` (Codex P1, PR #348). */
function isProcessReference(node) {
  const cur = unwrapChain(node)
  if (!cur) return false
  if (cur.type === 'Identifier' && cur.name === 'process') return true
  if (cur.type === 'MemberExpression' && isPropertyNamed(cur, 'process')) return true
  return false
}

/** Returns true if `node` is any form of `<process>.env`, including
 *  bracket-property access and deeper chains. */
function isProcessEnvAccess(node) {
  const cur = unwrapChain(node)
  if (!cur || cur.type !== 'MemberExpression') return false
  if (!isPropertyNamed(cur, 'env')) return false
  return isProcessReference(cur.object)
}

function isProcessEnvHomeNode(node) {
  const cur = unwrapChain(node)
  if (!cur || cur.type !== 'MemberExpression') return false
  if (!isPropertyNamed(cur, 'HOME')) return false
  return isProcessEnvAccess(cur.object)
}

function isOsHomedirCall(node) {
  const cur = unwrapChain(node)
  if (!cur || cur.type !== 'CallExpression') return false
  const callee = unwrapChain(cur.callee)
  if (!callee) return false
  if (callee.type === 'Identifier' && callee.name === 'homedir') return true
  if (callee.type === 'MemberExpression' && isPropertyNamed(callee, 'homedir')) return true
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

/**
 * Returns true if `node` is a call to any `join`-named function: bare
 * `join(...)` (destructured from `node:path`), `path.join(...)`,
 * `path.posix.join(...)`, `path.win32.join(...)`, or any chain ending in
 * `.join` (Codex P1 PR #348 — closes the `path.join`-only bypass).
 */
function isJoinCallNode(node) {
  const cur = unwrapChain(node)
  if (!cur || cur.type !== 'CallExpression') return false
  const callee = unwrapChain(cur.callee)
  if (!callee) return false
  if (callee.type === 'Identifier' && callee.name === 'join') return true
  if (callee.type === 'MemberExpression' && isPropertyNamed(callee, 'join')) return true
  return false
}

function isPathJoinClaudeCall(node) {
  if (!isJoinCallNode(node)) return false
  const call = unwrapChain(node)
  const firstArg = call.arguments[0]
  const secondArg = call.arguments[1]
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
