import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jestPlugin from 'eslint-plugin-jest';
import obsidianmd from 'eslint-plugin-obsidianmd';
import { DEFAULT_ACRONYMS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/acronyms.js';
import { DEFAULT_BRANDS } from 'eslint-plugin-obsidianmd/dist/lib/rules/ui/brands.js';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const jestRecommended = jestPlugin.configs['flat/recommended'];
const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));
// Staged at 'warn' until the backlog hit zero; promoted 2026-06-10 per the
// ratchet policy in docs/build-ci/quality-gates.md § "Lint severity policy".
const obsidianRuleSeverity = 'error';

// Src-only safety gate, shared between `src/**/*.ts` and SFC `<script>` blocks
// in `src/**/*.vue`. Type-aware rules (no-implied-eval) live in the .ts block
// only — vue-tsc is the type gate for SFCs.
const srcSafetyRules = {
  'no-console': 'error',
  // Mirror the Obsidian marketplace validator: the Function constructor /
  // implied eval is banned everywhere except the user-tool sandbox in
  // SpecoratorToolRegistry, which carries a justified inline disable.
  // Scoped to src only — no-implied-eval is type-aware and would crash on
  // untyped test fixtures.
  'no-new-func': 'error',
  // Q-1 (Notice i18n sweep). Block hardcoded English in `new Notice()`:
  // every user-visible notice must go through `t('key')` or `t('key', params)`
  // so the 10 supported locales can override it. Identifier pass-throughs
  // like `new Notice(nameError)` stay allowed — those carry strings that
  // helper functions return (see docs/issues/translate-validator-helper-strings.md
  // for the planned next step that translates those helpers).
  'no-restricted-syntax': [
    'error',
    {
      selector:
        'NewExpression[callee.name="Notice"][arguments.0.type="Literal"]',
      message:
        "Hardcoded English in `new Notice('...')` is not allowed. Use `t('key.path')` instead, adding the canonical string to src/i18n/locales/en.json. See docs/reviews/2026-06-02-codebase-review-and-improvement-plan.md `Subspace policy` for naming.",
    },
    {
      selector:
        'NewExpression[callee.name="Notice"][arguments.0.type="TemplateLiteral"]',
      message:
        "Hardcoded English in `new Notice(`...`)` is not allowed. Use `t('key.path', { param: value })` instead, adding the canonical string with `{param}` placeholders to src/i18n/locales/en.json.",
    },
    // OBS-B (Obsidian security review). Raw HTML injection is the #1 risk
    // for a streaming chat UI: any innerHTML/outerHTML/insertAdjacentHTML
    // fed by agent/markdown/user content is an XSS vector. Build DOM with
    // createEl/createDiv/createSpan/setText/.empty(), or route untrusted
    // content through MarkdownRenderer. If a site is provably static, use a
    // narrow `// eslint-disable-next-line no-restricted-syntax` with a
    // justification comment rather than disabling this rule globally.
    {
      selector:
        'AssignmentExpression > MemberExpression[property.name="innerHTML"]',
      message:
        'Assigning to innerHTML is banned (XSS risk). Use createEl/createDiv/createSpan/setText/.empty(), or MarkdownRenderer for markdown. See docs/issues/audit-innerhtml-rendering.md (OBS-B).',
    },
    {
      selector:
        'AssignmentExpression > MemberExpression[property.name="outerHTML"]',
      message:
        'Assigning to outerHTML is banned (XSS risk). Use createEl/createDiv/createSpan/setText/.empty(), or MarkdownRenderer for markdown. See docs/issues/audit-innerhtml-rendering.md (OBS-B).',
    },
    {
      selector: 'CallExpression[callee.property.name="insertAdjacentHTML"]',
      message:
        'insertAdjacentHTML is banned (XSS risk). Use createEl/createDiv/createSpan/setText, or MarkdownRenderer for markdown. See docs/issues/audit-innerhtml-rendering.md (OBS-B).',
    },
    // obsidianmd/prefer-create-el shorthand. The marketplace validator flags
    // `createEl('div'|'span', …)` and wants the `createDiv()`/`createSpan()`
    // shorthand; the installed eslint-plugin-obsidianmd@0.3.0 does not export
    // that rule, so guard it here (global + instance forms) so a regression
    // fails `npm run lint` locally instead of resurfacing at submission.
    {
      selector:
        'CallExpression[callee.name="createEl"][arguments.0.value=/^(div|span)$/]',
      message:
        "Use createDiv()/createSpan() instead of createEl('div'|'span') — the obsidianmd/prefer-create-el shorthand the Obsidian marketplace validator flags.",
    },
    {
      selector:
        'CallExpression[callee.property.name="createEl"][arguments.0.value=/^(div|span)$/]',
      message:
        "Use .createDiv()/.createSpan() instead of .createEl('div'|'span') — the obsidianmd/prefer-create-el shorthand the Obsidian marketplace validator flags.",
    },
  ],
};

