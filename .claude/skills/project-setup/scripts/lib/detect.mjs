// .claude/skills/project-setup/scripts/lib/detect.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MARKER } from './marker.mjs';
import { loadTemplate } from './templates.mjs';

// index/main/app under src/ then root, each in ts/tsx/js/jsx/mjs. Covers JS-only
// apps (e.g. src/app.js, src/app.jsx) — not just the TypeScript variants — so a
// JS entrypoint isn't mis-fallen-back to src/index.ts and flagged unused.
const ENTRY_BASENAMES = ['index', 'main', 'app'];
const ENTRY_EXTS = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'];
// Common source dirs (src, lib, app, source) + repo root.
const ENTRY_DIRS = ['src', 'lib', 'app', 'source', ''];
const ENTRY_CANDIDATES = ENTRY_DIRS.flatMap((d) =>
  ENTRY_BASENAMES.flatMap((b) => ENTRY_EXTS.map((e) => (d ? `${d}/${b}.${e}` : `${b}.${e}`))),
);
// `main`/`module` often point at BUILD output, not source — skip those roots.
const BUILD_DIRS = new Set(['dist', 'build', 'out', 'esm', 'cjs', 'umd', 'lib-esm', 'node_modules', '.next']);

export function detectEntry(cwd) {
  const pkg = readJsonSafe(join(cwd, 'package.json'));
  const strip = (p) => p.replace(/^\.\//, ''); // normalize a leading ./ so roots derive correctly
  // A bundler `source` field is unambiguously the source entry.
  const src = pkg?.source;
  if (typeof src === 'string' && existsSync(join(cwd, src))) return strip(src);
  // The first existing common source entry (src/lib/app/source/root).
  for (const c of ENTRY_CANDIDATES) if (existsSync(join(cwd, c))) return c;
  // `module`/`main` may name the source for a build-less package — use it if it
  // exists and its top dir isn't a build-output dir.
  for (const field of ['module', 'main']) {
    const raw = pkg?.[field];
    if (typeof raw !== 'string') continue;
    const p = strip(raw);
    if (existsSync(join(cwd, p)) && !BUILD_DIRS.has(p.split('/')[0])) return p;
  }
  return 'src/index.ts';
}

const ESLINTRC = ['.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'];
// Flat configs in a different extension than the eslint.config.mjs we write —
// ESLint loads only one (it checks .js before .mjs), so either theirs wins (ours
// is ignored) or ours shadows theirs. Both are collisions worth reporting.
const ESLINT_FLAT = ['eslint.config.js', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts'];
// Fallow config in another form than the .fallowrc.json we write — .fallowrc.json
// takes precedence and would shadow these.
const FALLOW_CONFIGS = ['.fallowrc.jsonc', 'fallow.toml', '.fallow.toml', '.fallowrc'];
// Per-runner config signals — kept SEPARATE so the standdown decision can be
// scoped to the resolved runner (Jest ignores vitest.config, and vice versa).
// Vitest also reads vite.config by default, so a generated vitest.config would
// override the project's plugins/aliases/setup.
const JEST_CONFIGS = ['jest.config.js', 'jest.config.ts', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.cts', 'jest.config.mts', 'jest.config.json'];
const VITEST_CONFIGS = ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mjs', 'vitest.config.cjs', 'vitest.config.cts', 'vitest.config.mts'];
const VITE_CONFIGS = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs', 'vite.config.cts', 'vite.config.mts'];
// Any prettier config form: writing .prettierrc.json beside one would make two
// configs compete (prettier picks the closest/first — ambiguous either way).
// .prettierrc.json itself is handled separately: strict-JSON configs cannot
// carry the engine marker, so "ours" is recognized by exact template content.
const PRETTIER_CONFIGS = [
  '.prettierrc', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.json5',
  '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', '.prettierrc.toml',
  'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs',
];

function foreignPrettierConfig(cwd, pkg) {
  if (pkg.prettier != null || existsAny(cwd, PRETTIER_CONFIGS)) return true;
  const p = join(cwd, '.prettierrc.json');
  if (!existsSync(p)) return false;
  try {
    return readFileSync(p, 'utf8') !== loadTemplate('obsidian/prettierrc.json.tmpl');
  } catch {
    return true;
  }
}

function existsAny(cwd, names) {
  return names.some((n) => existsSync(join(cwd, n)));
}

// True when one of `names` exists and the engine did NOT write it (no marker) —
// a hand-written config whose thresholds we can't safely baseline.
function hasUnmarkedConfig(cwd, names) {
  for (const f of names) {
    const p = join(cwd, f);
    if (!existsSync(p)) continue;
    try {
      if (!readFileSync(p, 'utf8').includes(MARKER)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

const PM_LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],   // Bun v1.2+ text lockfile (current default)
  ['bun.lockb', 'bun'],  // legacy binary lockfile
  ['package-lock.json', 'npm'],
];

const PM_NAMES = new Set(['npm', 'pnpm', 'yarn', 'bun']);

// The scaffold's sample app is an integrated greenfield artifact — its modules
// import each other's APIs. If the target already has ANY source (or a
// manifest), it is an existing plugin, and dropping the scaffold's app beside
// the user's would mismatch (their code lacks the scaffold's service shape). So
// brownfield gets the harness + docs only; the app is greenfield-only. A
// directory scan (not a fixed file list) so new scaffold sources can't drift
// out of the signal.
function hasSourceFiles(cwd) {
  const stack = [join(cwd, 'src')];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // dir absent or unreadable
    }
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(join(dir, entry.name));
      else if (/\.(?:ts|tsx|mts|cts|vue)$/.test(entry.name)) return true;
    }
  }
  return false;
}

export function detectPackageManager(cwd) {
  // 1. Explicit corepack field, e.g. "packageManager": "pnpm@9.1.0" — wins even
  //    before a lockfile exists, so a first apply targets the right manager.
  const declared = readJsonSafe(join(cwd, 'package.json'))?.packageManager;
  if (typeof declared === 'string') {
    const name = declared.split('@')[0];
    if (PM_NAMES.has(name)) return name;
  }
  // 2. Lockfile.
  for (const [file, pm] of PM_LOCKFILES) {
    if (existsSync(join(cwd, file))) return pm;
  }
  // 3. Default.
  return 'npm';
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function detectGithubRemote(cwd) {
  // Ask git first — robust for worktrees/submodules where `.git` is a FILE
  // pointing at the real gitdir (so `.git/config` doesn't exist here).
  try {
    const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (url) return /github\.com/.test(url);
  } catch {
    // git missing or not a repo — fall through to the on-disk config.
  }
  const cfg = join(cwd, '.git', 'config');
  if (!existsSync(cfg)) return false;
  return /github\.com/.test(readFileSync(cfg, 'utf8'));
}

export function detectDefaultBranch(cwd) {
  // The remote's default branch, so generated CI targets the real trunk instead of
  // a hardcoded `main`. Do NOT fall back to the current branch: running setup from a
  // feature branch would otherwise filter CI to that branch and skip PRs to the real
  // trunk. Default to `main` when origin/HEAD is unknown (the pull_request CI trigger
  // is unfiltered, so PRs still run).
  try {
    const ref = execFileSync('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (ref && ref !== 'origin/HEAD') return ref.replace(/^origin\//, '');
  } catch {
    // no remote HEAD ref — fall through
  }
  return 'main';
}

export function detect(cwd) {
  const pkg = readJsonSafe(join(cwd, 'package.json')) ?? {};
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const has = (name) => Object.prototype.hasOwnProperty.call(deps, name);
  const testFramework = has('vitest') ? 'vitest' : has('jest') ? 'jest' : null;
  const entry = detectEntry(cwd);
  return {
    packageManager: detectPackageManager(cwd),
    typescript: has('typescript') || existsSync(join(cwd, 'tsconfig.json')),
    eslint: has('eslint'),
    fallow: has('fallow'),
    testFramework,
    git: existsSync(join(cwd, '.git')),
    github: detectGithubRemote(cwd),
    defaultBranch: detectDefaultBranch(cwd),
    entry,
    // detectEntry returns src/index.ts as a syntactic fallback even when nothing
    // exists — obsidianEntry uses this to avoid pointing the build at a phantom.
    entryExists: existsSync(join(cwd, entry)),
    // Brownfield collision signals — planners turn these into user-facing notices
    // instead of silently no-op'ing on a pre-existing config/script/workflow.
    scripts: pkg.scripts ?? {},
    legacyEslintrc: existsAny(cwd, ESLINTRC),
    eslintFlatConfig: existsAny(cwd, ESLINT_FLAT),
    // A fallow config in another form (.fallowrc.jsonc / fallow.toml / ...). The
    // generated .fallowrc.json would take precedence and shadow it, so planFallow
    // stands down and ratchets THEIR config instead.
    fallowConfig: existsAny(cwd, FALLOW_CONFIGS),
    // The same-name config we write (skip-if-exists) — flagged only when it's the
    // user's own (no marker), so a re-apply of our generated one won't false-fire.
    eslintConfigMjs: hasUnmarkedConfig(cwd, ['eslint.config.mjs']),
    ciWorkflow: hasUnmarkedConfig(cwd, ['.github/workflows/ci.yml']),
    // Jest also reads a `jest` key in package.json — writing jest.config.mjs beside
    // it makes Jest 30 error "Multiple configurations found".
    jestConfig: hasUnmarkedConfig(cwd, JEST_CONFIGS) || pkg.jest != null,
    vitestConfig: hasUnmarkedConfig(cwd, VITEST_CONFIGS),
    viteConfig: existsAny(cwd, VITE_CONFIGS),
    // Obsidian-plugin signals: an existing manifest means brownfield adoption
    // (scaffold files stay skip-if-exists); existing USER build/format configs
    // make their planners stand down with a notice instead of writing a
    // competitor. Engine-written ones (marker / exact template content) don't
    // re-fire the notice on a converged re-apply.
    obsidianManifest: readJsonSafe(join(cwd, 'manifest.json')),
    // Seed a generated manifest/versions from an existing package.json version
    // so a brownfield adopt (pkg 2.3.0, no manifest) doesn't emit manifest 0.1.0
    // and fail check:artifacts on desync. Only a valid semver is trusted.
    packageVersion: /^\d+\.\d+\.\d+/.test(String(pkg.version ?? '')) ? pkg.version : null,
    // An existing plugin: a manifest or any src source is present. The planner
    // writes the harness + docs but skips the sample app for these.
    obsidianAppPresent: existsSync(join(cwd, 'manifest.json')) || hasSourceFiles(cwd),
    // Obsidian loads root styles.css, but the scaffold build treats src/styles.css
    // as SOURCE and regenerates root styles.css. An adopt with a real root sheet
    // but no src/styles.css must migrate it first — surface the content so the
    // planner can seed src/styles.css from it (else the first build clobbers it).
    rootStylesheet:
      existsSync(join(cwd, 'styles.css')) && !existsSync(join(cwd, 'src', 'styles.css'))
        ? readFileSync(join(cwd, 'styles.css'), 'utf8')
        : null,
    esbuildConfig: hasUnmarkedConfig(cwd, ['esbuild.config.mjs']),
    prettierConfig: foreignPrettierConfig(cwd, pkg),
    releaseWorkflow: hasUnmarkedConfig(cwd, ['.github/workflows/release.yml']),
    docs: {
      context: existsSync(join(cwd, 'CONTEXT.md')),
      dir: existsSync(join(cwd, 'docs')),
    },
  };
}
