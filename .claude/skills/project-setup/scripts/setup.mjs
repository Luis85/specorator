// .claude/skills/project-setup/scripts/setup.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { apply } from './lib/apply.mjs';
import { initBaselines } from './lib/baseline.mjs';
import { detect } from './lib/detect.mjs';
import { freezeOptions, hostNodeProblem, loadOptions, validateObsidianFields } from './lib/options.mjs';
import { effectiveOptions, plan } from './lib/plan.mjs';
import { runGates } from './lib/verify.mjs';

const USAGE = `project-setup engine

Usage: node setup.mjs <command> [options]

Commands:
  detect                 Print project-state JSON. No mutation.
  plan   --config <f>    Print the ordered action plan. No mutation.
  apply  --config <f>    Execute the plan idempotently. --dry-run to preview.
  report                 Write the advisory quality report (quality-report.md + .json).
  verify                 Run the enabled gates once; non-zero exit on failure.
  refresh-pins           Update pins.json to the latest npm releases (network).

Options:
  --config <file>        JSON options (answers).
  --dry-run              Plan only; never mutate.
  --backup-dir <dir>     Override backup location (default .project-setup-backup).
  -h, --help             Show this help.
`;

function readPriorReport(cwd) {
  try {
    return JSON.parse(readFileSync(join(cwd, 'project-setup.report.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') args.flags.help = true;
    else if (a === '--dry-run') args.flags.dryRun = true;
    else if (a === '--config') args.flags.config = argv[++i];
    else if (a === '--backup-dir') args.flags.backupDir = argv[++i];
    else if (a.startsWith('--')) args.flags[a.slice(2)] = true;
    else args._.push(a);
  }
  return args;
}

export async function cli(argv, io = {}) {
  const out = io.stdout ?? ((s) => process.stdout.write(s));
  const err = io.stderr ?? ((s) => process.stderr.write(s));
  const args = parseArgs(argv);
  const cmd = args._[0];

  if (args.flags.help || !cmd) {
    out(USAGE);
    return 0;
  }

  switch (cmd) {
    case 'detect': {
      out(JSON.stringify(detect(io.cwd ?? process.cwd()), null, 2) + '\n');
      return 0;
    }
    case 'plan':
    case 'apply': {
      const cwd = io.cwd ?? process.cwd();
      if (!args.flags.config) {
        err('--config is required for plan/apply.\n');
        return 2;
      }
      let options;
      try {
        options = loadOptions(resolve(cwd, args.flags.config));
      } catch (e) {
        err(`${e.message}\n`);
        return 2;
      }
      const state = detect(cwd);
      // The prior apply's recorded options let planners reconcile engine-owned
      // config (Claude hooks, pre-commit) against exactly what WE wrote last time,
      // instead of guessing ownership from command text.
      const priorOptions = readPriorReport(cwd)?.options;
      state.priorOptions = priorOptions;
      // Freeze install-volatile fields so a post-install re-detect can't flip them
      // and break the "second apply is a no-op" contract (see freezeOptions).
      freezeOptions(options, priorOptions, state);
      // Reject marketplace-invalid manifest answers with guidance BEFORE writing a
      // scaffold that would fail its own obsidianmd lint on day one (name/id/
      // description forbidden words + description formatting).
      const manifestProblems = validateObsidianFields(options.obsidian);
      if (manifestProblems.length > 0) {
        err('Fix these manifest answers before scaffolding:\n' + manifestProblems.map((p) => `  - ${p}`).join('\n') + '\n');
        return 2;
      }
      const actions = plan(options, state);
      const dryRun = cmd === 'plan' || args.flags.dryRun === true;
      // The engine runs the harness install and gates, whose pinned tooling rejects an
      // old host Node: fallow 3 needs >=22 on every apply, and Obsidian's jsdom/vite
      // raises that to >=22.13. Refuse before apply writes files that would then fail
      // mid-install (engine-strict) or at a later gate, leaving a partial workspace.
      // Only on a real mutation — plan/dry-run preview on any Node.
      if (!dryRun) {
        const nodeProblem = hostNodeProblem(options, io.nodeVersion ?? process.versions.node);
        if (nodeProblem) {
          err(nodeProblem + '\n');
          return 2;
        }
      }
      const backupDir = args.flags.backupDir ? resolve(cwd, args.flags.backupDir) : undefined;
      // Must be a STRICT subdirectory: `--backup-dir .` resolves to cwd, which would
      // make `backupFile` copy each file onto itself (no real backup) before the
      // overwrite. `startsWith(cwd + sep)` is false for cwd itself, so this rejects
      // the root as well as any path outside the project.
      if (backupDir && !backupDir.startsWith(cwd + sep)) {
        err('--backup-dir must be a subdirectory of the project directory.\n');
        return 2;
      }
      const result = apply(actions, { cwd, dryRun, backupDir, exec: io.exec });
      if (!dryRun) {
        // Call on EVERY apply, not just when files changed: initBaselines is
        // idempotent (per-artifact existence checks), so this completes a baseline
        // left missing by an interrupted apply and no-ops when all already exist.
        // Effective options so baselining matches the plan (coverage gate may be off).
        // result.changed lets it re-baseline quality when .fallowrc.json was upgraded
        // (the analysis graph changed, so the old baseline is no longer comparable).
        initBaselines(cwd, effectiveOptions(options, state), io.exec, result.changed);
      }
      if (dryRun) {
        // Dedupe (package.json is touched by several planners) and name the
        // install step, so the preview reads as an approvable change list.
        const unique = [...new Set(result.planned)].map((p) =>
          p === '(install)' ? `install dependencies (${options.packageManager ?? 'npm'})` : p);
        out(`Planned ${unique.length} change(s):\n` + unique.map((p) => `  ${p}`).join('\n') + '\n');
      } else if (result.changed.length === 0) {
        out('No changes — project already converged.\n');
      } else {
        // Dedupe like the dry-run branch: package.json is patched by several
        // planners, so it lands in `changed` repeatedly.
        const applied = [...new Set(result.changed)];
        out(`Applied ${applied.length} change(s):\n` + applied.map((p) => `  ${p}`).join('\n') + '\n');
      }
      // Separate real collisions (your file/script kept; a gate won't run) from
      // routine next steps (info) so a clean greenfield apply doesn't end with a
      // scary "review these" block.
      const warnings = (result.notices ?? []).filter((n) => n.level !== 'info');
      const infos = (result.notices ?? []).filter((n) => n.level === 'info');
      if (warnings.length) {
        out('\nNotices — your file/script was kept; the generated one did NOT apply (review):\n' + warnings.map((n) => `  - ${n.message}`).join('\n') + '\n');
      }
      if (infos.length) {
        out('\nNext steps:\n' + infos.map((n) => `  - ${n.message}`).join('\n') + '\n');
      }
      return 0;
    }
    case 'refresh-pins': {
      // Deliberate, network-using maintenance: resolve every pin to its latest
      // release so a fresh setup installs current dependencies. A few pins are
      // capped to a plugin's declared peer range (e.g. TypeScript to
      // typescript-eslint, @eslint/js to eslint-plugin-obsidianmd) because tool
      // majors routinely ship before the lint stack supports them. Commit the diff.
      const pinsPath = join(dirname(fileURLToPath(import.meta.url)), 'pins.json');
      const pins = JSON.parse(readFileSync(pinsPath, 'utf8'));
      const view = (...viewArgs) =>
        execFileSync('npm', ['view', ...viewArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const failures = [];
      // Pins whose latest release routinely outruns a plugin that declares them
      // as a peer: resolve each to the newest version WITHIN that plugin's peer
      // range instead of @latest, so a fresh setup can't install an unsatisfiable
      // pair. Auto-unblocks when the plugin widens its peer range.
      // Order matters: a host must be resolved before any dep capped against it,
      // so `obsidian` precedes the @codemirror/* pair it hosts.
      const capped = {
        typescript: 'typescript-eslint',
        '@eslint/js': 'eslint-plugin-obsidianmd',
        '@eslint/json': 'eslint-plugin-obsidianmd',
        obsidian: 'eslint-plugin-obsidianmd',
        '@codemirror/view': 'obsidian',
        '@codemirror/state': 'obsidian',
      };
      for (const name of Object.keys(pins)) {
        if (name in capped) continue; // resolved within a peer range below
        try {
          const v = view(`${name}@latest`, 'version');
          if (/^\d+\.\d+\.\d+$/.test(v)) pins[name] = v;
          else failures.push(`${name}: unexpected version "${v}"`);
        } catch {
          failures.push(`${name}: npm view failed`);
        }
      }
      for (const [dep, host] of Object.entries(capped)) {
        try {
          const range = view(`${host}@${pins[host]}`, `peerDependencies.${dep}`);
          // `npm view <dep>@"<range>" version --json` returns the matching
          // versions as a JSON array (or a bare string for a single match).
          const matches = JSON.parse(view(`${dep}@${range || 'latest'}`, 'version', '--json') || '[]');
          const version = Array.isArray(matches) ? matches.at(-1) : matches;
          if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) pins[dep] = version;
          else failures.push(`${dep}: could not resolve within the ${host} peer range`);
        } catch {
          failures.push(`${dep}: could not resolve within the ${host} peer range (kept current pin)`);
        }
      }
      writeFileSync(pinsPath, JSON.stringify(pins, null, 2) + '\n');
      out(`Updated ${pinsPath}\n`);
      if (failures.length) {
        err('Kept the previous pin for:\n' + failures.map((f) => `  - ${f}`).join('\n') + '\n');
      }
      out('Re-run your setup (plan/apply) and smoke the result — new majors can change tool behavior.\n');
      return failures.length ? 1 : 0;
    }
    case 'report': {
      const cwd = io.cwd ?? process.cwd();
      const exec = io.exec ?? ((c, a, o) => execFileSync(c, a, { stdio: 'inherit', ...o }));
      // Run the GENERATED report file directly (not the `report` npm script, which a
      // brownfield repo may have shadowed). `yarn node` carries Yarn PnP's loader for
      // the report's require.resolve('fallow/bin/fallow'); bare node elsewhere.
      const [bin, cargs] = detect(cwd).packageManager === 'yarn'
        ? ['yarn', ['node', 'scripts/quality-report.mjs']]
        : ['node', ['scripts/quality-report.mjs']];
      exec(bin, cargs, { cwd, stdio: 'inherit' });
      return 0;
    }
    case 'verify': {
      const cwd = io.cwd ?? process.cwd();
      if (!args.flags.config) {
        err('--config is required for verify.\n');
        return 2;
      }
      let options;
      try {
        options = loadOptions(resolve(cwd, args.flags.config));
      } catch (e) {
        err(`${e.message}\n`);
        return 2;
      }
      const state = detect(cwd);
      // Same resolution as apply, so verify runs the gates with the PM that
      // installed the harness and effectiveOptions sees the resolved runner.
      freezeOptions(options, readPriorReport(cwd)?.options, state);
      // Mirror plan(): a hand-written test config drops the coverage gate here too.
      const res = runGates(cwd, effectiveOptions(options, state), io.exec);
      out(res.ok ? 'All gates passed.\n' : `Gates failed: ${res.failed.join(', ')}\n`);
      return res.ok ? 0 : 1;
    }
    default:
      err(`Unknown command: ${cmd}\n${USAGE}`);
      return 2;
  }
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  cli(process.argv.slice(2)).then((code) => process.exit(code));
}
