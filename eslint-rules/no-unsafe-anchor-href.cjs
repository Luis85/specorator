/**
 * WP-9 Track 3 — `no-unsafe-anchor-href` ESLint rule.
 *
 * Preventive rule: flags any future Vue `<a :href="...">` or JSX/TS pattern
 * that hands a non-`safeHref(...)`-wrapped expression to an anchor `href`,
 * `window.open`, or `location.href` assignment.
 *
 * Scope at the time of authoring (WP-9 audit):
 *   - The only `safeHref` consumer in the agent-sidepanel surface is
 *     `MarkdownBlock.vue`, owned by WP-4.
 *   - Every other Vue file under `src/ui/components/{agent,chat}/` was
 *     hand-audited and contains no anchor that interpolates user-controlled
 *     content into `href`. The rule is preventive — it should fire on any
 *     FUTURE unsafe anchor.
 *
 * Patterns flagged (at WARN severity initially):
 *   1. `<a :href="<expr>">` where `<expr>` is anything other than
 *      `safeHref(...)`, a static string literal, or a clearly-safe constant
 *      such as a vue-router `to` binding (only handled in templates with
 *      Vue's `<router-link>`, not raw anchors).
 *   2. Direct DOM assignments: `someAnchor.href = userVar` /
 *      `someAnchor.setAttribute('href', userVar)` outside of `safeHref`.
 *   3. `window.open(userVar)` outside of `safeHref(...)`.
 *   4. `location.href = userVar` / `window.location.href = userVar`.
 *
 * CommonJS so it loads through the same `createRequire` path used by the
 * existing `no-claude-home-reads` rule.
 */

'use strict'

/** Whitelist of expression shapes considered safe for use as an `href`. */
function isSafeHrefSource(node) {
  if (!node) return false
  // Static string literal: `<a href="/about">` is safe.
  if (node.type === 'Literal' && typeof node.value === 'string') return true
  // Template literal with no expressions: still a static string.
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return true
  // `safeHref(...)` call — any function literally named `safeHref` at the
  // call site is accepted. We intentionally do NOT require a specific import
  // path because the rule is preventive and import-path tracking is brittle.
  if (node.type === 'CallExpression') {
    const callee = node.callee
    if (callee.type === 'Identifier' && callee.name === 'safeHref') return true
    if (
      callee.type === 'MemberExpression' &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'safeHref'
    ) {
      return true
    }
  }
  return false
}

/**
 * Vue template visitor: walk the AST emitted by `vue-eslint-parser` and flag
 * `<a :href="...">` / `<a v-bind:href="...">` bindings whose value expression
 * is not on the safe-source allow-list.
 */
function buildTemplateVisitor(context) {
  return {
    "VAttribute[directive=true][key.name.name='bind'][key.argument.name='href']"(node) {
      // The bound element must be an anchor. `node.parent.parent` is the
      // VElement; check its `rawName` for case-insensitive `a`.
      const element = node.parent && node.parent.parent
      if (!element || element.type !== 'VElement') return
      const tagName =
        element.rawName !== undefined ? String(element.rawName).toLowerCase() : ''
      if (tagName !== 'a') return

      const expr = node.value && node.value.expression
      if (expr === null || expr === undefined) return
      if (isSafeHrefSource(expr)) return

      context.report({
        node,
        messageId: 'unsafeAnchorHref',
      })
    },
  }
}

/** JS/TS visitor for direct DOM `.href` / `location.href` / `window.open` use. */
function buildScriptVisitor(context) {
  return {
    AssignmentExpression(node) {
      if (node.operator !== '=') return
      const left = node.left
      if (left.type !== 'MemberExpression') return
      const prop = left.property
      const propName =
        prop.type === 'Identifier'
          ? prop.name
          : prop.type === 'Literal' && typeof prop.value === 'string'
            ? prop.value
            : null
      if (propName !== 'href') return
      // Allow `obj.href = 'static-string'` and `obj.href = safeHref(...)`.
      if (isSafeHrefSource(node.right)) return
      context.report({ node, messageId: 'unsafeHrefAssignment' })
    },
    CallExpression(node) {
      const callee = node.callee
      if (callee.type !== 'MemberExpression') return
      const prop = callee.property
      const propName = prop.type === 'Identifier' ? prop.name : null
      // window.open(<expr>) — flag when first arg isn't a safe source.
      if (propName === 'open') {
        const obj = callee.object
        const objName =
          obj.type === 'Identifier'
            ? obj.name
            : obj.type === 'MemberExpression' && obj.property.type === 'Identifier'
              ? obj.property.name
              : null
        if (objName !== 'window') return
        const firstArg = node.arguments[0]
        if (firstArg === undefined) return
        if (isSafeHrefSource(firstArg)) return
        context.report({ node, messageId: 'unsafeWindowOpen' })
      }
      // anchor.setAttribute('href', <expr>) — flag when value arg isn't safe.
      if (propName === 'setAttribute') {
        const firstArg = node.arguments[0]
        const secondArg = node.arguments[1]
        if (firstArg === undefined || secondArg === undefined) return
        const attrName =
          firstArg.type === 'Literal' && typeof firstArg.value === 'string'
            ? firstArg.value.toLowerCase()
            : null
        if (attrName !== 'href') return
        if (isSafeHrefSource(secondArg)) return
        context.report({ node, messageId: 'unsafeSetAttribute' })
      }
    },
  }
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid passing user-controllable expressions to anchor href / ' +
        'window.open / location.href. Wrap with safeHref() instead ' +
        '(WP-9 Track 3, NFR-ASM-005 link-surface hardening).',
    },
    schema: [],
    messages: {
      unsafeAnchorHref:
        'Anchor `:href` binding must use `safeHref(...)` or a static string. ' +
        'Raw user-controllable expressions enable javascript:/data: URL XSS.',
      unsafeHrefAssignment:
        'Direct `.href` assignment must use `safeHref(...)` or a static string ' +
        '(WP-9 Track 3 link-surface hardening).',
      unsafeWindowOpen:
        '`window.open(...)` first argument must be `safeHref(...)` or a static ' +
        'string (WP-9 Track 3 link-surface hardening).',
      unsafeSetAttribute:
        '`setAttribute(\'href\', ...)` value must be `safeHref(...)` or a static ' +
        'string (WP-9 Track 3 link-surface hardening).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode()
    const parserServices = sourceCode.parserServices || {}

    // Vue template visitor is only available when the file was parsed by
    // vue-eslint-parser. Combine via `defineTemplateBodyVisitor` when present;
    // otherwise return the script-only visitor.
    if (typeof parserServices.defineTemplateBodyVisitor === 'function') {
      return parserServices.defineTemplateBodyVisitor(
        buildTemplateVisitor(context),
        buildScriptVisitor(context),
      )
    }
    return buildScriptVisitor(context)
  },
}
