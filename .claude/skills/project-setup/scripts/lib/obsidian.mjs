// scripts/lib/obsidian.mjs — Obsidian-plugin scaffold planners.
//
// Activated by `options.obsidian` (see options.mjs sanitizeObsidian). Produces a
// ready-to-develop plugin: manifest/versions, esbuild build with SFC-style merge
// and dev vault deploy, an optional Vue 3 + Pinia + vue-router island view, a
// Vitest lane with an `obsidian` test double, obsidianmd/type-aware ESLint,
// Prettier, the CSS !important ratchet, an artifact smoke gate, version sync,
// and a tag-push release workflow. Everything user-editable is skip-if-exists;
// engine-owned ratchet/build scripts under scripts/ are overwrite-backup.
import { CI_PM, dep, engineConfigMode, entryDir, notice, PINNED, scriptCollision } from './harness.mjs';
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

// Greenfield = a brand-new plugin (no manifest, no scaffold app source). The
// sample app (sources + tests) is written only then; an existing plugin gets
// the harness + docs and adopts the patterns from AGENTS.md. Uses the frozen
// decision (freezeOptions) when present so a re-apply stays idempotent, else
// derives from state (the path direct-planner tests take).
function isGreenfield(options, state) {
  if (typeof options.obsidian?.greenfield === 'boolean') return options.obsidian.greenfield;
  return !state?.obsidianAppPresent;
}

// The build/fallow entry. Greenfield writes src/main.ts; a brownfield adopt
// keeps the user's detected entry (e.g. a root main.ts) — but only if it
// actually exists. A manifest-only repo with no source has detectEntry fall
// back to a phantom src/index.ts; don't point the build at it (see planBuild's
// no-source notice), default to src/main.ts instead.
export function obsidianEntry(options, state) {
  if (isGreenfield(options, state)) return 'src/main.ts';
  const entry = state?.entry;
  // Reject `..` segments and absolute (leading-slash) paths (defense in depth
  // beyond detectEntry): either would make esbuild bundle — and entryDir scan —
  // outside the project or at the filesystem root.
  const valid =
    typeof entry === 'string' &&
    /^[\w./-]+\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry) &&
    !entry.startsWith('/') &&
    !entry.split('/').includes('..') &&
    entry !== 'main.js'; // the esbuild OUTFILE — bundling it into itself fails the build
  return valid && state?.entryExists ? entry : 'src/main.ts';
}

