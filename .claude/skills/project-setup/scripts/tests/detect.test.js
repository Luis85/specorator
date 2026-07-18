// .claude/skills/project-setup/scripts/tests/detect.test.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

import { detect, detectDefaultBranch, detectEntry, detectGithubRemote, detectPackageManager } from '../lib/detect.mjs';
import { tmpProject } from './helpers.js';

test('detectDefaultBranch returns the remote default, else main (never the current feature branch)', () => {
  const none = tmpProject({});
  const feature = tmpProject({});
  try {
    assert.equal(detectDefaultBranch(none.dir), 'main'); // no git
    execFileSync('git', ['init', '-b', 'feature/x'], { cwd: feature.dir, stdio: 'ignore' });
    assert.equal(detectDefaultBranch(feature.dir), 'main'); // no origin/HEAD -> NOT the feature branch
  } finally {
    none.cleanup();
    feature.cleanup();
  }
});

test('detectPackageManager reads the lockfile, defaults to npm', () => {
  const a = tmpProject({ 'pnpm-lock.yaml': '' });
  const b = tmpProject({});
  try {
    assert.equal(detectPackageManager(a.dir), 'pnpm');
    assert.equal(detectPackageManager(b.dir), 'npm');
  } finally {
    a.cleanup();
    b.cleanup();
  }
});

test('detect reports tooling presence from package.json', () => {
  const p = tmpProject({
    'package.json': { devDependencies: { eslint: '^9', vitest: '^2', typescript: '^5' } },
    'tsconfig.json': '{}',
  });
  try {
    const state = detect(p.dir);
    assert.equal(state.eslint, true);
    assert.equal(state.fallow, false);
    assert.equal(state.testFramework, 'vitest');
    assert.equal(state.typescript, true);
  } finally {
    p.cleanup();
  }
});

test('detectPackageManager returns bun for a bun.lock file (v1.2+ text lockfile)', () => {
  const p = tmpProject({ 'bun.lock': '' });
  try {
    assert.equal(detectPackageManager(p.dir), 'bun');
  } finally {
    p.cleanup();
  }
});

test('detectPackageManager honors package.json#packageManager before the npm fallback', () => {
  const p = tmpProject({ 'package.json': { packageManager: 'pnpm@9.1.0' } }); // no lockfile yet
  try {
    assert.equal(detectPackageManager(p.dir), 'pnpm');
  } finally {
    p.cleanup();
  }
});

test('detectGithubRemote is true only when a github remote exists', () => {
  const gh = tmpProject({ '.git/config': '[remote "origin"]\n  url = https://github.com/o/r.git\n' });
  const gl = tmpProject({ '.git/config': '[remote "origin"]\n  url = https://gitlab.com/o/r.git\n' });
  try {
    assert.equal(detectGithubRemote(gh.dir), true);
    assert.equal(detectGithubRemote(gl.dir), false);
  } finally {
    gh.cleanup();
    gl.cleanup();
  }
});

test('detectEntry returns src/main.ts when it exists, falling back to src/index.ts', () => {
  const withMain = tmpProject({ 'src/main.ts': '' });
  const empty = tmpProject({});
  try {
    assert.equal(detectEntry(withMain.dir), 'src/main.ts');
    assert.equal(detectEntry(empty.dir), 'src/index.ts');
  } finally {
    withMain.cleanup();
    empty.cleanup();
  }
});

test('detectEntry rejects a parent-directory package source (no ".." traversal)', () => {
  // plugin/package.json points source one level up to an existing file; the `..`
  // segment must be rejected so the build/ratchets stay inside the project.
  const p = tmpProject({
    'plugin/package.json': { source: '../shared/main.ts' },
    'shared/main.ts': '', // exists relative to plugin/ via ..
    'plugin/src/index.ts': '', // the safe fallback
  });
  try {
    assert.equal(detectEntry(join(p.dir, 'plugin')), 'src/index.ts');
  } finally {
    p.cleanup();
  }
});

test('detectEntry normalizes a leading-slash package source to a project-relative path', () => {
  // "source":"/src/main.ts" resolves under cwd (path.join drops the leading
  // slash) but must be RETURNED relative, else esbuild/fallow target the FS root.
  const p = tmpProject({ 'package.json': { source: '/src/main.ts' }, 'src/main.ts': '' });
  try {
    assert.equal(detectEntry(p.dir), 'src/main.ts'); // not '/src/main.ts'
  } finally {
    p.cleanup();
  }
});

test('detectEntry prefers main.* over an index.* barrel when a manifest is present (Obsidian)', () => {
  // An Obsidian plugin with both a helper src/index.ts and the real src/main.ts:
  // the manifest flips the scan to main so the build bundles the Plugin entry.
  const obs = tmpProject({ 'manifest.json': { id: 'x' }, 'src/index.ts': '', 'src/main.ts': 'export default class {}' });
  const generic = tmpProject({ 'src/index.ts': '', 'src/main.ts': '' });
  try {
    assert.equal(detectEntry(obs.dir), 'src/main.ts'); // manifest present -> main wins
    assert.equal(detectEntry(generic.dir), 'src/index.ts'); // no manifest -> index first
  } finally {
    obs.cleanup();
    generic.cleanup();
  }
});

