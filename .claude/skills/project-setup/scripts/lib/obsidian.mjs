// scripts/lib/obsidian.mjs — Obsidian-plugin scaffold planners.
//
// Activated by `options.obsidian` (see options.mjs sanitizeObsidian). Scaffolds a
// NEW plugin (greenfield only): manifest/versions, esbuild build with SFC-style
// merge and dev vault deploy, an optional Vue 3 + Pinia + vue-router island view,
// a Vitest lane with an `obsidian` test double, obsidianmd/type-aware ESLint,
// Prettier, the CSS !important ratchet, an artifact smoke gate, version sync, and
// a tag-push release workflow. Everything user-editable is skip-if-exists; the
// engine-owned build/ratchet scripts under scripts/ and the config files are
// overwrite-backup, so a re-apply picks up template updates and never clobbers the
// user's own source.
import { CI_PM, dep, engineConfigMode, notice } from './harness.mjs';
import { OBSIDIAN_NODE_ENGINES } from './options.mjs';
import { runPrefix, safePackageManager } from './packageManager.mjs';
import { loadTemplate, renderTemplate } from './templates.mjs';

const PM_INSTALL = { npm: 'npm install', pnpm: 'pnpm install', yarn: 'yarn install', bun: 'bun install' };

const INITIAL_VERSION = '0.1.0';

// Encode a string as a JS literal the way prettier (singleQuote: true) would
// print it, so generated sources pass format:check without a rewrite: single
// quotes unless the value itself contains one (then prettier keeps double).
function jsString(value) {
  const v = String(value);
  if (v.includes("'")) return JSON.stringify(v);
  return `'${v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`;
}

// "demo notes" -> "DemoNotes". The id/name are sanitized in options.mjs, but a
// class name must additionally start with a letter and be identifier-safe.
function pascal(value) {
  const words = String(value).replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const joined = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  const safe = joined.replace(/^[0-9]+/, '');
  return safe || 'My';
}

// Identifiers a generated class must never equal:
//  - the obsidianmd sample-names rule bans MyPlugin/MyPluginSettings/
//    SampleSettingTab/SampleModal (the default id "my-plugin" and a name of
//    "sample" pascal back into these), so shipping them fails `lint`.
//  - Obsidian imports the generated classes would SHADOW: a name of "Plugin"
//    (or "123 Plugin", stripped to empty base) yields `class Plugin extends
//    Plugin`, and "Plugin Plugin" yields a `PluginSettingTab` clash — both fail
//    `typecheck` on a duplicate identifier before any user edit.
const RESERVED_NAMES = new Set([
  'MyPlugin', 'MyPluginSettings', 'SampleSettingTab', 'SampleModal',
  'Plugin', 'PluginSettingTab',
]);

function classNames(o) {
  const base = pascal(o.name).replace(/Plugin$/, '');
  const derive = (b) => ({ pluginClass: `${b}Plugin`, settingsType: `${b}Settings`, settingsTab: `${b}SettingTab` });
  let names = derive(base);
  // Disambiguate rather than emit reserved code. One pass suffices: no "…App…"
  // identifier is in the reserved set (an empty base collides on "Plugin", so it
  // becomes "App" → AppPlugin/AppSettings/AppSettingTab).
  if (Object.values(names).some((n) => RESERVED_NAMES.has(n))) names = derive(`${base}App`);
  return names;
}

const write = (path, content, mode = 'skip-if-exists') => ({ type: 'writeFile', path, mode, content });

// Emit named import members already sorted the way simple-import-sort would, so
// the generated source passes `lint` (CI runs it WITHOUT --fix). Matches the
// plugin's comparator exactly: an en collator at "base" sensitivity + numeric,
// with a raw-string tiebreak. Needed because one member is the plugin-named
// SettingTab class, whose sort position varies with the plugin name.
const IMPORT_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const sortImportMembers = (...members) =>
  members.sort((a, b) => IMPORT_COLLATOR.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0)).join(', ');

// The build/fallow/lint source root and entry. Obsidian mode scaffolds a NEW
// plugin (greenfield only), so both are fixed constants — no detection.
const SRC_ROOT = 'src';
export function obsidianEntry() {
  return 'src/main.ts';
}

function planManifest(o, version) {
  const authorUrlLine = o.authorUrl ? `\n  "authorUrl": ${JSON.stringify(o.authorUrl)},` : '';
  const manifest = renderTemplate(loadTemplate('obsidian/manifest.json.tmpl'), {
    idJson: JSON.stringify(o.id),
    nameJson: JSON.stringify(o.name),
    version,
    minAppJson: JSON.stringify(o.minAppVersion),
    descriptionJson: JSON.stringify(o.description),
    authorJson: JSON.stringify(o.author),
    authorUrlLine,
    isDesktopOnly: String(!o.mobile),
  });
  return [
    write('manifest.json', manifest),
    // manifest-beta.json mirrors manifest.json for BRAT beta installs; sync-version
    // keeps it in lockstep (see docs/publishing.md for running a beta channel ahead
    // of stable). A fresh scaffold mirrors it byte-for-byte at creation.
    write('manifest-beta.json', manifest),
    { type: 'writeFile', path: 'versions.json', mode: 'skip-if-exists', content: `{\n  "${version}": "${o.minAppVersion}"\n}\n` },
  ];
}

function planBuild(options) {
  const o = options.obsidian;
  // Desktop-only plugins may import node builtins and electron (Obsidian ships
  // Electron), so those are externals. A mobile-ready plugin must NOT mark them
  // external: an accidental `import 'fs'` or `import 'electron'` then fails the
  // build loudly instead of crashing on iOS/Android at runtime.
  const content = renderTemplate(loadTemplate('obsidian/esbuild.config.mjs.tmpl'), {
    entry: './src/main.ts',
    nodeModuleImport: o.mobile ? '' : "import { builtinModules } from 'node:module';\n",
    nodeExternals: o.mobile
      ? ''
      : "    'electron',\n    ...builtinModules,\n    ...builtinModules.map((m) => `node:${m}`),\n",
    vueImport: o.vue ? "import VuePlugin from 'unplugin-vue/esbuild';\n" : '',
    vuePluginEntry: o.vue ? 'VuePlugin({ isProduction: prod, sourceMap: false }), ' : '',
    vueDefines: o.vue
      ? "  define: {\n    // Vue compile-time flags: Composition API only, no devtools/SSR branches.\n    __VUE_OPTIONS_API__: 'false',\n    __VUE_PROD_DEVTOOLS__: 'false',\n    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',\n    ...(prod ? { 'process.env.NODE_ENV': '\"production\"' } : {}),\n  },\n"
      : '',
  });
  // Engine-owned: overwrite-backup so template updates (e.g. mobile externals)
  // reach a re-applied plugin; apply() no-ops when the content already matches.
  return [
    write('esbuild.config.mjs', content, 'overwrite-backup'),
    write('scripts/sync-version.mjs', loadTemplate('obsidian/sync-version.mjs.tmpl'), 'overwrite-backup'),
  ];
}