function planManifest(o, state, version) {
  const authorUrlLine = o.authorUrl ? `\n  "authorUrl": ${JSON.stringify(o.authorUrl)},` : '';
  // An existing manifest is kept (skip-if-exists). Key the freshly-written
  // versions.json to ITS version + minAppVersion, not the scaffold defaults, so
  // check:artifacts doesn't flag a desync against the user's manifest.
  const existing = state?.obsidianManifest;
  const semver = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null);
  const manifestVersion = semver(existing?.version) ?? version;
  const minApp = semver(existing?.minAppVersion) ?? o.minAppVersion;
  const manifest = renderTemplate(loadTemplate('obsidian/manifest.json.tmpl'), {
    idJson: JSON.stringify(o.id),
    nameJson: JSON.stringify(o.name),
    version: manifestVersion,
    minAppJson: JSON.stringify(minApp),
    descriptionJson: JSON.stringify(o.description),
    authorJson: JSON.stringify(o.author),
    authorUrlLine,
    isDesktopOnly: String(!o.mobile),
  });
  // versions.json is reconciled, not skip-if-exists: a kept file from a brownfield
  // adopt may lack the current manifest version or carry a stale minAppVersion for
  // it, either of which fails check:artifacts. mergeJson+force ensures the current
  // entry equals the manifest's minAppVersion while preserving historical entries.
  const versionsAction = { type: 'mergeJson', path: 'versions.json', patch: { [manifestVersion]: minApp }, force: [manifestVersion] };
  // A kept manifest (skip-if-exists) can disagree with the answered mobile mode:
  // the build/lint/docs follow o.mobile, so e.g. a manifest advertising mobile
  // while esbuild externalizes desktop-only Electron/Node ships a broken plugin.
  const notices = [];
  if (existing && typeof existing.isDesktopOnly === 'boolean' && existing.isDesktopOnly === Boolean(o.mobile)) {
    notices.push(notice(`Existing manifest.json says isDesktopOnly: ${existing.isDesktopOnly}, but you chose ${o.mobile ? 'mobile-ready' : 'desktop-only'} — the build, lint, and docs follow your answer. Set "isDesktopOnly": ${!o.mobile} in manifest.json to match (or re-run with the other mobile choice).`));
  }
  // A brownfield manifest that OMITS isDesktopOnly (or carries a non-boolean)
  // defaults to mobile-ready in Obsidian. If the user chose desktop-only, the
  // build/lint/docs follow that answer, so a kept manifest without the flag would
  // ship advertised as mobile-ready. Computed here so BOTH the reconcile below and
  // the freshly-generated beta manifest carry the forced flag.
  const needsDesktopOnly = existing && !o.mobile && typeof existing.isDesktopOnly !== 'boolean';
  // manifest-beta.json mirrors manifest.json for BRAT beta installs; sync-version
  // keeps it in lockstep so it never lags stable (see docs/publishing.md for how
  // to run a beta channel ahead of stable). Brownfield: mirror the KEPT manifest
  // (manifest.json is skip-if-exists), not the answers — else the beta manifest
  // describes a different plugin (id/name/description/desktop) than the adopted one.
  // The beta payload is built from pre-reconcile `existing`, so fold in the same
  // minAppVersion/isDesktopOnly gap-fills the manifest.json reconciles get below.
  const betaManifest = existing
    ? JSON.stringify(
        {
          ...existing,
          minAppVersion: existing.minAppVersion ?? minApp,
          ...(needsDesktopOnly ? { isDesktopOnly: true } : {}),
        },
        null,
        2,
      ) + '\n'
    : manifest;
  // A kept manifest.json (skip-if-exists) with a version but no minAppVersion
  // desyncs against the generated versions.json (keyed to minApp) and fails
  // check:artifacts on the first run. Merge the field in — mergeJson keeps an
  // existing value, so this only fills the gap on brownfield adopt.
  const minAppReconcile =
    existing && !existing.minAppVersion
      ? [{ type: 'mergeJson', path: 'manifest.json', patch: { minAppVersion: minApp } }]
      : [];
  // Force isDesktopOnly true on the kept manifest.json when needed — gated on a
  // non-boolean current value, so an explicit choice is never clobbered (an
  // explicit-false mismatch is left to the notice above, consistent with skip-if-exists).
  const desktopOnlyReconcile = needsDesktopOnly
    ? [{ type: 'mergeJson', path: 'manifest.json', patch: { isDesktopOnly: true }, force: ['isDesktopOnly'] }]
    : [];
  return [
    ...notices,
    write('manifest.json', manifest),
    write('manifest-beta.json', betaManifest),
    ...minAppReconcile,
    ...desktopOnlyReconcile,
    versionsAction,
  ];
}

// The version shared by the generated manifest, versions.json, AND package.json
// so check:artifacts never sees a desync. A brownfield adopt inherits the
// existing plugin's version — the manifest wins (it is the plugin's identity),
// then package.json; greenfield falls back to 0.1.0. Only a clean semver counts.
function initialVersion(state) {
  const semver = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null);
  return semver(state?.obsidianManifest?.version) ?? semver(state?.packageVersion) ?? INITIAL_VERSION;
}

