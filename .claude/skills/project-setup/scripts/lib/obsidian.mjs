// scripts/lib/obsidian.mjs — Obsidian-plugin scaffold planners.
//
// Activated by `options.obsidian` (see options.mjs sanitizeObsidian). Produces a
// ready-to-develop plugin: manifest/versions, esbuild build with SFC-style merge
// and dev vault deploy, an optional Vue 3 + Pinia + vue-router island view, a
// Vitest lane with an `obsidian` test double, obsidianmd/type-aware ESLint,
// Prettier, the CSS !important ratchet, an artifact smoke gate, version sync,
// and a tag-push release workflow. Everything user-editable is skip-if-exists;
// engine-owned ratchet/build scripts under scripts/ are overwrite-backup.
import { CI_PM, dep, notice, scriptCollision } from './harness.mjs';
import { loadTemplate, renderTemplate } from './templates.mjs';

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

function classNames(o) {
  const base = pascal(o.name).replace(/Plugin$/, '');
  return {
    pluginClass: `${base}Plugin`,
    settingsType: `${base}Settings`,
    settingsTab: `${base}SettingTab`,
  };
}

const write = (path, content, mode = 'skip-if-exists') => ({ type: 'writeFile', path, mode, content });

function planManifest(o) {
  const authorUrlLine = o.authorUrl ? `\n  "authorUrl": ${JSON.stringify(o.authorUrl)},` : '';
  const manifest = renderTemplate(loadTemplate('obsidian/manifest.json.tmpl'), {
    idJson: JSON.stringify(o.id),
    nameJson: JSON.stringify(o.name),
    version: INITIAL_VERSION,
    minAppJson: JSON.stringify(o.minAppVersion),
    descriptionJson: JSON.stringify(o.description),
    authorJson: JSON.stringify(o.author),
    authorUrlLine,
    isDesktopOnly: String(!o.mobile),
  });
  const versions = `{\n  ${JSON.stringify(INITIAL_VERSION)}: ${JSON.stringify(o.minAppVersion)}\n}\n`;
  return [write('manifest.json', manifest), write('versions.json', versions)];
}