function planSources(options) {
  const o = options.obsidian;
  // The base stylesheet is harness, not app: the build reads src/styles.css and
  // regenerates styles.css. skip-if-exists keeps the user's edits on re-apply.
  const stylesheet = write(
    'src/styles.css',
    renderTemplate(loadTemplate('obsidian/src/styles.css.tmpl'), { id: o.id, name: o.name }),
  );
  const names = classNames(o);
  const shared = {
    pluginClass: names.pluginClass,
    settingsType: names.settingsType,
    settingsTab: names.settingsTab,
    id: o.id,
    nameLiteral: jsString(o.name),
  };
  // main.ts is orchestration-only: the vue variant adds the view registration
  // module; command wiring lives in commands.ts for both.
  const mainVars = {
    ...shared,
    settingsValueImports: sortImportMembers('DEFAULT_SETTINGS', 'migrateSettings', names.settingsTab),
    viewImport: o.vue ? "import { registerViews } from './ui/registerViews';\n" : '',
    // Eight-space indent: this line sits inside onload's errors.run() callback.
    viewRegistration: o.vue ? '        registerViews(this);\n' : '',
  };
  // The open-view command is vue-only; it reveals the island view.
  const commandVars = {
    ...shared,
    activateViewImport: o.vue ? "import { activateView } from './ui/registerViews';\n" : '',
    openViewCommand: o.vue
      ? "\n  // callback — reveal the plugin view (errors.wrap surfaces a failure as a notice).\n  plugin.commands.addSimple(\n    'open-view',\n    'Open view',\n    plugin.errors.wrap('open the view', () => activateView(plugin)),\n  );\n"
      : '',
  };
  const actions = [
    stylesheet,
    write('src/main.ts', renderTemplate(loadTemplate('obsidian/src/main.ts.tmpl'), mainVars)),
    write('src/settings.ts', renderTemplate(loadTemplate('obsidian/src/settings.ts.tmpl'), shared)),
    write('src/commands.ts', renderTemplate(loadTemplate('obsidian/src/commands.ts.tmpl'), commandVars)),
    // i18n: all user-facing notice/modal text resolves through t() (lint-enforced).
    write('src/i18n/i18n.ts', loadTemplate('obsidian/src/i18n/i18n.ts.tmpl')),
    write('src/i18n/en.json', loadTemplate('obsidian/src/i18n/en.json.tmpl')),
    // Core services: provider-neutral, UI-free, unit-tested — the seam every
    // feature builds on (see the generated AGENTS.md).
    write('src/core/commands/CommandsService.ts', renderTemplate(loadTemplate('obsidian/src/core/commands/CommandsService.ts.tmpl'), shared)),
    write('src/core/events/EventBus.ts', loadTemplate('obsidian/src/core/events/EventBus.ts.tmpl')),
    write('src/core/events/AppEvents.ts', renderTemplate(loadTemplate('obsidian/src/core/events/AppEvents.ts.tmpl'), shared)),
    write('src/core/logging/Logger.ts', loadTemplate('obsidian/src/core/logging/Logger.ts.tmpl')),
    write('src/core/settings/SettingsService.ts', loadTemplate('obsidian/src/core/settings/SettingsService.ts.tmpl')),
    write('src/core/notices/NoticeService.ts', loadTemplate('obsidian/src/core/notices/NoticeService.ts.tmpl')),
    write('src/core/errors/ErrorService.ts', loadTemplate('obsidian/src/core/errors/ErrorService.ts.tmpl')),
    write('src/core/modals/ModalService.ts', loadTemplate('obsidian/src/core/modals/ModalService.ts.tmpl')),
    write('src/core/vault/VaultService.ts', loadTemplate('obsidian/src/core/vault/VaultService.ts.tmpl')),
    write('src/core/http/RequestService.ts', loadTemplate('obsidian/src/core/http/RequestService.ts.tmpl')),
    // Ribbon, status-bar, menu, timer, and vault-event seams over the matching
    // Obsidian plugin/app APIs (addRibbonIcon, addStatusBarItem, workspace menus,
    // registerInterval, vault.on).
    write('src/core/ribbon/RibbonService.ts', renderTemplate(loadTemplate('obsidian/src/core/ribbon/RibbonService.ts.tmpl'), shared)),
    write('src/core/statusbar/StatusBarService.ts', renderTemplate(loadTemplate('obsidian/src/core/statusbar/StatusBarService.ts.tmpl'), shared)),
    write('src/core/menus/MenuService.ts', renderTemplate(loadTemplate('obsidian/src/core/menus/MenuService.ts.tmpl'), shared)),
    write('src/core/timers/TimersService.ts', renderTemplate(loadTemplate('obsidian/src/core/timers/TimersService.ts.tmpl'), shared)),
    write('src/core/vaultEvents/VaultEventsService.ts', renderTemplate(loadTemplate('obsidian/src/core/vaultEvents/VaultEventsService.ts.tmpl'), shared)),
    // The status-bar item wires the event bus from the UI layer in both variants.
    write('src/ui/statusBar.ts', renderTemplate(loadTemplate('obsidian/src/ui/statusBar.ts.tmpl'), shared)),
    // Canonical Obsidian UI patterns (both variants): a ribbon icon opening a
    // SuggestModal picker + editor/file context-menu items, and a vault-activity
    // demo that debounces edit reactions and runs a periodic heartbeat.
    write('src/ui/GreetingSuggestModal.ts', loadTemplate('obsidian/src/ui/GreetingSuggestModal.ts.tmpl')),
    write('src/ui/registerExtras.ts', renderTemplate(loadTemplate('obsidian/src/ui/registerExtras.ts.tmpl'), shared)),
    write('src/ui/registerActivity.ts', renderTemplate(loadTemplate('obsidian/src/ui/registerActivity.ts.tmpl'), shared)),
    // Editor-surface samples (both variants): `:emoji` autocomplete (EditorSuggest),
    // a fenced-block renderer (MarkdownCodeBlockProcessor), a TODO/FIXME highlighter
    // (CodeMirror 6 view plugin), and a frontmatter-stamp command (VaultService).
    write('src/ui/EmojiSuggest.ts', renderTemplate(loadTemplate('obsidian/src/ui/EmojiSuggest.ts.tmpl'), shared)),
    write('src/ui/codeBlock.ts', renderTemplate(loadTemplate('obsidian/src/ui/codeBlock.ts.tmpl'), shared)),
    write('src/ui/editorHighlight.ts', renderTemplate(loadTemplate('obsidian/src/ui/editorHighlight.ts.tmpl'), shared)),
    write('src/ui/registerEditorFeatures.ts', renderTemplate(loadTemplate('obsidian/src/ui/registerEditorFeatures.ts.tmpl'), shared)),
  ];
  if (o.vue) {
    actions.push(
      write('src/vue-shims.d.ts', loadTemplate('obsidian/src/vue-shims.d.ts.tmpl')),
      write('src/ui/registerViews.ts', renderTemplate(loadTemplate('obsidian/src/ui/registerViews.ts.tmpl'), shared)),
      write('src/ui/VueView.ts', renderTemplate(loadTemplate('obsidian/src/ui/VueView.ts.tmpl'), shared)),
      write('src/ui/vue/App.vue', loadTemplate('obsidian/src/ui/vue/App.vue.tmpl')),
      write('src/ui/vue/router.ts', loadTemplate('obsidian/src/ui/vue/router.ts.tmpl')),
      write('src/ui/vue/pinia.ts', loadTemplate('obsidian/src/ui/vue/pinia.ts.tmpl')),
      write('src/ui/vue/keys.ts', renderTemplate(loadTemplate('obsidian/src/ui/vue/keys.ts.tmpl'), shared)),
      write('src/ui/vue/stores/counter.ts', loadTemplate('obsidian/src/ui/vue/stores/counter.ts.tmpl')),
      write('src/ui/vue/composables/useGreeting.ts', renderTemplate(loadTemplate('obsidian/src/ui/vue/composables/useGreeting.ts.tmpl'), shared)),
      write('src/ui/vue/pages/HomePage.vue', loadTemplate('obsidian/src/ui/vue/pages/HomePage.vue.tmpl')),
      write('src/ui/vue/pages/AboutPage.vue', loadTemplate('obsidian/src/ui/vue/pages/AboutPage.vue.tmpl')),
    );
  }
  return actions;
}

