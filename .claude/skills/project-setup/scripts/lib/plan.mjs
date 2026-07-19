// .claude/skills/project-setup/scripts/lib/plan.mjs
import {
  planCi, planDocs, planEslint, planFallow, planGithubMcp,
  planInstall, planLoc, planPrds, planReport, planTest,
} from './harness.mjs';
import { obsidianEntry, planObsidian } from './obsidian.mjs';
import { standsDownTestConfig } from './testConfig.mjs';

const ENGINE_VERSION = '0.2.0';

function planGitignore(options) {
  const lines = ['.project-setup-backup/', '.fallow/', 'coverage/'];
  // Obsidian build artifacts (main.js/main.css/styles.css are generated), the
  // per-vault settings file, and the local vault pointer never belong in git.
  if (options?.obsidian) lines.push('node_modules/', 'main.js', 'main.css', 'styles.css', 'data.json', '.env.local');
  return [
    {
      type: 'mergeText',
      path: '.gitignore',
      marker: 'project-setup',
      lines,
    },
  ];
}

function planRunReport(options) {
  // Record only the resolved `options` (the stable desired config). NOT the raw
  // `detected` state: detection changes after the harness installs deps (eslint/
  // fallow/testFramework become present), which would make the report differ on
  // the next apply and break the second-apply no-op (idempotency).
  const report = {
    engine: ENGINE_VERSION,
    options,
  };
  return [
    {
      type: 'writeFile',
      path: 'project-setup.report.json',
      mode: 'overwrite-backup',
      content: JSON.stringify(report, null, 2) + '\n',
    },
  ];
}

function planHarness(options, state) {
  // Obsidian mode swaps the generic eslint/test planners for the plugin-aware
  // ones inside planObsidian; the ratchets, docs, CI, and install are shared.
  if (options.obsidian) {
    return [
      ...planObsidian(options, state),
      ...planFallow(options, state),
      ...planLoc(options, state),
      ...planReport(options, state),
      ...planDocs(options, state),
      ...planCi(options, state),
      ...planGithubMcp(options, state),
      ...planInstall(options, state), // last: deps in package.json first
    ];
  }
  return [
    ...planEslint(options, state),
    ...planFallow(options, state),
    ...planLoc(options, state),
    ...planTest(options, state),
    ...planReport(options, state),
    ...planDocs(options, state),
    ...planCi(options, state),
    ...planGithubMcp(options, state),
    ...planInstall(options, state), // last: deps in package.json first
  ];
}

// A hand-written test config (or a Vite config when Vitest is the resolved runner)
// can't be safely baselined, so the coverage gate stands down everywhere
// (planTest, planCi, initBaselines, verify) to keep day-one CI green.
export function effectiveOptions(options, state) {
  if (!standsDownTestConfig(options, state)) return options;
  return { ...options, guardrails: { ...(options.guardrails ?? {}), coverageFloors: false } };
}

// Ordered composition of pure sub-planners.
export function plan(options, state) {
  const opts = effectiveOptions(options, state);
  // Obsidian mode is greenfield: the entry is always src/main.ts, which the shared
  // fallow/LOC planners target. A fresh repo's detected entry may be a src/index.ts
  // fallback that never gets written, so override it (and mark it existing — the
  // scaffold writes it) for those planners.
  const st = opts.obsidian ? { ...state, entry: obsidianEntry(), entryExists: true } : state;
  return [
    ...planGitignore(opts, st),
    ...planRunReport(opts),
    ...planHarness(opts, st),
    // Product-vision PRDs from the setup questionnaire — mode-agnostic, so both
    // the Obsidian and generic harnesses get docs/prds/ when answers include them.
    ...planPrds(opts, st),
  ];
}