function planBuild(options, state) {
  const o = options.obsidian;
  const actions = [];
  if (state?.esbuildConfig) {
    actions.push(notice('Existing esbuild.config.mjs kept — review it against the generated build contract (styles.css assembly, vault deploy, mobile externals) in references/obsidian-plugin.md.'));
  }
  // Brownfield adopt with no real source (a manifest/artifact but no source file,
  // or an "entry" that is just the build output main.js): the build points at
  // src/main.ts, which does not exist yet — say so instead of failing cryptically.
  if (!isGreenfield(options, state) && !state?.entryExists) {
    actions.push(notice('No source entry was found (a manifest or build artifact is present, but no source file — a root main.js is the build OUTPUT, not a source). The generated build points at src/main.ts — create it (or your real entry) before `build`/`verify` can produce artifacts.'));
  }
  // Desktop-only plugins may import node builtins and electron (Obsidian ships
  // Electron), so those are externals. A mobile-ready plugin must NOT mark them
  // external: an accidental `import 'fs'` or `import 'electron'` then fails the
  // build loudly instead of crashing on iOS/Android at runtime.
  // esbuild entry points are unambiguous only as explicitly-relative paths; a
  // bare `main.ts` reads as a package specifier in some esbuild versions. `./`
  // a non-relative entry (a root brownfield main.ts); src/main.ts becomes
  // ./src/main.ts (equivalent, just explicit).
  const rawEntry = state?.entry ?? 'src/main.ts';
  const buildEntry = /^(?:\.|\/)/.test(rawEntry) ? rawEntry : `./${rawEntry}`;
  const content = renderTemplate(loadTemplate('obsidian/esbuild.config.mjs.tmpl'), {
    entry: buildEntry,
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
  // Engine-owned (marked): overwrite-backup so template updates (e.g. the entry
  // ./-prefix, mobile externals) reach a re-applied plugin; an unmarked user
  // esbuild config stood down with the notice above.
  actions.push(write('esbuild.config.mjs', content, engineConfigMode(state?.esbuildConfig)));
  actions.push(write('scripts/sync-version.mjs', loadTemplate('obsidian/sync-version.mjs.tmpl'), 'overwrite-backup'));
  return actions;
}

function planSources(options, state) {
  const o = options.obsidian;
  // The base stylesheet is harness, not app: the build reads src/styles.css and
  // regenerates styles.css, so write it in both modes (skip-if-exists keeps the
  // user's). A brownfield adopt whose real sheet lives at root styles.css (no
  // src/styles.css yet) must SEED src/styles.css from it — otherwise the first
  // build overwrites the user's styling with the scaffold base.
  const migrateStyles = !isGreenfield(options, state) && typeof state?.rootStylesheet === 'string';
  const stylesheet = write(
    'src/styles.css',
    migrateStyles ? state.rootStylesheet : renderTemplate(loadTemplate('obsidian/src/styles.css.tmpl'), { id: o.id, name: o.name }),
  );
  // Brownfield: keep the user's app, add only the harness/docs. The sample
  // modules import each other's APIs, so dropping them beside an existing
  // main.ts would mismatch — point the user at AGENTS.md instead.
  if (!isGreenfield(options, state)) {
    return [
      stylesheet,
      ...(migrateStyles
        ? [notice('Existing styles.css migrated into src/styles.css as the build source; the generated build regenerates styles.css from it. Edit src/styles.css going forward.')]
        : []),
      notice('Existing plugin detected (a manifest or src/ source is present) — the harness (build, tests, lint, ratchets, CI, docs) was added but NOT the sample app sources. Adopt the service/command/event patterns from the generated AGENTS.md into your own code.'),
    ];
  }
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
      ? "\n  // callback — reveal the plugin view.\n  plugin.commands.addSimple('open-view', 'Open view', () => {\n    void activateView(plugin);\n  });\n"
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

function planTsconfig(options, state) {
  const o = options.obsidian;
  const vueIncludes = o.vue ? ', "src/**/*.vue", "tests/**/*.vue"' : '';
  // A brownfield entry outside src/ (e.g. a root main.ts) must be in the
  // include, or the type-aware lint project service can't resolve it.
  const entry = state?.entry ?? 'src/main.ts';
  const entryInclude = entry.startsWith('src/') ? '' : `, ${JSON.stringify(entry)}`;
  const content = renderTemplate(loadTemplate('obsidian/tsconfig.json.tmpl'), { vueIncludes, entryInclude });
  // Greenfield owns the tsconfig: the sample app + tests import through the "@/*"
  // path alias and need the src/tests includes, so a stray existing tsconfig (e.g.
  // "{}") must be replaced or typecheck fails day one. overwrite-backup keeps a
  // backup; a fresh repo has none, and re-apply no-ops on matching content. A
  // brownfield adopt keeps the user's tsconfig (they own their real source).
  if (isGreenfield(options, state)) {
    const notices = state?.tsconfigExists
      ? [notice('Existing tsconfig.json replaced (a backup is kept) — the generated sample app/tests need the "@/*" path alias and the src/tests includes. Re-add any custom compilerOptions from the backup.')]
      : [];
    return [...notices, write('tsconfig.json', content, 'overwrite-backup')];
  }
  return [write('tsconfig.json', content)];
}

function planObsidianEslint(options, state) {
  if (!options.guardrails?.eslintSeverityStaging) return [];
  const o = options.obsidian;
  const notices = [...scriptCollision(options, state, 'lint', 'eslint .')];
  if (state?.eslintConfigMjs) {
    notices.push(notice('You already have an eslint.config.mjs — the Obsidian lint config was NOT written (skip-if-exists), so your config runs. Merge the obsidianmd preset + raw-HTML bans in, or back up and replace.'));
  } else if (state?.eslintFlatConfig) {
    notices.push(notice('An existing eslint.config.{js,cjs,ts} sits beside the generated eslint.config.mjs — ESLint loads only ONE (it checks .js before .mjs). Remove/rename one, or merge the Obsidian rules into yours.'));
  } else if (state?.legacyEslintrc) {
    notices.push(notice('Legacy .eslintrc* found — ESLint 10 reads only the flat eslint.config.mjs the harness wrote; remove the legacy file once migrated.'));
  }
  // The safety + mobile-import bans must cover the ACTUAL source, not a hardcoded
  // src/**: a brownfield entry in lib/ (or a root main.ts) would otherwise let lint
  // pass over raw-HTML/Notice/console/Node-Electron violations. Always keep src/**
  // (greenfield), add the entry's dir when it's elsewhere (e.g. lib/**), or a
  // bounded flat-root glob for a root entry — the entry file alone would leave its
  // sibling helpers (view.ts, settings.ts) bundled but unlinted. The config's
  // global ignores drop node_modules/scripts/*.mjs configs, so *.{exts} is safe
  // and non-recursive keeps it off tests/ and dist/. JS/JSX so adopted JS is linted.
  // Every extension detectEntry accepts (incl. module TS/JS: mts/cts/mjs/cjs), so a
  // brownfield src/main.mjs or src/main.mts still gets the raw-HTML/Notice/console
  // and mobile Node/Electron bans.
  const exts = o.vue ? 'ts,tsx,mts,cts,vue,js,jsx,mjs,cjs' : 'ts,tsx,mts,cts,js,jsx,mjs,cjs';
  const srcRoot = entryDir(obsidianEntry(options, state)); // 'src' | 'lib' | null (root)
  const lintGlobs = new Set([`src/**/*.{${exts}}`]);
  if (srcRoot && srcRoot !== 'src') lintGlobs.add(`${srcRoot}/**/*.{${exts}}`);
  else if (!srcRoot) lintGlobs.add(`*.{${exts}}`);
  const vueSrcFiles = [...lintGlobs].map((g) => `'${g}'`).join(', ');
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
    'eslint', '@eslint/js', 'typescript-eslint', 'eslint-plugin-obsidianmd',
    'eslint-plugin-simple-import-sort', '@eslint-community/eslint-plugin-eslint-comments',
    '@vitest/eslint-plugin', 'eslint-config-prettier',
  ];
  if (o.vue) deps.push('eslint-plugin-vue', 'vue-eslint-parser');
  return [
    ...notices,
    // Upgrade a marked generic eslint config (the obsidianmd/raw-HTML/mobile/i18n
    // rules the generated docs/CI promise); an unmarked user config stood down above.
    write('eslint.config.mjs', content, engineConfigMode(state?.eslintConfigMjs)),
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

function planObsidianVitest(options, state) {
  const o = options.obsidian;
  const cov = Boolean(options.guardrails?.coverageFloors);
  // --passWithNoTests: a brownfield plugin (or a fresh one before its first
  // test) has no sample tests, and `vitest run` otherwise exits non-zero on an
  // empty suite, failing the day-one gate.
  const scripts = { test: 'vitest run --passWithNoTests', 'test:watch': 'vitest' };
  const deps = ['vitest', 'jsdom', 'typescript'];
  if (cov) {
    scripts['test:coverage'] = 'vitest run --coverage --passWithNoTests';
    deps.push('@vitest/coverage-istanbul');
  }
  if (o.vue) deps.push('@vitejs/plugin-vue', '@vue/test-utils');
  // The test-lane infrastructure is always safe to write.
  const actions = [
    write('tests/setup.ts', loadTemplate('obsidian/tests/setup.ts.tmpl')),
    write('tests/__mocks__/obsidian.ts', loadTemplate('obsidian/tests/obsidian-mock.ts.tmpl')),
    write('tests/obsidian-augment.d.ts', loadTemplate('obsidian/tests/obsidian-augment.d.ts.tmpl')),
  ];
  // The sample tests import the sample app's APIs, so they ship only when the
  // app does (greenfield). Brownfield keeps the infra above and the user tests
  // their own modules.
  if (isGreenfield(options, state)) {
    actions.push(
      write('tests/unit/settings.test.ts', loadTemplate('obsidian/tests/settings.test.ts.tmpl')),
      write('tests/unit/eventBus.test.ts', loadTemplate('obsidian/tests/eventBus.test.ts.tmpl')),
      write('tests/unit/logger.test.ts', loadTemplate('obsidian/tests/logger.test.ts.tmpl')),
      write('tests/unit/settingsService.test.ts', loadTemplate('obsidian/tests/settingsService.test.ts.tmpl')),
      write('tests/unit/noticeService.test.ts', loadTemplate('obsidian/tests/noticeService.test.ts.tmpl')),
      write('tests/unit/modalService.test.ts', loadTemplate('obsidian/tests/modalService.test.ts.tmpl')),
      write('tests/unit/commandsService.test.ts', loadTemplate('obsidian/tests/commandsService.test.ts.tmpl')),
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
    );
    if (o.vue) {
      actions.push(
        write('tests/vue/counterStore.test.ts', loadTemplate('obsidian/tests/counterStore.test.ts.tmpl')),
        write('tests/vue/HomePage.test.ts', loadTemplate('obsidian/tests/HomePage.test.ts.tmpl')),
        write('tests/vue/greeting.test.ts', loadTemplate('obsidian/tests/greeting.test.ts.tmpl')),
        write('tests/vue/appRouting.test.ts', loadTemplate('obsidian/tests/appRouting.test.ts.tmpl')),
      );
    }
  }
  // A hand-written vitest/vite config owns plugins/aliases/thresholds — never
  // shadow it (same standdown as the generic planner; the coverage gate is
  // dropped by effectiveOptions for this state). Checked directly rather than
  // via standsDownTestConfig: obsidian mode is vitest by construction, even
  // before freezeOptions has resolved options.testFramework.
  if (state?.vitestConfig || state?.viteConfig) {
    // The sample tests above are still written, so everything they import must
    // still install — the vue component test needs @vue/test-utils, and the
    // user's config will need @vitejs/plugin-vue to transform the SFCs.
    const standdownDeps = o.vue ? ['vitest', 'jsdom', '@vue/test-utils', '@vitejs/plugin-vue'] : ['vitest', 'jsdom'];
    return [
      notice('Existing test config kept — the generated vitest.config.mjs was NOT written and the coverage gate was not wired. Wire the `obsidian` alias to tests/__mocks__/obsidian.ts and jsdom yourself (see references/obsidian-plugin.md).'),
      // Same as the normal path: if the repo already has a different `test` script
      // (e.g. jest), mergeJson keeps it, so surface the collision — verify/CI run
      // `test` and would otherwise silently skip the intended Vitest lane.
      ...scriptCollision(options, state, 'test', 'vitest run --passWithNoTests'),
      ...actions,
      { type: 'mergeJson', path: 'package.json', patch: { scripts: { test: 'vitest run --passWithNoTests' }, devDependencies: dep(...standdownDeps) } },
    ];
  }
  // Prettier-shaped object literal (not JSON.stringify) so the generated
  // config passes format:check; applyCoverageFloor rewrites it in the same shape.
  const coverageThreshold = cov ? '{ statements: 0, branches: 0, functions: 0, lines: 0 }' : '{}';
  // Coverage include tracks the actual entry root, not a hardcoded src/**: a
  // brownfield adopt whose entry is a root main.ts would otherwise measure zero
  // real source and give a false coverage pass. Mirrors the generic planner.
  // Every extension detectEntry accepts (module TS/JS: mts/cts/mjs/cjs) so a
  // brownfield entry like src/main.mts is measured, not silently at 0% while the
  // build still ships it; a greenfield TS scaffold has none of these, so no-op.
  const exts = o.vue ? 'ts,tsx,mts,cts,vue,js,jsx,mjs,cjs' : 'ts,tsx,mts,cts,js,jsx,mjs,cjs';
  const srcDir = entryDir(obsidianEntry(options, state));
  const coverageGlobs = srcDir ? `${srcDir}/**/*.{${exts}}` : `**/*.{${exts}}`;
  const config = renderTemplate(loadTemplate('obsidian/vitest.config.mjs.tmpl'), {
    vuePluginImport: o.vue ? "import vue from '@vitejs/plugin-vue';\n" : '',
    vuePlugins: o.vue ? '  plugins: [vue()],\n' : '',
    coverageGlobs,
    coverageThreshold,
  });
  return [
    ...scriptCollision(options, state, 'test', 'vitest run --passWithNoTests'),
    ...(cov ? scriptCollision(options, state, 'test:coverage', 'vitest run --coverage --passWithNoTests') : []),
    // overwrite-backup (not skip-if-exists): reaching here means either no config
    // or a project-setup-MARKED generic one (an unmarked user config already stood
    // down above). The generic config lacks the obsidian alias/jsdom/Vue plugin the
    // generated tests need, so replace it; apply() no-ops when our content matches.
    write('vitest.config.mjs', config, 'overwrite-backup'),
    ...actions,
    { type: 'mergeJson', path: 'package.json', patch: { scripts, devDependencies: dep(...deps) } },
  ];
}

function planFormatter(options, state) {
  const actions = [
    ...scriptCollision(options, state, 'format', 'prettier --write .'),
    ...scriptCollision(options, state, 'format:check', 'prettier --check .'),
  ];
  if (state?.prettierConfig) {
    actions.push(notice('Existing prettier config kept — the generated .prettierrc.json was NOT written. The format/format:check scripts run against your config.'));
  } else {
    actions.push(write('.prettierrc.json', loadTemplate('obsidian/prettierrc.json.tmpl')));
  }
  actions.push(write('.prettierignore', loadTemplate('obsidian/prettierignore.tmpl')));
  actions.push({
    type: 'mergeJson',
    path: 'package.json',
    patch: {
      scripts: { format: 'prettier --write .', 'format:check': 'prettier --check .' },
      devDependencies: dep('prettier'),
    },
  });
  return actions;
}

function planCssGuard(options, state) {
  if (!options.guardrails?.cssGuard) return [];
  // Scan the resolved source root, not a hardcoded src/: an entry in lib/ (or a
  // root entry whose SFC/CSS sits at the repo root) extracts styles into
  // styles.css that a src/-only walk would miss. '.' is safe — the script skips
  // node_modules/dist/build/coverage.
  const root = entryDir(obsidianEntry(options, state)); // 'src' | 'lib' | null (root)
  const roots = !root ? ['.'] : root === 'src' ? ['src'] : ['src', root];
  const styleRoots = roots.map((r) => `'${r}'`).join(', ');
  const content = renderTemplate(loadTemplate('obsidian/check-css-important.mjs.tmpl'), { styleRoots });
  return [
    ...scriptCollision(options, state, 'check:css', 'node scripts/check-css-important.mjs'),
    write('scripts/check-css-important.mjs', content, 'overwrite-backup'),
    { type: 'mergeJson', path: 'package.json', patch: { scripts: { 'check:css': 'node scripts/check-css-important.mjs' } } },
  ];
}

function planArtifacts(options, state) {
  return [
    ...scriptCollision(options, state, 'check:artifacts', 'node scripts/check-artifacts.mjs'),
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
  return [
    // AGENTS/CLAUDE docs tell users to run `verify`; if it is shadowed, say so
    // (mergeJson keeps the existing script) instead of documenting a no-op.
    ...scriptCollision(options, state, 'verify', verify),
    { type: 'mergeJson', path: 'package.json', patch: { scripts: { verify } } },
  ];
}

// Claude Code integration: slash commands (always — inert until invoked) plus
// OPT-IN hooks. sessionStart installs deps on a fresh Claude web session;
// qualityGate runs the fast gates (typecheck+lint) on Claude's Stop so the agent
// self-corrects. .claude/settings.json is written only when a hook is enabled.
function planClaudeSettings(options, state) {
  const h = options.hooks ?? {};
  const pm = safePackageManager(options.packageManager ?? state?.packageManager ?? 'npm');
  const run = runPrefix(pm);
  const command = (name) => write(`.claude/commands/${name}.md`, renderTemplate(loadTemplate(`obsidian/claude/${name}.md.tmpl`), { run }));
  const actions = [command('add-command'), command('add-setting'), command('new-service'), command('release')];
  const hooks = {};
  if (h.sessionStart) hooks.SessionStart = [{ hooks: [{ type: 'command', command: PM_INSTALL[pm] }] }];
  if (h.qualityGate) {
    // Build from gates that actually generated a script: typecheck is always
    // written; lint only when severity-staging is on (planObsidianEslint gates on
    // it), so an unconditional `${run} lint` would fail every Stop hook with a
    // missing script when the user turned linting off.
    const gates = ['typecheck', ...(options.guardrails?.eslintSeverityStaging ? ['lint'] : [])];
    hooks.Stop = [{ hooks: [{ type: 'command', command: gates.map((s) => `${run} ${s}`).join(' && ') }] }];
  }
  if (Object.keys(hooks).length > 0) {
    // mergeJson (not a plain write) so an opted-in hook actually lands when the
    // repo already has a .claude/settings.json — skip-if-exists would silently
    // drop it while apply still reports success. Additive: existing permissions
    // and hooks survive, our hook groups union in.
    actions.push({ type: 'mergeJson', path: '.claude/settings.json', patch: { hooks } });
  }
  return actions;
}

// Dependabot keeps the exact-pinned deps fresh with weekly PRs that must pass the
// same gates. Gated on GitHub integration (it lives under .github/).
function planDependabot(options) {
  if (!options.github?.integrate) return [];
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
  if (!options.hooks?.preCommit) return [];
  // mergeJson keeps an existing nested scalar, so a pre-existing
  // simple-git-hooks.pre-commit shadows the generated `npx nano-staged` hook —
  // staged files would run the user's command, not eslint+prettier. Warn.
  const hook = state?.preCommitHook;
  const hookCollision =
    hook && hook !== 'npx nano-staged'
      ? [notice(`Existing simple-git-hooks.pre-commit kept (\`${hook}\`) — the generated \`npx nano-staged\` hook was NOT installed (mergeJson keeps your value). Replace it, or chain both, so staged files get eslint --fix + prettier.`)]
      : [];
  return [
    notice('Pre-commit hook enabled (simple-git-hooks + nano-staged): staged files get eslint --fix + prettier before each commit. It installs via the `prepare` script on your next install; run `npx simple-git-hooks` once if you commit before installing.'),
    ...scriptCollision(options, state, 'prepare', 'simple-git-hooks'),
    ...hookCollision,
    {
      type: 'mergeJson',
      path: 'package.json',
      patch: {
        scripts: { prepare: 'simple-git-hooks' },
        'simple-git-hooks': { 'pre-commit': 'npx nano-staged' },
        'nano-staged': {
          '*.{ts,tsx,vue,js,jsx,mjs,cjs}': ['eslint --fix', 'prettier --write'],
          '*.{css,json,md,yml,yaml}': ['prettier --write'],
        },
        devDependencies: dep('simple-git-hooks', 'nano-staged'),
      },
    },
  ];
}

function planRelease(options, state) {
  if (!options.github?.integrate) return [];
  const pm = CI_PM[options.packageManager ?? state?.packageManager ?? 'npm'];
  if (!pm) return [notice('No built-in release workflow profile for this package manager — wire .github/workflows/release.yml manually.')];
  const content = renderTemplate(loadTemplate('obsidian/release.yml.tmpl'), {
    pmSetup: pm.setup, pmCache: pm.cache, pmInstall: pm.install, pmRun: pm.run,
  });
  const notices = state?.releaseWorkflow
    ? [notice('Existing .github/workflows/release.yml kept — the Obsidian release steps were NOT added to it.')]
    : [];
  return [...notices, write('.github/workflows/release.yml', content)];
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
      versionCmd,
      // Only list test:coverage when the script exists — coverageFloors off, or an
      // adopted vitest/vite config standing coverage down, means no such script.
      coverageLine: options.guardrails?.coverageFloors ? `\n${run} test:coverage  # coverage with rise-only floors` : '',
      typecheckTool: o.vue ? 'vue-tsc' : 'tsc',
      mobileLine: `- ${mobileLine}`,
      vueLine: o.vue
        ? '- The sidebar view is a Vue 3 island (`src/ui/vue/`): one app per leaf, Pinia store per island, vue-router on memory history. `markRaw` Obsidian objects before providing them; unmount + `contentEl.empty()` on close.'
        : '- UI is built imperatively with Obsidian `createEl`/`createDiv` helpers.',
    })),
    write('AGENTS.md', renderTemplate(loadTemplate('obsidian/AGENTS.md.tmpl'), {
      name: o.name,
      id: o.id,
      mobileLine,
      uiSection: o.vue
        ? loadTemplate('obsidian/agents-vue-section.md.tmpl').trimEnd()
        : loadTemplate('obsidian/agents-novue-section.md.tmpl').trimEnd(),
    })),
    write('.editorconfig', loadTemplate('obsidian/editorconfig.tmpl')),
    write('.env.example', loadTemplate('obsidian/env.example.tmpl')),
    // Tag releases WITHOUT npm's default "v" prefix — Obsidian matches a
    // release by tag === manifest version.
    ...(state?.npmrcNeedsTagPrefix
      ? [notice('Existing .npmrc kept — it does not set tag-version-prefix="". npm defaults to "v", so `npm version` tags v1.2.3, which the release workflow rejects (it requires tag === manifest.version). Add `tag-version-prefix=""` to your .npmrc.')]
      : []),
    write('.npmrc', loadTemplate('obsidian/npmrc.tmpl')),
  ];
  if (options.docs?.scaffold) {
    actions.push(
      write('docs/adr/0001-plugin-architecture-baseline.md', renderTemplate(loadTemplate('obsidian/adr-0001.md.tmpl'), {
        name: o.name,
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
  return actions;
}

// The generated tsconfig uses moduleResolution "bundler" (TypeScript 5+). mergeJson
// keeps a brownfield devDependencies.typescript scalar and `force` only reaches
// top-level keys, so an existing 4.x survives and breaks `typecheck`/`verify` on the
// first apply. Read the range's leading integer as its major floor; a missing digit
// (latest / * / workspace:*) is assumed adequate, so we only warn on a concrete <5.
function typescriptTooOld(range) {
  if (typeof range !== 'string') return false;
  const m = /\d+/.exec(range);
  return m ? Number(m[0]) < 5 : false;
}

// The generated esbuild.config.mjs calls esbuild.context() (the watch/rebuild API
// that landed in 0.17.0), and mergeJson keeps a brownfield devDependencies.esbuild
// scalar, so an existing 0.16.x survives and breaks `build`/`dev` on the first run.
// esbuild is 0.x, so read major.minor: 0.<17 is too old; 1.x (future) or a missing
// digit (latest / *) is assumed adequate.
function esbuildTooOld(range) {
  if (typeof range !== 'string') return false;
  const m = /(\d+)\.(\d+)/.exec(range);
  return m ? Number(m[1]) === 0 && Number(m[2]) < 17 : false;
}

function planPackageBasics(options, state, version) {
  const o = options.obsidian;
  const scripts = {
    dev: 'node esbuild.config.mjs',
    build: 'node esbuild.config.mjs production',
    typecheck: o.vue ? 'vue-tsc --noEmit' : 'tsc --noEmit',
    version: 'node scripts/sync-version.mjs && git add manifest.json manifest-beta.json versions.json',
  };
  const patch = {
    name: o.id,
    version,
    description: o.description,
    main: 'main.js',
    engines: { node: '>=22' },
    scripts,
    devDependencies: dep('obsidian', 'esbuild', 'typescript', ...(o.vue ? ['unplugin-vue', 'vue-tsc'] : [])),
  };
  if (o.vue) patch.dependencies = dep('vue', 'pinia', 'vue-router');
  // Shadowed lifecycle scripts are load-bearing here: CI/verify assume `build`
  // emits main.js/styles.css and `npm version` runs sync-version — surface
  // every collision instead of silently keeping a script that does neither.
  const notices = Object.entries(scripts).flatMap(([name, desired]) =>
    scriptCollision(options, state, name, desired),
  );
  // A kept sub-5 typescript would compile-fail the generated bundler-resolution
  // tsconfig; we can't force a nested dep key, so warn instead of silently shipping
  // a scaffold whose typecheck gate is dead on arrival.
  if (typescriptTooOld(state?.typescriptVersion)) {
    notices.push(
      notice(`Existing devDependencies.typescript (\`${state.typescriptVersion}\`) kept — the generated tsconfig.json uses moduleResolution "bundler", which needs TypeScript 5+. Upgrade to \`${PINNED.typescript}\` (or any 5+) or the typecheck/verify gate fails on the first run.`),
    );
  }
  // Same shape for esbuild: a kept 0.16.x can't build the generated config's
  // esbuild.context() call, so warn rather than ship a scaffold whose build is dead.
  if (esbuildTooOld(state?.esbuildVersion)) {
    notices.push(
      notice(`Existing devDependencies.esbuild (\`${state.esbuildVersion}\`) kept — the generated esbuild.config.mjs uses esbuild.context(), which needs esbuild 0.17+. Upgrade to \`${PINNED.esbuild}\` (or any 0.17+) or the build/dev gate fails on the first run.`),
    );
  }
  // Force `version`: a brownfield package.json (e.g. 1.0.0) must be synced to the
  // canonical version (the manifest wins, per initialVersion) or check:artifacts
  // fails on a manifest/package desync after apply. Other keys stay merge-kept.
  return [...notices, { type: 'mergeJson', path: 'package.json', patch, force: ['version'] }];
}

// Ordered composition for obsidian mode. plan() adds the shared planners
// (fallow, LOC, report, docs, CI, install) around this.
export function planObsidian(options, state = {}) {
  const version = initialVersion(state);
  return [
    ...planManifest(options.obsidian, state, version),
    ...planPackageBasics(options, state, version),
    ...planBuild(options, state),
    ...planSources(options, state),
    ...planTsconfig(options, state),
    ...planObsidianEslint(options, state),
    ...planObsidianVitest(options, state),
    ...planFormatter(options, state),
    ...planCssGuard(options, state),
    ...planArtifacts(options, state),
    ...planRelease(options, state),
    ...planGithubTemplates(options),
    ...planDependabot(options),
    ...planVerifyScript(options, state),
    ...planPreCommit(options, state),
    ...planClaudeSettings(options, state),
    ...planPublishing(options),
    ...planProjectDocs(options, state),
  ];
}