test('detect treats a root-entry repo (no manifest, no src/) as an existing app', () => {
  // package.json#source names a root main.ts that hasSourceFiles (src/-only) misses.
  const rootEntry = tmpProject({ 'package.json': { source: 'main.ts' }, 'main.ts': 'export default class {}' });
  const empty = tmpProject({ 'package.json': { name: 'x' } });
  try {
    assert.equal(detect(rootEntry.dir).obsidianAppPresent, true);
    assert.equal(detect(empty.dir).obsidianAppPresent, false); // no real entry -> greenfield
  } finally {
    rootEntry.cleanup();
    empty.cleanup();
  }
});

test('detect flags an existing .npmrc unless it actively sets tag-version-prefix empty', () => {
  const without = tmpProject({ '.npmrc': 'save-exact=true\n' });
  const emptyQuoted = tmpProject({ '.npmrc': 'tag-version-prefix=""\n' });
  const emptyBare = tmpProject({ '.npmrc': 'tag-version-prefix=\n' });
  const nonEmpty = tmpProject({ '.npmrc': 'tag-version-prefix=v\n' }); // npm's default -> still needs fixing
  const commented = tmpProject({ '.npmrc': '# tag-version-prefix=""\nsave-exact=true\n' });
  const none = tmpProject({});
  try {
    assert.equal(detect(without.dir).npmrcNeedsTagPrefix, true);
    assert.equal(detect(emptyQuoted.dir).npmrcNeedsTagPrefix, false); // "" -> satisfied
    assert.equal(detect(emptyBare.dir).npmrcNeedsTagPrefix, false); // bare = -> satisfied
    assert.equal(detect(nonEmpty.dir).npmrcNeedsTagPrefix, true); // =v is NOT satisfied
    assert.equal(detect(commented.dir).npmrcNeedsTagPrefix, true); // a comment does not count
    assert.equal(detect(none.dir).npmrcNeedsTagPrefix, false); // no .npmrc
  } finally {
    for (const p of [without, emptyQuoted, emptyBare, nonEmpty, commented, none]) p.cleanup();
  }
});

test('detect flags a JS-only src tree as an existing app (brownfield, no manifest)', () => {
  // A repo whose only source is src/main.js must be brownfield, or setup writes
  // the sample TS app and points the build at a nonexistent src/main.ts.
  const jsOnly = tmpProject({ 'src/main.js': 'module.exports = {};' });
  try {
    assert.equal(detect(jsOnly.dir).obsidianAppPresent, true);
  } finally {
    jsOnly.cleanup();
  }
});

test('detectEntry finds a JS/JSX app entrypoint, not only the .ts variant', () => {
  const jsApp = tmpProject({ 'src/app.jsx': '' });
  try {
    assert.equal(detectEntry(jsApp.dir), 'src/app.jsx');
  } finally {
    jsApp.cleanup();
  }
});

test('detectEntry strips a leading ./ and still skips ./dist build paths', () => {
  const srcDot = tmpProject({ 'package.json': { source: './src/index.ts' }, 'src/index.ts': '' });
  const distDot = tmpProject({ 'package.json': { main: './dist/index.js' }, 'dist/index.js': '' });
  try {
    assert.equal(detectEntry(srcDot.dir), 'src/index.ts'); // ./ normalized away
    assert.equal(detectEntry(distDot.dir), 'src/index.ts'); // ./dist still recognized as build -> fallback
  } finally {
    srcDot.cleanup();
    distDot.cleanup();
  }
});

test('detectEntry finds a lib/ entry (expanded source-dir candidates)', () => {
  const p = tmpProject({ 'lib/index.ts': '' });
  try {
    assert.equal(detectEntry(p.dir), 'lib/index.ts');
  } finally {
    p.cleanup();
  }
});

test('detectEntry uses main/module for a build-less package, but not a dist build path', () => {
  const core = tmpProject({ 'package.json': { main: 'core/index.js' }, 'core/index.js': '' });
  const dist = tmpProject({ 'package.json': { main: 'dist/index.js' }, 'dist/index.js': '' });
  try {
    assert.equal(detectEntry(core.dir), 'core/index.js'); // non-build dir -> used
    assert.equal(detectEntry(dist.dir), 'src/index.ts'); // dist is build output -> fallback
  } finally {
    core.cleanup();
    dist.cleanup();
  }
});

test('detectEntry matches modern module extensions (.mts/.cts/.cjs)', () => {
  const mts = tmpProject({ 'src/index.mts': '' });
  try {
    assert.equal(detectEntry(mts.dir), 'src/index.mts');
  } finally {
    mts.cleanup();
  }
});

test('detect flags an existing flat ESLint config in another extension', () => {
  const p = tmpProject({ 'eslint.config.js': 'export default [];\n' });
  try {
    assert.equal(detect(p.dir).eslintFlatConfig, true);
  } finally {
    p.cleanup();
  }
});