function planTsconfig(options) {
  const o = options.obsidian;
  const vueIncludes = o.vue ? ', "src/**/*.vue", "tests/**/*.vue"' : '';
  const content = renderTemplate(loadTemplate('obsidian/tsconfig.json.tmpl'), { vueIncludes, entryInclude: '' });
  // The scaffold owns the tsconfig: the sample app + tests import through the
  // "@/*" path alias and need the src/tests includes, so a stray default tsconfig
  // (e.g. a `tsc --init` "{}") must be replaced or typecheck fails day one.
  // overwrite-backup keeps a backup; a fresh repo has none, and re-apply no-ops on
  // matching content.
  return [write('tsconfig.json', content, 'overwrite-backup')];
}

function planObsidianEslint(options) {
  if (!options.guardrails?.eslintSeverityStaging) return [];
  const o = options.obsidian;
  // The safety + mobile-import bans cover the scaffold's src/** root. JS/JSX are
  // included so a source file a user later adds is linted too; the config's global
  // ignores drop node_modules/scripts/*.mjs configs, so *.{exts} is safe.
  const exts = o.vue ? 'ts,tsx,mts,cts,vue,js,jsx,mjs,cjs' : 'ts,tsx,mts,cts,js,jsx,mjs,cjs';
  const vueSrcFiles = `'${SRC_ROOT}/**/*.{${exts}}'`;
  const mobileBlock = o.mobile
    ? renderTemplate(loadTemplate('obsidian/eslint-mobile-block.tmpl'), { vueSrcFiles })
    : '';
  const content = renderTemplate(loadTemplate('obsidian/eslint.config.mjs.tmpl'), {
    vueImports: o.vue ? "import pluginVue from 'eslint-plugin-vue';\n" : '',
    vueConfigs: o.vue ? renderTemplate(loadTemplate('obsidian/eslint-vue-block.tmpl'), {}) : '',
    vueSrcFiles,
    mobileBlock,
    brandLiteral: jsString(o.name),
  });
  const deps = [
    // @eslint/json: eslint-plugin-obsidianmd declares it as an exact peer; provide
    // it at the root so a strict-peer layout (Yarn PnP) resolves the config.
    'eslint', '@eslint/js', '@eslint/json', 'typescript-eslint', 'eslint-plugin-obsidianmd',
    'eslint-plugin-simple-import-sort', '@eslint-community/eslint-plugin-eslint-comments',
    '@vitest/eslint-plugin', 'eslint-config-prettier',
  ];
  if (o.vue) deps.push('eslint-plugin-vue', 'vue-eslint-parser');
  return [
    write('eslint.config.mjs', content, 'overwrite-backup'),
    {
      type: 'mergeJson',
      path: 'package.json',
      patch: {
        scripts: { lint: 'eslint .', 'lint:fix': 'eslint . --fix' },
        devDependencies: dep(...deps),
      },
    },
  ];
}

