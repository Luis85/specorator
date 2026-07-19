// scripts/lib/verify.mjs
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { runScriptArgs } from './packageManager.mjs';

const defaultExec = (cmd, args, opts) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });

// Each guardrail maps to the npm script that gates it. The test gate is ALWAYS
// run (mirroring the generated CI workflow): test:coverage when coverage floors
// are on, else the plain test script — so local verify can't pass while CI fails.
const GATES = [
  ['eslintSeverityStaging', 'lint'],
  ['locGuard', 'check:loc'],
  ['fallowRatchet', 'check:quality'],
];

export function runGates(cwd, options, exec = defaultExec) {
  const g = options.guardrails ?? {};
  const pm = options.packageManager ?? 'npm';
  const failed = [];
  const run = (script) => {
    try {
      const [cmd, cargs] = runScriptArgs(pm, script);
      exec(cmd, cargs, { cwd });
    } catch {
      failed.push(script);
    }
  };
  const gates = [...GATES];
  // The CSS !important ratchet only exists in obsidian mode.
  if (options.obsidian && g.cssGuard) gates.splice(2, 0, ['cssGuard', 'check:css']);
  for (const [flag, script] of gates) {
    if (!g[flag]) continue;
    // The fallow ratchet is defined for ./coverage ABSENT (matching CI's fresh
    // checkout); clear a stale local coverage dir first so verify is idempotent
    // and can't false-fail with coverage-weighted CRAP.
    if (script === 'check:quality') rmSync(join(cwd, 'coverage'), { recursive: true, force: true });
    run(script);
  }
  run(g.coverageFloors ? 'test:coverage' : 'test'); // always run a test gate, like CI
  if (options.obsidian) {
    // Mirror the generated CI exactly: type + format gates, then prove the
    // release bundle (build + artifact smoke) — local verify must not pass
    // while CI fails.
    run('typecheck');
    run('format:check');
    run('build');
    run('check:artifacts');
  }
  return { ok: failed.length === 0, failed };
}