function planBuild(options, state) {
  const o = options.obsidian;
  const actions = [];
  if (state?.esbuildConfig) {
    actions.push(notice('Existing esbuild.config.mjs kept — review it against the generated build contract (styles.css assembly, vault deploy, mobile externals) in references/obsidian-plugin.md.'));
  }
  // Desktop-only plugins may import node builtins and electron (Obsidian ships
  // Electron), so those are externals. A mobile-ready plugin must NOT mark them
  // external: an accidental `import 'fs'` or `import 'electron'` then fails the
  // build loudly instead of crashing on iOS/Android at runtime.
  const content = renderTemplate(loadTemplate('obsidian/esbuild.config.mjs.tmpl'), {
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
  actions.push(write('esbuild.config.mjs', content));
  actions.push(write('scripts/sync-version.mjs', loadTemplate('obsidian/sync-version.mjs.tmpl'), 'overwrite-backup'));
  return actions;
}

function planSources(options) {
  const o = options.obsidian;
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
    viewImport: o.vue ? "import { registerViews } from './ui/registerViews';\n" : '',
    viewRegistration: o.vue ? '    registerViews(this);\n' : '',
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
    write('src/main.ts', renderTemplate(loadTemplate('obsidian/src/main.ts.tmpl'), mainVars)),
    write('src/settings.ts', renderTemplate(loadTemplate('obsidian/src/settings.ts.tmpl'), shared)),
    write('src/commands.ts', renderTemplate(loadTemplate('obsidian/src/commands.ts.tmpl'), commandVars)),
    write('src/styles.css', renderTemplate(loadTemplate('obsidian/src/styles.css.tmpl'), { id: o.id, name: o.name })),
    // Core services: provider-neutral, UI-free, unit-tested — the seam every
    // feature builds on (see the generated AGENTS.md).
    write('src/core/commands/CommandsService.ts', renderTemplate(loadTemplate('obsidian/src/core/commands/CommandsService.ts.tmpl'), shared)),
    write('src/core/events/EventBus.ts', loadTemplate('obsidian/src/core/events/EventBus.ts.tmpl')),
    write('src/core/events/AppEvents.ts', renderTemplate(loadTemplate('obsidian/src/core/events/AppEvents.ts.tmpl'), shared)),
    write('src/core/notices/NoticeService.ts', loadTemplate('obsidian/src/core/notices/NoticeService.ts.tmpl')),
    write('src/core/modals/ModalService.ts', loadTemplate('obsidian/src/core/modals/ModalService.ts.tmpl')),
    // The status-bar item wires the event bus from the UI layer in both variants.
    write('src/ui/statusBar.ts', renderTemplate(loadTemplate('obsidian/src/ui/statusBar.ts.tmpl'), shared)),
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
  return [write('tsconfig.json', renderTemplate(loadTemplate('obsidian/tsconfig.json.tmpl'), { vueIncludes }))];
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
  const vueSrcFiles = o.vue ? "'src/**/*.ts', 'src/**/*.vue'" : "'src/**/*.ts'";
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
    write('eslint.config.mjs', content),
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
  const scripts = { test: 'vitest run', 'test:watch': 'vitest' };
  const deps = ['vitest', 'jsdom', 'typescript'];
  if (cov) {
    scripts['test:coverage'] = 'vitest run --coverage';
    deps.push('@vitest/coverage-istanbul');
  }
  if (o.vue) deps.push('@vitejs/plugin-vue', '@vue/test-utils');
  const actions = [
    write('tests/setup.ts', loadTemplate('obsidian/tests/setup.ts.tmpl')),
    write('tests/__mocks__/obsidian.ts', loadTemplate('obsidian/tests/obsidian-mock.ts.tmpl')),
    write('tests/obsidian-augment.d.ts', loadTemplate('obsidian/tests/obsidian-augment.d.ts.tmpl')),
    write('tests/unit/settings.test.ts', loadTemplate('obsidian/tests/settings.test.ts.tmpl')),
    write('tests/unit/eventBus.test.ts', loadTemplate('obsidian/tests/eventBus.test.ts.tmpl')),
    write('tests/unit/noticeService.test.ts', loadTemplate('obsidian/tests/noticeService.test.ts.tmpl')),
    write('tests/unit/modalService.test.ts', loadTemplate('obsidian/tests/modalService.test.ts.tmpl')),
    write('tests/unit/commandsService.test.ts', loadTemplate('obsidian/tests/commandsService.test.ts.tmpl')),
    write('tests/unit/statusBar.test.ts', loadTemplate('obsidian/tests/statusBar.test.ts.tmpl')),
  ];
  if (o.vue) {
    actions.push(
      write('tests/vue/counterStore.test.ts', loadTemplate('obsidian/tests/counterStore.test.ts.tmpl')),
      write('tests/vue/HomePage.test.ts', loadTemplate('obsidian/tests/HomePage.test.ts.tmpl')),
      write('tests/vue/greeting.test.ts', loadTemplate('obsidian/tests/greeting.test.ts.tmpl')),
    );
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
      ...actions,
      { type: 'mergeJson', path: 'package.json', patch: { scripts: { test: 'vitest run' }, devDependencies: dep(...standdownDeps) } },
    ];
  }
  // Prettier-shaped object literal (not JSON.stringify) so the generated
  // config passes format:check; applyCoverageFloor rewrites it in the same shape.
  const coverageThreshold = cov ? '{ statements: 0, branches: 0, functions: 0, lines: 0 }' : '{}';
  const config = renderTemplate(loadTemplate('obsidian/vitest.config.mjs.tmpl'), {
    vuePluginImport: o.vue ? "import vue from '@vitejs/plugin-vue';\n" : '',
    vuePlugins: o.vue ? '  plugins: [vue()],\n' : '',
    coverageExt: o.vue ? '{ts,vue}' : 'ts',
    coverageThreshold,
  });
  return [
    ...scriptCollision(options, state, 'test', 'vitest run'),
    ...(cov ? scriptCollision(options, state, 'test:coverage', 'vitest run --coverage') : []),
    write('vitest.config.mjs', config),
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
  return [
    ...scriptCollision(options, state, 'check:css', 'node scripts/check-css-important.mjs'),
    write('scripts/check-css-important.mjs', loadTemplate('obsidian/check-css-important.mjs.tmpl'), 'overwrite-backup'),
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

function planProjectDocs(options) {
  const o = options.obsidian;
  const mobileLine = o.mobile
    ? '**Mobile-ready** (`isDesktopOnly: false`): never import Node/Electron modules (lint-enforced and non-external in the build); test flows on iOS/Android or the mobile emulator before release.'
    : '**Desktop-only** (`isDesktopOnly: true`): Node builtins are available, but prefer Vault/adapter APIs so a later mobile port stays possible.';
  const actions = [
    write('README.md', renderTemplate(loadTemplate('obsidian/README.md.tmpl'), {
      name: o.name,
      description: o.description,
      id: o.id,
    })),
    write('CLAUDE.md', renderTemplate(loadTemplate('obsidian/CLAUDE.md.tmpl'), {
      name: o.name,
      id: o.id,
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

function planPackageBasics(options, state) {
  const o = options.obsidian;
  const scripts = {
    dev: 'node esbuild.config.mjs',
    build: 'node esbuild.config.mjs production',
    typecheck: o.vue ? 'vue-tsc --noEmit' : 'tsc --noEmit',
    version: 'node scripts/sync-version.mjs && git add manifest.json versions.json',
  };
  const patch = {
    name: o.id,
    version: INITIAL_VERSION,
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
  return [...notices, { type: 'mergeJson', path: 'package.json', patch }];
}

// Ordered composition for obsidian mode. plan() adds the shared planners
// (fallow, LOC, report, docs, CI, install) around this.
export function planObsidian(options, state = {}) {
  return [
    ...planManifest(options.obsidian),
    ...planPackageBasics(options, state),
    ...planBuild(options, state),
    ...planSources(options),
    ...planTsconfig(options),
    ...planObsidianEslint(options, state),
    ...planObsidianVitest(options, state),
    ...planFormatter(options, state),
    ...planCssGuard(options, state),
    ...planArtifacts(options, state),
    ...planRelease(options, state),
    ...planGithubTemplates(options),
    ...planProjectDocs(options),
  ];
}