function planObsidianVitest(options) {
  const o = options.obsidian;
  const cov = Boolean(options.guardrails?.coverageFloors);
  // --passWithNoTests: a fresh plugin before its first test has no sample tests,
  // and `vitest run` otherwise exits non-zero on an empty suite, failing the
  // day-one gate.
  const scripts = { test: 'vitest run --passWithNoTests', 'test:watch': 'vitest' };
  const deps = ['vitest', 'jsdom', 'typescript'];
  if (cov) {
    scripts['test:coverage'] = 'vitest run --coverage --passWithNoTests';
    deps.push('@vitest/coverage-istanbul');
  }
  // vite: @vitejs/plugin-vue declares it as a peer and imports it when the vitest
  // config loads, so a strict-peer install (pnpm strict / Yarn PnP) needs it listed
  // at the root — npm hoists it transitively, but those layouts don't.
  if (o.vue) deps.push('@vitejs/plugin-vue', '@vue/test-utils', 'vite');
  const actions = [
    write('tests/setup.ts', loadTemplate('obsidian/tests/setup.ts.tmpl')),
    write('tests/__mocks__/obsidian.ts', loadTemplate('obsidian/tests/obsidian-mock.ts.tmpl')),
    write('tests/obsidian-augment.d.ts', loadTemplate('obsidian/tests/obsidian-augment.d.ts.tmpl')),
    write('tests/unit/settings.test.ts', loadTemplate('obsidian/tests/settings.test.ts.tmpl')),
    write('tests/unit/eventBus.test.ts', loadTemplate('obsidian/tests/eventBus.test.ts.tmpl')),
    write('tests/unit/logger.test.ts', loadTemplate('obsidian/tests/logger.test.ts.tmpl')),
    write('tests/unit/settingsService.test.ts', loadTemplate('obsidian/tests/settingsService.test.ts.tmpl')),
    write('tests/unit/noticeService.test.ts', loadTemplate('obsidian/tests/noticeService.test.ts.tmpl')),
    write('tests/unit/modalService.test.ts', loadTemplate('obsidian/tests/modalService.test.ts.tmpl')),
    write('tests/unit/commandsService.test.ts', loadTemplate('obsidian/tests/commandsService.test.ts.tmpl')),
    write('tests/unit/commands.test.ts', loadTemplate('obsidian/tests/commands.test.ts.tmpl')),
    write('tests/unit/vaultService.test.ts', loadTemplate('obsidian/tests/vaultService.test.ts.tmpl')),
    write('tests/unit/requestService.test.ts', loadTemplate('obsidian/tests/requestService.test.ts.tmpl')),
    write('tests/unit/i18n.test.ts', loadTemplate('obsidian/tests/i18n.test.ts.tmpl')),
    write('tests/unit/statusBar.test.ts', loadTemplate('obsidian/tests/statusBar.test.ts.tmpl')),
    write('tests/unit/errorService.test.ts', loadTemplate('obsidian/tests/errorService.test.ts.tmpl')),
    write('tests/unit/ribbonService.test.ts', loadTemplate('obsidian/tests/ribbonService.test.ts.tmpl')),
    write('tests/unit/statusBarService.test.ts', loadTemplate('obsidian/tests/statusBarService.test.ts.tmpl')),
    write('tests/unit/menuService.test.ts', loadTemplate('obsidian/tests/menuService.test.ts.tmpl')),
    write('tests/unit/timersService.test.ts', loadTemplate('obsidian/tests/timersService.test.ts.tmpl')),
    write('tests/unit/vaultEventsService.test.ts', loadTemplate('obsidian/tests/vaultEventsService.test.ts.tmpl')),
    write('tests/unit/registerExtras.test.ts', loadTemplate('obsidian/tests/registerExtras.test.ts.tmpl')),
    write('tests/unit/registerActivity.test.ts', loadTemplate('obsidian/tests/registerActivity.test.ts.tmpl')),
    write('tests/unit/emojiSuggest.test.ts', loadTemplate('obsidian/tests/emojiSuggest.test.ts.tmpl')),
    write('tests/unit/codeBlock.test.ts', loadTemplate('obsidian/tests/codeBlock.test.ts.tmpl')),
    write('tests/unit/editorHighlight.test.ts', loadTemplate('obsidian/tests/editorHighlight.test.ts.tmpl')),
  ];
  if (o.vue) {
    actions.push(
      write('tests/vue/counterStore.test.ts', loadTemplate('obsidian/tests/counterStore.test.ts.tmpl')),
      write('tests/vue/HomePage.test.ts', loadTemplate('obsidian/tests/HomePage.test.ts.tmpl')),
      write('tests/vue/greeting.test.ts', loadTemplate('obsidian/tests/greeting.test.ts.tmpl')),
      write('tests/vue/appRouting.test.ts', loadTemplate('obsidian/tests/appRouting.test.ts.tmpl')),
    );
  }
  // Prettier-shaped object literal (not JSON.stringify) so the generated
  // config passes format:check; applyCoverageFloor rewrites it in the same shape.
  const coverageThreshold = cov ? '{ statements: 0, branches: 0, functions: 0, lines: 0 }' : '{}';
  const exts = o.vue ? 'ts,tsx,mts,cts,vue,js,jsx,mjs,cjs' : 'ts,tsx,mts,cts,js,jsx,mjs,cjs';
  const coverageGlobs = `${SRC_ROOT}/**/*.{${exts}}`;
  const config = renderTemplate(loadTemplate('obsidian/vitest.config.mjs.tmpl'), {
    vuePluginImport: o.vue ? "import vue from '@vitejs/plugin-vue';\n" : '',
    vuePlugins: o.vue ? '  plugins: [vue()],\n' : '',
    coverageGlobs,
    coverageThreshold,
  });
  return [
    // skip-if-exists (NOT overwrite-backup): initBaselines' applyCoverageFloor writes
    // the baselined coverage thresholds INTO this file, so an overwrite on re-apply
    // would reset the floor to 0 (the template renders zeros) and silently defeat the
    // coverage gate. A fresh scaffold writes it once; edits/floors then survive.
    write('vitest.config.mjs', config),
    ...actions,
    { type: 'mergeJson', path: 'package.json', patch: { scripts, devDependencies: dep(...deps) } },
  ];
}

function planFormatter(options) {
  return [
    write('.prettierrc.json', loadTemplate('obsidian/prettierrc.json.tmpl')),
    write('.prettierignore', loadTemplate('obsidian/prettierignore.tmpl')),
    {
      type: 'mergeJson',
      path: 'package.json',
      patch: {
        scripts: { format: 'prettier --write .', 'format:check': 'prettier --check .' },
        devDependencies: dep('prettier'),
      },
    },
  ];
}