test('detect flags a user eslint.config.mjs but not the engine\'s own (marker)', () => {
  const theirs = tmpProject({ 'eslint.config.mjs': 'export default [];\n' });
  const ours = tmpProject({ 'eslint.config.mjs': '// Generated by project-setup\nexport default [];\n' });
  try {
    assert.equal(detect(theirs.dir).eslintConfigMjs, true);
    assert.equal(detect(ours.dir).eslintConfigMjs, false);
  } finally {
    theirs.cleanup();
    ours.cleanup();
  }
});

test('detect surfaces brownfield collision signals', () => {
  const p = tmpProject({
    'package.json': {
      scripts: { lint: 'eslint src' },
      'simple-git-hooks': { 'pre-commit': 'lint-staged' },
    },
    '.eslintrc.json': '{}',
    '.github/workflows/ci.yml': 'name: ci\n',
    'jest.config.js': 'module.exports = {};\n',
  });
  try {
    const s = detect(p.dir);
    assert.equal(s.scripts.lint, 'eslint src');
    assert.equal(s.preCommitHook, 'lint-staged'); // an existing hook mergeJson would keep
    assert.equal(s.legacyEslintrc, true);
    assert.equal(s.ciWorkflow, true);
    assert.equal(s.jestConfig, true);
  } finally {
    p.cleanup();
  }
});

test('detect.preCommitHook is undefined (never throws) when simple-git-hooks is absent or a non-object', () => {
  // Optional chaining on a string/missing value yields undefined, not a crash.
  const none = tmpProject({ 'package.json': { name: 'x' } });
  const weird = tmpProject({ 'package.json': { 'simple-git-hooks': 'husky' } });
  try {
    assert.equal(detect(none.dir).preCommitHook, undefined);
    assert.equal(detect(weird.dir).preCommitHook, undefined);
  } finally {
    none.cleanup();
    weird.cleanup();
  }
});

test("detect does not flag the engine's own marked test config as hand-written", () => {
  const p = tmpProject({ 'jest.config.mjs': '// Generated by project-setup\nexport default {};\n' });
  try {
    assert.equal(detect(p.dir).jestConfig, false);
  } finally {
    p.cleanup();
  }
});

test('detect recognizes a package.json jest key and the .cts/.cjs config forms', () => {
  const pkgJest = tmpProject({ 'package.json': { jest: { testEnvironment: 'node' } } });
  const cts = tmpProject({ 'jest.config.cts': 'export default {};\n' });
  const viteCjs = tmpProject({ 'vite.config.cjs': 'module.exports = {};\n' });
  try {
    assert.equal(detect(pkgJest.dir).jestConfig, true); // package.json#jest -> Jest "Multiple configs" risk
    assert.equal(detect(cts.dir).jestConfig, true); // jest.config.cts
    assert.equal(detect(viteCjs.dir).viteConfig, true); // vite.config.cjs
  } finally {
    pkgJest.cleanup();
    cts.cleanup();
    viteCjs.cleanup();
  }
});

test('detect flags an existing fallow config in another form (.fallowrc.jsonc / fallow.toml)', () => {
  const jsonc = tmpProject({ '.fallowrc.jsonc': '{}\n' });
  const toml = tmpProject({ 'fallow.toml': '\n' });
  const none = tmpProject({});
  try {
    assert.equal(detect(jsonc.dir).fallowConfig, true);
    assert.equal(detect(toml.dir).fallowConfig, true);
    assert.equal(detect(none.dir).fallowConfig, false);
  } finally {
    jsonc.cleanup();
    toml.cleanup();
    none.cleanup();
  }
});

test('detect exposes per-runner config signals (scoped standdown is decided at plan time)', () => {
  const jestP = tmpProject({ 'jest.config.ts': 'export default {};\n' });
  const vitestP = tmpProject({ 'vitest.config.ts': 'export default {};\n' });
  const viteP = tmpProject({ 'vite.config.ts': 'export default {};\n' });
  try {
    assert.equal(detect(jestP.dir).jestConfig, true);
    assert.equal(detect(jestP.dir).vitestConfig, false);
    assert.equal(detect(vitestP.dir).vitestConfig, true);
    assert.equal(detect(viteP.dir).viteConfig, true);
    assert.equal(detect(viteP.dir).jestConfig, false); // Jest ignores vite.config
  } finally {
    jestP.cleanup();
    vitestP.cleanup();
    viteP.cleanup();
  }
});

test('obsidianAppPresent is a directory scan: any src source (or manifest) means an existing plugin', () => {
  const empty = tmpProject({ 'package.json': { name: 'x' } });
  const nested = tmpProject({ 'src/core/logging/Logger.ts': 'export class Logger {}\n' });
  const manifestOnly = tmpProject({ 'manifest.json': { id: 'x' } });
  try {
    assert.equal(detect(empty.dir).obsidianAppPresent, false); // greenfield
    assert.equal(detect(nested.dir).obsidianAppPresent, true); // a deep src source counts
    assert.equal(detect(manifestOnly.dir).obsidianAppPresent, true); // manifest counts
  } finally {
    empty.cleanup();
    nested.cleanup();
    manifestOnly.cleanup();
  }
});