const stagedObsidianRules = {
  'obsidianmd/commands/no-command-in-command-id': obsidianRuleSeverity,
  'obsidianmd/commands/no-command-in-command-name': obsidianRuleSeverity,
  'obsidianmd/commands/no-default-hotkeys': obsidianRuleSeverity,
  'obsidianmd/commands/no-plugin-id-in-command-id': obsidianRuleSeverity,
  'obsidianmd/commands/no-plugin-name-in-command-name': obsidianRuleSeverity,
  'obsidianmd/detach-leaves': obsidianRuleSeverity,
  'obsidianmd/editor-drop-paste': obsidianRuleSeverity,
  'obsidianmd/hardcoded-config-path': obsidianRuleSeverity,
  'obsidianmd/no-forbidden-elements': obsidianRuleSeverity,
  'obsidianmd/no-global-this': obsidianRuleSeverity,
  'obsidianmd/no-plugin-as-component': obsidianRuleSeverity,
  'obsidianmd/no-sample-code': obsidianRuleSeverity,
  'obsidianmd/no-static-styles-assignment': obsidianRuleSeverity,
  'obsidianmd/no-tfile-tfolder-cast': obsidianRuleSeverity,
  'obsidianmd/no-unsupported-api': obsidianRuleSeverity,
  'obsidianmd/no-view-references-in-plugin': obsidianRuleSeverity,
  'obsidianmd/object-assign': obsidianRuleSeverity,
  'obsidianmd/platform': obsidianRuleSeverity,
  'obsidianmd/prefer-abstract-input-suggest': obsidianRuleSeverity,
  'obsidianmd/prefer-active-doc': obsidianRuleSeverity,
  'obsidianmd/prefer-file-manager-trash-file': obsidianRuleSeverity,
  'obsidianmd/prefer-get-language': obsidianRuleSeverity,
  'obsidianmd/prefer-instanceof': obsidianRuleSeverity,
  'obsidianmd/prefer-window-timers': obsidianRuleSeverity,
  'obsidianmd/regex-lookbehind': obsidianRuleSeverity,
  'obsidianmd/sample-names': obsidianRuleSeverity,
  'obsidianmd/settings-tab/no-manual-html-headings': obsidianRuleSeverity,
  'obsidianmd/settings-tab/no-problematic-settings-headings': obsidianRuleSeverity,
  'obsidianmd/ui/sentence-case': [
    obsidianRuleSeverity,
    {
      ignoreWords: ['Specorator', 'Codex', 'OpenCode', 'WSL'],
      brands: [
        ...DEFAULT_BRANDS,
        'Specorator',
        'Codex',
        'OpenCode',
        'Claude Code',
        'Agent Board',
        'Quick Actions',
      ],
      acronyms: [...DEFAULT_ACRONYMS, 'TOML', 'WSL'],
      ignoreRegex: ['\\.(?:claude|codex|cursor|opencode)/'],
      enforceCamelCaseLower: true,
    },
  ],
  'obsidianmd/vault/iterate': obsidianRuleSeverity,
};

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'main.js'],
  },
  js.configs.recommended,
  {
    files: ['esbuild.config.mjs', 'scripts/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        module: 'readonly',
        process: 'readonly',
      },
    },
  },
  ...tseslint.configs['flat/recommended'],
  {
    // Vue SFC lint. flat/recommended = base + essential (errors) +
    // strongly-recommended + recommended (warnings — the tracked, non-blocking
    // backlog tier per docs/build-ci/quality-gates.md § lint severity policy).
    files: ['**/*.vue'],
    // Scoped via extends: three of flat/recommended's sub-configs ship with no
    // `files` restriction and would otherwise resolve 116 vue/* rules against
    // every .ts file (pure no-op cost, ~10% lint wall-clock).
    extends: [pluginVue.configs['flat/recommended']],
    languageOptions: {
      parserOptions: {
        // vue-eslint-parser stays the outer parser (set by the configs above);
        // the TS parser handles <script lang="ts"> blocks.
        parser: tsParser,
        extraFileExtensions: ['.vue'],
        sourceType: 'module',
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // The Vue analogue of the innerHTML ban below (OBS-B): v-html sets
      // el.innerHTML under the hood. Render markdown/agent content through
      // Obsidian's MarkdownRenderer against a template ref instead.
      'vue/no-v-html': 'error',
      // vue-tsc owns undefined-identifier checking for <script lang="ts"> —
      // core no-undef is redundant there and false-positives on browser
      // globals (window/setTimeout), mirroring typescript-eslint's stance
      // that no-undef is off for type-checked code.
      'no-undef': 'off',
      // Mirror the repo's non-type-aware TS guardrails onto <script setup>
      // blocks (same options as the src/tests .ts block above). Type-aware
      // rules stay off SFC fast lint — vue-tsc is that gate.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'none', ignoreRestSiblings: true },
      ],
      // Guardrail (Q-3): src reached zero explicit `any` (tests keep their own
      // override below), so the rule is promoted to block regressions. A
      // genuinely unavoidable browser/SDK-shim `any` takes a narrow
      // eslint-disable-next-line with a justification comment.
      '@typescript-eslint/no-explicit-any': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      ...srcSafetyRules,
      // Type-aware, so it stays off the .vue fast lint (vue-tsc is that gate)
      // and off untyped test fixtures, which it would crash on.
      '@typescript-eslint/no-implied-eval': 'error',
    },
  },
  {
    // SFC <script> parity with the src/**/*.ts safety gate. Type-aware rules
    // (no-implied-eval) intentionally excluded — vue-tsc is the type gate.
    files: ['src/**/*.vue'],
    rules: srcSafetyRules,
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir,
      },
    },
    plugins: {
      obsidianmd,
    },
    rules: stagedObsidianRules,
  },
  {
    // Directive-comment discipline mirrors the Obsidian marketplace validator,
    // which lints plugin `src/` only. Three findings from the 2026-06-26 review
    // (docs/tech-debt/2026-06-26-obsidian-marketplace-review.md) are codified
    // here so a regression fails `npm run lint` locally instead of surfacing at
    // submission: every disable must justify itself, the security/UI rules below
    // may not be silenced inline, and stale disables are an error (not warn).
    // SFC <script> blocks in src carry the same disable-directive rules.
    files: ['src/**/*.ts', 'src/**/*.vue'],
    plugins: {
      '@eslint-community/eslint-comments': eslintComments,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: [] },
      ],
      '@eslint-community/eslint-comments/no-restricted-disable': [
        'error',
        '@typescript-eslint/no-explicit-any',
        'obsidianmd/ui/sentence-case',
      ],
    },
  },
  {
    // Type-aware rules promoted to `error` after the 2026-06-26 marketplace
    // review (docs/tech-debt/2026-06-26-obsidian-marketplace-review.md). Each
    // backlog was driven to zero before promotion, per the ratchet policy in
    // docs/build-ci/quality-gates.md § "Lint severity policy". These mirror the
    // marketplace validator's type-aware warnings so a regression fails
    // `npm run lint` locally instead of resurfacing at submission.
    // NOTE: `no-unnecessary-type-assertion` is intentionally NOT enforced — it
    // false-positives on load-bearing DOM casts (`querySelector(...) as
    // HTMLElement`) under typescript@6 + typescript-eslint@8, disagreeing with
    // tsc. The one-time cleanup of its genuine hits was applied manually.
    files: ['src/**/*.ts'],
    rules: {
      // Re-enabled after the part-3 marketplace review: the part-1 false
      // positives were load-bearing DOM `as` casts, now rewritten as generic
      // type parameters (`querySelector<HTMLElement>(...)`). The lone remaining
      // exception (SpecoratorView's bound-load cast) carries a justified inline
      // disable — our newer TS lib types `Function.prototype.bind` precisely, so
      // it reads the cast as redundant, while the validator's older lib needs it.
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/unbound-method': 'error',
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
  {
    files: ['src/**/*.ts'],
    // Function-health rules, all promoted to `error` per the ratchet policy
    // (docs/build-ci/quality-gates.md § "Lint severity policy"):
    // `max-params`/`max-depth` on 2026-06-10, then `complexity`/
    // `max-lines-per-function` on 2026-06-13 once their backlog reached zero
    // (quality campaign run 7). The LOC guard already caps whole files at
    // 500 LOC; these add the function-level signal file-level LOC can't see.
    rules: {
      'max-lines-per-function': [
        'error',
        { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      complexity: ['error', { max: 25 }],
      'max-params': ['error', { max: 6 }],
      'max-depth': ['error', { max: 5 }],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: [
      // Provider-internal files own their own internals.
      'src/providers/*/**/*.ts',
      // The bootstrap aggregator(s) that call ProviderRegistry.register /
      // ProviderWorkspaceRegistry.register are the one sanctioned outside
      // importer of `src/providers/<id>/registration` and workspace modules.
      'src/providers/index.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/providers/claude/**',
                '**/providers/codex/**',
                '**/providers/cursor/**',
                '**/providers/opencode/**',
              ],
              message:
                'Provider internals are reachable only through ProviderRegistry / ProviderWorkspaceRegistry. Add a method to ProviderRegistration / ProviderChatUIConfig / ProviderSettingsReconciler instead of importing from src/providers/<id>/. See ADR 0001 § Boundary rule.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['tests/**/*.ts'],
    ...jestRecommended,
    rules: {
      ...jestRecommended.rules,
      // Tests legitimately use `any` for mocking provider/SDK shapes; the
      // near-zero-any guardrail (Q-3) only targets production `src/`, so keep
      // this off here to avoid thousands of low-signal test warnings.
      '@typescript-eslint/no-explicit-any': 'off',
      'jest/no-standalone-expect': [
        'error',
        { additionalTestBlockFunctions: ['itPosix', 'itWin32'] },
      ],
      // Promoted warn -> error 2026-06-13 (quality campaign run 13). CI does not
      // pass `--max-warnings`, so any `warn` rule is effectively unenforced;
      // these jest rules all had zero offenders, so promoting them makes the lint
      // gate genuinely all-error (no warn tier in use). `jest/expect-expect` was
      // the staged-backlog rule; `no-disabled-tests` / `no-commented-out-tests`
      // ship at `warn` from the jest-recommended preset and are promoted with it
      // so committed skipped or commented-out tests also block CI.
      'jest/expect-expect': [
        'error',
        {
          // Helper functions that wrap `expect()` for shared test scaffolding.
          assertFunctionNames: ['expect', 'assertTabRendersRegistry', 'mountSettingsShell'],
        },
      ],
      'jest/no-disabled-tests': 'error',
      'jest/no-commented-out-tests': 'error',
    },
  },
]);