function planCssGuard(options) {
  if (!options.guardrails?.cssGuard) return [];
  const content = renderTemplate(loadTemplate('obsidian/check-css-important.mjs.tmpl'), { styleRoots: `'${SRC_ROOT}'` });
  return [
    write('scripts/check-css-important.mjs', content, 'overwrite-backup'),
    { type: 'mergeJson', path: 'package.json', patch: { scripts: { 'check:css': 'node scripts/check-css-important.mjs' } } },
  ];
}

function planArtifacts(options) {
  return [
    write('scripts/check-artifacts.mjs', loadTemplate('obsidian/check-artifacts.mjs.tmpl'), 'overwrite-backup'),
    { type: 'mergeJson', path: 'package.json', patch: { scripts: { 'check:artifacts': 'node scripts/check-artifacts.mjs' } } },
  ];
}

function planGithubTemplates(options) {
  if (!options.github?.integrate) return [];
  return [write('.github/pull_request_template.md', loadTemplate('obsidian/pull_request_template.md.tmpl'))];
}

// The fallow ratchet is defined for ./coverage ABSENT (matching CI's fresh
// checkout); a stale local coverage dir left by a prior `test:coverage` feeds
// coverage-weighted metrics (CRAP/maintainability) into fallow and can false-fail
// `verify` while CI passes. `setup.mjs verify`/runGates clears it in the
// orchestrator before the gate — mirror that here so the generated npm script is
// deterministic too. Kept out of `check:quality` itself so a standalone run does
// not delete a user's coverage report. Dependency-free (no rimraf).
const CLEAR_COVERAGE = `node -e "require('fs').rmSync('coverage',{recursive:true,force:true})"`;

// One `verify` script that chains the whole local gate set in CI order, so
// agents (and humans) run one command instead of the chain. Mirrors runGates /
// the generated CI exactly.
function planVerifyScript(options, state) {
  const g = options.guardrails ?? {};
  const run = runPrefix(options.packageManager ?? state?.packageManager ?? 'npm');
  const cmds = [];
  if (g.eslintSeverityStaging) cmds.push(`${run} lint`);
  if (g.locGuard) cmds.push(`${run} check:loc`);
  if (g.cssGuard) cmds.push(`${run} check:css`);
  if (g.fallowRatchet) cmds.push(CLEAR_COVERAGE, `${run} check:quality`);
  for (const s of ['typecheck', 'format:check', g.coverageFloors ? 'test:coverage' : 'test', 'build', 'check:artifacts']) {
    cmds.push(`${run} ${s}`);
  }
  const verify = cmds.join(' && ');
  // Force scripts.verify: it's a computed aggregate of the enabled gates + the PM
  // prefix, so a re-apply after toggling a guardrail or switching package manager
  // must REPLACE the stale chain (deepMerge would keep the base scalar).
  return [{ type: 'mergeJson', path: 'package.json', patch: { scripts: { verify } }, force: ['scripts.verify'] }];
}

// Claude Code integration: slash commands (always — inert until invoked) plus
// OPT-IN hooks. sessionStart installs deps on a fresh Claude web session;
// qualityGate runs the fast gates (typecheck+lint) on Claude's Stop so the agent
// self-corrects. .claude/settings.json is written only when a hook is enabled.
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The EXACT hook entry a PRIOR apply wrote for one group, derived from the recorded
// options (project-setup.report.json). Reconciliation removes only this — our own
// previous output — so a user hook that merely shares a command (e.g. `npm install`)
// is never misclassified, and a first apply (no prior report) removes nothing.
function priorEngineHook(priorOptions, kind) {
  const h = isPlainObject(priorOptions) ? priorOptions.hooks : null;
  if (!isPlainObject(h)) return null;
  const pm = safePackageManager(priorOptions.packageManager ?? 'npm');
  if (kind === 'session') {
    return h.sessionStart ? { hooks: [{ type: 'command', command: PM_INSTALL[pm] }] } : null;
  }
  const run = runPrefix(pm);
  const gates = ['typecheck', ...(priorOptions.guardrails?.eslintSeverityStaging ? ['lint'] : [])];
  return h.qualityGate
    ? { hooks: [{ type: 'command', command: gates.map((s) => `${run} ${s}`).join(' && ') }] }
    : null;
}

// Rebuild one hook group: drop our own prior engine entry (BYTE-exact, so a user's
// differently-shaped hook that shares a command survives, and a multi-hook entry is
// never deleted wholesale), then append the current engine hook — de-duplicated
// against a matching hook the user already has.
function reconcileHookGroup(existing, priorEntry, current) {
  const priorJson = priorEntry ? JSON.stringify(priorEntry) : null;
  const kept = (Array.isArray(existing) ? existing : []).filter((e) => JSON.stringify(e) !== priorJson);
  if (!current) return kept;
  return kept.some((e) => JSON.stringify(e) === JSON.stringify(current)) ? kept : [...kept, current];
}

