/**
 * WP-9 Track 3 — Tests for `no-unsafe-anchor-href`.
 *
 * Two surfaces:
 *   - Plain JS/TS: covered by ESLint's `RuleTester` against the default
 *     parser.
 *   - Vue templates: validated with the standalone `Linter` API and
 *     `vue-eslint-parser` so we exercise the same visitor wiring as the
 *     project lint pass.
 */

'use strict'

const { RuleTester, Linter } = require('eslint')
const rule = require('../no-unsafe-anchor-href.cjs')

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
})

ruleTester.run('no-unsafe-anchor-href (script)', rule, {
  valid: [
    // Static href assignments.
    'anchor.href = "/about"',
    'anchor.href = `static`',
    // safeHref-wrapped values.
    'anchor.href = safeHref(userVar)',
    'anchor.href = utils.safeHref(userVar)',
    // window.open with static URL.
    'window.open("https://example.com")',
    'window.open(safeHref(userVar))',
    // setAttribute on something other than href.
    'el.setAttribute("data-id", userVar)',
    // setAttribute with safeHref.
    'el.setAttribute("href", safeHref(userVar))',
    // Unrelated assignments.
    'obj.value = userVar',
    // Unrelated function calls.
    'someOtherFn(userVar)',
  ],
  invalid: [
    {
      code: 'anchor.href = userVar',
      errors: [{ messageId: 'unsafeHrefAssignment' }],
    },
    {
      code: 'anchor.href = `prefix${userVar}`',
      errors: [{ messageId: 'unsafeHrefAssignment' }],
    },
    {
      code: 'window.open(userVar)',
      errors: [{ messageId: 'unsafeWindowOpen' }],
    },
    {
      code: 'window.open(`${userVar}`)',
      errors: [{ messageId: 'unsafeWindowOpen' }],
    },
    {
      code: 'el.setAttribute("href", userVar)',
      errors: [{ messageId: 'unsafeSetAttribute' }],
    },
    {
      code: 'el.setAttribute("HREF", userVar)',
      errors: [{ messageId: 'unsafeSetAttribute' }],
    },
  ],
})

// ── Vue template surface ───────────────────────────────────────────────────
const linter = new Linter()

function lintVue(template) {
  return linter.verify(
    template,
    [
      {
        files: ['**/*.vue'],
        plugins: { local: { rules: { 'no-unsafe-anchor-href': rule } } },
        rules: { 'local/no-unsafe-anchor-href': 'error' },
        languageOptions: {
          parser: require('vue-eslint-parser'),
          ecmaVersion: 2022,
          sourceType: 'module',
        },
      },
    ],
    { filename: 'sample.vue' },
  )
}

const vueValidSafe = `
<template>
  <a :href="safeHref(userVar)">click</a>
</template>
`
const vueValidStatic = `
<template>
  <a :href="'/about'">click</a>
</template>
`
const vueValidNonAnchor = `
<template>
  <div :href="userVar">not an anchor</div>
</template>
`
const vueInvalid = `
<template>
  <a :href="userVar">click</a>
</template>
`
const vueInvalidVBind = `
<template>
  <a v-bind:href="userVar">click</a>
</template>
`

const safeRes = lintVue(vueValidSafe)
if (safeRes.length !== 0) {
  throw new Error(
    'no-unsafe-anchor-href Vue safe case: expected zero violations, got ' +
      JSON.stringify(safeRes),
  )
}

const staticRes = lintVue(vueValidStatic)
if (staticRes.length !== 0) {
  throw new Error(
    'no-unsafe-anchor-href Vue static case: expected zero violations, got ' +
      JSON.stringify(staticRes),
  )
}

const nonAnchorRes = lintVue(vueValidNonAnchor)
if (nonAnchorRes.length !== 0) {
  throw new Error(
    'no-unsafe-anchor-href Vue non-anchor case: expected zero violations, got ' +
      JSON.stringify(nonAnchorRes),
  )
}

const invalidRes = lintVue(vueInvalid)
if (
  invalidRes.length !== 1 ||
  invalidRes[0].messageId !== 'unsafeAnchorHref'
) {
  throw new Error(
    'no-unsafe-anchor-href Vue unsafe case: expected one unsafeAnchorHref violation, got ' +
      JSON.stringify(invalidRes),
  )
}

const invalidVBindRes = lintVue(vueInvalidVBind)
if (
  invalidVBindRes.length !== 1 ||
  invalidVBindRes[0].messageId !== 'unsafeAnchorHref'
) {
  throw new Error(
    'no-unsafe-anchor-href Vue v-bind unsafe case: expected one unsafeAnchorHref violation, got ' +
      JSON.stringify(invalidVBindRes),
  )
}

// eslint-disable-next-line no-console
console.log(
  'eslint-rules/no-unsafe-anchor-href: all RuleTester cases + Vue template assertions passed.',
)