function planClaudeSettings(options, state) {
  const h = options.hooks ?? {};
  const pm = safePackageManager(options.packageManager ?? state?.packageManager ?? 'npm');
  const run = runPrefix(pm);
  // `{{run}} version` runs the npm `version` LIFECYCLE script (a no-op sync), not a
  // real bump, for npm/yarn/bun. The bump+tag command is `<pm> version` for pnpm and
  // `npm version` otherwise (yarn/bun `version` skip the lifecycle + git tag).
  const versionCmd = pm === 'bun' || pm === 'yarn' ? 'npm version' : `${pm} version`;
  const command = (name) => write(`.claude/commands/${name}.md`, renderTemplate(loadTemplate(`obsidian/claude/${name}.md.tmpl`), { run, versionCmd }));
  const actions = [command('add-command'), command('add-setting'), command('new-service')];
  // The /release command's steps assume the tag-push CI workflow, which planRelease
  // only writes with GitHub integration — omit it otherwise so it can't tell the
  // agent to expect a workflow that was never generated (publishing.md covers the
  // manual path).
  if (options.github?.integrate) actions.push(command('release'));
  else if (state?.priorOptions?.github?.integrate) {
    // Toggled off on re-apply: the previously written .claude/commands/release.md is
    // skip-if-exists, so it stays and still tells the agent to push a tag and await the
    // now-absent release workflow. Warn (apply can't delete it), like release.yml.
    actions.push(
      notice('GitHub integration was turned off, but the generated .claude/commands/release.md remains and still instructs a tag-push release against the now-absent workflow — delete it to avoid misleading /release runs.'),
    );
  }

  const sessionHook = h.sessionStart ? { hooks: [{ type: 'command', command: PM_INSTALL[pm] }] } : null;
  // Build the Stop gate from scripts that actually generated: typecheck is always
  // written; lint only when severity-staging is on (planObsidianEslint gates on it),
  // so an unconditional `${run} lint` would fail every Stop with a missing script.
  const gates = ['typecheck', ...(options.guardrails?.eslintSeverityStaging ? ['lint'] : [])];
  const stopHook = h.qualityGate
    ? { hooks: [{ type: 'command', command: gates.map((s) => `${run} ${s}`).join(' && ') }] }
    : null;

  // Reconcile OUR groups against any existing .claude/settings.json so a re-apply
  // with a changed PM or a toggled-off hook REPLACES/REMOVES the stale engine hook
  // rather than unioning it — keyed on what a PRIOR apply actually wrote, so a
  // user's own hooks (even one sharing a command) and other settings keys survive.
  const existingHooks = isPlainObject(state?.claudeSettings?.hooks) ? state.claudeSettings.hooks : {};
  const reconciled = { ...existingHooks };
  const nextSession = reconcileHookGroup(existingHooks.SessionStart, priorEngineHook(state?.priorOptions, 'session'), sessionHook);
  const nextStop = reconcileHookGroup(existingHooks.Stop, priorEngineHook(state?.priorOptions, 'stop'), stopHook);
  if (nextSession.length > 0) reconciled.SessionStart = nextSession;
  else delete reconciled.SessionStart;
  if (nextStop.length > 0) reconciled.Stop = nextStop;
  else delete reconciled.Stop;

  // Emit only when the reconciled hooks differ from disk — so a first apply with no
  // hooks writes nothing and a converged re-apply stays a no-op. force:['hooks']
  // REPLACES the hooks key with the reconciled value (deepMerge would union the
  // arrays); permissions and other keys are preserved by the surrounding merge.
  if (JSON.stringify(reconciled) !== JSON.stringify(existingHooks)) {
    actions.push({ type: 'mergeJson', path: '.claude/settings.json', patch: { hooks: reconciled }, force: ['hooks'] });
  }
  return actions;
}

// Dependabot keeps the exact-pinned deps fresh with weekly PRs that must pass the
// same gates. Gated on GitHub integration (it lives under .github/).
function planDependabot(options, state) {
  if (!options.github?.integrate) {
    // Toggled off on re-apply: apply is declarative and won't delete the file it wrote,
    // so a retained .github/dependabot.yml keeps opening weekly dependency/Actions PRs
    // against the user's opt-out. Warn (a file deletion can't be reconciled), like the
    // release workflow above.
    if (state?.priorOptions?.github?.integrate) {
      return [
        notice(
          'GitHub integration was turned off, but the generated .github/dependabot.yml remains and will keep opening weekly dependency/Actions PRs — delete it to fully opt out.',
        ),
      ];
    }
    return [];
  }
  return [write('.github/dependabot.yml', loadTemplate('obsidian/dependabot.yml.tmpl'))];
}

// Publishing guide: BRAT beta testing + the community-plugins submission checklist.
// manifest-beta.json ships alongside manifest.json (BRAT-ready) and is kept in
// lockstep by sync-version, so it never rots; a separate beta channel (manifest-beta
// ahead of stable) is a documented manual step in publishing.md.
function planPublishing(options) {
  const o = options.obsidian;
  const run = runPrefix(safePackageManager(options.packageManager ?? 'npm'));
  return [
    write('docs/publishing.md', renderTemplate(loadTemplate('obsidian/docs/publishing.md.tmpl'), { name: o.name, id: o.id, run })),
  ];
}

// Opt-in pre-commit: nano-staged via simple-git-hooks (lighter than husky +
// lint-staged; lint-staged is on the depend/ban-dependencies list the scaffold
// enforces). Staged source is eslint --fix + prettier before every commit —
// instant local feedback. The `prepare` script installs the git hook on `install`.
function planPreCommit(options, state) {
  if (!options.hooks?.preCommit) {
    // Toggled off on re-apply: apply is declarative, so the generated
    // prepare/simple-git-hooks/nano-staged config and the ALREADY-INSTALLED git
    // hook aren't auto-removed. Tell the user to clear them rather than leaving the
    // hook silently active against their stated choice.
    if (state?.priorOptions?.hooks?.preCommit) {
      return [
        notice(
          'Pre-commit was turned off, but the previously installed git hook stays active — remove the `prepare`, `simple-git-hooks`, and `nano-staged` entries from package.json and delete `.git/hooks/pre-commit` (simple-git-hooks won\'t uninstall it for you).',
        ),
      ];
    }
    return [];
  }
  // `eslint --fix` only when severity-staging is on: planObsidianEslint installs
  // eslint + the config only then, so an unconditional eslint task would fail every
  // commit (missing binary/config) when linting is off. prettier always ships.
  const lint = Boolean(options.guardrails?.eslintSeverityStaging);
  const sourceTask = lint ? ['eslint --fix', 'prettier --write'] : ['prettier --write'];
  const summary = lint ? 'eslint --fix + prettier' : 'prettier';
  // Cover every source extension the ESLint/Vitest/LOC/coverage configs do, incl.
  // the .mts/.cts module forms — a staged file outside this glob skips the hook.
  const sourceGlob = '*.{ts,tsx,mts,cts,vue,js,jsx,mjs,cjs}';
  return [
    notice(`Pre-commit hook enabled (simple-git-hooks + nano-staged): staged files get ${summary} before each commit. It installs via the \`prepare\` script on your next install; run \`npx simple-git-hooks\` once if you commit before installing.`),
    {
      type: 'mergeJson',
      path: 'package.json',
      patch: {
        scripts: { prepare: 'simple-git-hooks' },
        'simple-git-hooks': { 'pre-commit': 'npx nano-staged' },
        'nano-staged': {
          [sourceGlob]: sourceTask,
          '*.{css,json,md,yml,yaml}': ['prettier --write'],
        },
        devDependencies: dep('simple-git-hooks', 'nano-staged'),
      },
      // Only the source task's VALUE changes across re-applies (lint on/off), so
      // force just that one glob key — leaving a user's own simple-git-hooks entry
      // (e.g. commit-msg) or extra nano-staged patterns untouched (deepMerge keeps
      // them; it would otherwise leave the stale [eslint, prettier] task).
      force: [`nano-staged.${sourceGlob}`],
    },
  ];
}

function planRelease(options, state) {
  if (!options.github?.integrate) {
    // Toggled off on re-apply: apply is declarative and won't delete the workflow it
    // wrote, so .github/workflows/release.yml would keep publishing on a stable tag
    // against the user's stated opt-out. Warn (a file deletion can't be reconciled).
    if (state?.priorOptions?.github?.integrate) {
      return [
        notice(
          'GitHub integration was turned off, but the generated .github/workflows/release.yml remains and will still publish a release on the next stable tag — delete it to fully opt out.',
        ),
      ];
    }
    return [];
  }
  const pm = CI_PM[options.packageManager ?? state?.packageManager ?? 'npm'];
  if (!pm) return [notice('No built-in release workflow profile for this package manager — wire .github/workflows/release.yml manually.')];
  const content = renderTemplate(loadTemplate('obsidian/release.yml.tmpl'), {
    pmSetup: pm.setup, pmCache: pm.cache, pmInstall: pm.install, pmRun: pm.run,
  });
  // Mirror ci.yml: overwrite our own marked workflow so a re-apply refreshes the
  // package-manager install/run commands (an npm→pnpm switch otherwise leaves the
  // release running `npm ci` against a deleted lockfile), but keep a user's own
  // unmarked release.yml — with a notice — instead of clobbering it.
  const notices = state?.releaseWorkflow
    ? [notice('Existing .github/workflows/release.yml kept — its package-manager commands were NOT refreshed. Merge the generated release steps in, or align it with your package manager.')]
    : [];
  return [...notices, { type: 'writeFile', path: '.github/workflows/release.yml', mode: engineConfigMode(state?.releaseWorkflow), content }];
}

function planProjectDocs(options, state) {
  const o = options.obsidian;
  // Render commands with the selected package manager so the generated docs
  // don't tell a pnpm/yarn/bun user to run npm (wrong lockfile / bypasses CI).
  const pm = safePackageManager(options.packageManager ?? state?.packageManager ?? 'npm');
  const run = runPrefix(pm);
  const installCmd = PM_INSTALL[pm];
  // npm and pnpm `version` run the `version` lifecycle (sync-version.mjs) and
  // create the git tag the release workflow keys off. Yarn's `version` only bumps
  // package.json (no lifecycle, no tag) and bun has no equivalent, so both use the
  // npm command — it runs regardless of the project's package manager.
  const versionCmd = pm === 'bun' || pm === 'yarn' ? 'npm version patch' : `${pm} version patch`;
  const mobileLine = o.mobile
    ? '**Mobile-ready** (`isDesktopOnly: false`): never import Node/Electron modules (lint-enforced and non-external in the build); test flows on iOS/Android or the mobile emulator before release.'
    : '**Desktop-only** (`isDesktopOnly: true`): Node builtins are available, but prefer Vault/adapter APIs so a later mobile port stays possible.';
  // The tag-push automation only exists when planRelease wrote release.yml (GitHub
  // integration on). Without it, describe the manual path instead of pointing the
  // agent at a workflow that was never generated.
  const releaseFlow = options.github?.integrate
    ? `\`${versionCmd}\` (or \`minor\`/\`major\`) syncs \`manifest.json\` and \`versions.json\` via \`scripts/sync-version.mjs\`; \`git push --follow-tags\` triggers the release workflow, which attaches \`main.js\`, \`manifest.json\`, and \`styles.css\`.`
    : `\`${versionCmd}\` (or \`minor\`/\`major\`) syncs \`manifest.json\` and \`versions.json\` via \`scripts/sync-version.mjs\`. GitHub integration is off, so there is no release workflow — run \`${run} build\` and attach \`main.js\`, \`manifest.json\`, and \`styles.css\` to your release manually (see \`docs/publishing.md\`).`;
  const actions = [
    write('README.md', renderTemplate(loadTemplate('obsidian/README.md.tmpl'), {
      name: o.name,
      description: o.description,
      run,
      installCmd,
      versionCmd,
    })),
    write('CLAUDE.md', renderTemplate(loadTemplate('obsidian/CLAUDE.md.tmpl'), {
      name: o.name,
      id: o.id,
      run,
      releaseFlow,
      // Only list test:coverage when the script exists — coverageFloors off means
      // no such script.
      coverageLine: options.guardrails?.coverageFloors ? `\n${run} test:coverage  # coverage with rise-only floors` : '',
      // Each ratchet command exists only when its guardrail is on (they're
      // user-toggleable), so gate the command list like the coverage line.
      lintLine: options.guardrails?.eslintSeverityStaging ? `\n${run} lint           # eslint (obsidianmd + type-aware rules, all-error)` : '',
      locLine: options.guardrails?.locGuard ? `\n${run} check:loc      # per-file LOC ratchet` : '',
      cssLine: options.guardrails?.cssGuard ? `\n${run} check:css      # CSS !important ratchet (add -- --update to re-baseline)` : '',
      qualityLine: options.guardrails?.fallowRatchet ? `\n${run} check:quality  # fallow metric ratchet (run with ./coverage absent)` : '',
      typecheckTool: o.vue ? 'vue-tsc' : 'tsc',
      mobileLine: `- ${mobileLine}`,
      vueLine: o.vue
        ? '- The sidebar view is a Vue 3 island (`src/ui/vue/`): one app per leaf, Pinia store per island, vue-router on memory history. `markRaw` Obsidian objects before providing them; unmount + `contentEl.empty()` on close.'
        : '- UI is built imperatively with Obsidian `createEl`/`createDiv` helpers.',
    })),
    write('AGENTS.md', renderTemplate(loadTemplate('obsidian/AGENTS.md.tmpl'), {
      name: o.name,
      id: o.id,
      run,
      mobileLine,
      // Component-testing guidance is Vue-only; a vanilla scaffold ships no SFCs.
      componentTesting: o.vue
        ? '\n- Components mount with `@vue/test-utils` and a **partial plugin double provided under the real `PLUGIN_KEY`** — see `tests/vue/HomePage.test.ts` for the pattern.'
        : '',
      // The open-view registration module exists only in the Vue variant.
      registerViewsNote: o.vue ? ', `registerViews`' : '',
      uiSection: o.vue
        ? loadTemplate('obsidian/agents-vue-section.md.tmpl').trimEnd()
        : loadTemplate('obsidian/agents-novue-section.md.tmpl').trimEnd(),
    })),
    write('.editorconfig', loadTemplate('obsidian/editorconfig.tmpl')),
    write('.env.example', loadTemplate('obsidian/env.example.tmpl')),
    // Tag releases WITHOUT npm's default "v" prefix — Obsidian matches a
    // release by tag === manifest version.
    write('.npmrc', loadTemplate('obsidian/npmrc.tmpl')),
  ];
  if (options.docs?.scaffold) {
    actions.push(
      write('docs/adr/0001-plugin-architecture-baseline.md', renderTemplate(loadTemplate('obsidian/adr-0001.md.tmpl'), {
        name: o.name,
        date: new Date().toISOString().slice(0, 10),
        mobileChoice: o.mobile ? 'mobile-ready' : 'desktop-only',
        isDesktopOnly: String(!o.mobile),
        mobileConsequence: o.mobile
          ? '; Node/Electron imports are lint-banned and non-external in the build.'
          : '; node builtins remain importable (esbuild externals).',
        uiChoice: o.vue
          ? 'Vue 3 island per leaf (Pinia, vue-router on memory history), SFC styles merged into styles.css.'
          : 'imperative Obsidian DOM helpers (no framework).',
      })),
    );
  }
  // The .npmrc write is skip-if-exists; a pre-existing .npmrc without
  // tag-version-prefix silently keeps npm's default "v" tag prefix, which breaks
  // the release workflow's tag===manifest-version match. Flag it rather than
  // shipping a repo whose releases Obsidian can't find.
  if (state?.npmrc != null && !/tag-version-prefix/.test(state.npmrc)) {
    actions.push(
      notice(
        'An existing .npmrc was kept (skip-if-exists) without `tag-version-prefix=""` — `npm version` then tags `v<x>` and Obsidian\'s release matcher (tag === manifest version) won\'t find it. Add `tag-version-prefix=""` to your .npmrc.',
      ),
    );
  }
  return actions;
}

function planPackageBasics(options, version, fresh) {
  const o = options.obsidian;
  const scripts = {
    dev: 'node esbuild.config.mjs',
    build: 'node esbuild.config.mjs production',
    typecheck: o.vue ? 'vue-tsc --noEmit' : 'tsc --noEmit',
    version: 'node scripts/sync-version.mjs',
  };
  const patch = {
    name: o.id,
    version,
    description: o.description,
    main: 'main.js',
    // jsdom (always installed for the vitest DOM env) supports ^20.19 || ^22.13 ||
    // >=24, so its 22 line stops at <23 and the 23.x major is unsupported; intersected
    // with vite (>=22.12) and fallow (>=22) the scaffold's range is this union, not a
    // bare >=22.13 (which would wrongly admit Node 23). The engine enforces the same
    // set on the HOST runtime before applying.
    engines: { node: OBSIDIAN_NODE_ENGINES },
    scripts,
    // @codemirror/view + state: types for the editor-highlight sample, and they
    // are obsidian's own declared peers (needed at the root for strict-peer PMs).
    devDependencies: dep('obsidian', '@codemirror/view', '@codemirror/state', 'esbuild', 'typescript', ...(o.vue ? ['unplugin-vue', 'vue-tsc'] : [])),
  };
  if (o.vue) patch.dependencies = dep('vue', 'pinia', 'vue-router');
  // `version` and `main` are always engine-owned: version syncs to the manifest
  // (so an npm-init 1.0.0 default is normalized and package/manifest never desync
  // for check:artifacts), and an Obsidian plugin's entry is always the esbuild
  // `main.js` the manifest points at — a stale `index.js` from `npm init` must not
  // survive. On the INITIAL scaffold, `name`/`description` are forced too so
  // npm-init defaults (the directory name, an empty description) don't shadow the
  // selected plugin identity; on RE-APPLY they stay merge-kept so a user's later
  // edits aren't clobbered.
  const force = fresh ? ['version', 'main', 'name', 'description'] : ['version', 'main'];
  return [{ type: 'mergeJson', path: 'package.json', patch, force }];
}

// Ordered composition for obsidian mode. plan() adds the shared planners
// (fallow, LOC, report, docs, CI, install) around this.
export function planObsidian(options, state = {}) {
  // On re-apply the manifest already exists (skip-if-exists keeps it) and may have
  // been bumped by `npm version`; sync package.json to it rather than resetting to
  // the initial constant. A fresh scaffold (no manifest) uses INITIAL_VERSION.
  const version = state.manifestVersion ?? INITIAL_VERSION;
  // No prior manifest ⇒ the initial scaffold: force the selected plugin identity
  // onto package.json (below). A re-apply (manifest present) keeps name/description
  // merge-safe so user edits survive.
  const fresh = state.manifestVersion == null;
  return [
    ...planManifest(options.obsidian, version),
    ...planPackageBasics(options, version, fresh),
    ...planBuild(options),
    ...planSources(options),
    ...planTsconfig(options),
    ...planObsidianEslint(options),
    ...planObsidianVitest(options),
    ...planFormatter(options),
    ...planCssGuard(options),
    ...planArtifacts(options),
    ...planRelease(options, state),
    ...planGithubTemplates(options),
    ...planDependabot(options, state),
    ...planVerifyScript(options, state),
    ...planPreCommit(options, state),
    ...planClaudeSettings(options, state),
    ...planPublishing(options),
    ...planProjectDocs(options, state),
  ];
}
