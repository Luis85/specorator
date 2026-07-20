// .claude/skills/project-setup/scripts/lib/apply.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { backupFile, mergeJsonFile, mergeTextLines } from './merge.mjs';

export function apply(actions, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const dryRun = opts.dryRun ?? false;
  const backupDir = opts.backupDir ?? join(cwd, '.project-setup-backup', String(Date.now()));
  const exec =
    opts.exec ?? ((cmd, args, options) => execFileSync(cmd, args, { stdio: 'inherit', ...options }));
  const changed = [];
  const planned = [];
  const notices = [];

  for (const action of actions) {
    if (action.type === 'notice') {
      // Surfaced to the user (collisions, skipped CI) — never a file mutation.
      notices.push({ level: action.level ?? 'warn', message: action.message });
      continue;
    }
    if (action.type === 'installDeps') {
      // Always include in the plan so dry-run/plan previews the install side effect.
      // NEVER push to `changed`: install is an effect, not a tracked file mutation,
      // so a converged re-apply stays a no-op and the baseline hook does not re-run.
      planned.push('(install)');
      // Install when package.json changed this run OR the recorded install is no
      // longer current: the marker is absent (never/failed install — written only
      // AFTER success), it records a DIFFERENT package manager than the one now
      // selected (a changed `packageManager` needs the new manager's lockfile), or
      // `node_modules` was removed. So a re-apply after a failed install, a manager
      // switch, or a deleted `node_modules` reconverges instead of falsely reporting
      // installed deps; a fully-converged re-apply (marker matches, deps present,
      // no change) stays a no-op. The marker stores the manager name so the compare
      // works.
      const marker = join(cwd, '.project-setup-backup', '.installed');
      const installedWith = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : null;
      // "Deps present" = the manager's install artifact exists: `node_modules` for
      // the node-linker (npm/pnpm/bun/Yarn node-modules), OR the Plug'n'Play loader
      // (`.pnp.cjs`/`.pnp.js`) for Yarn PnP, which installs WITHOUT a node_modules.
      // Requiring node_modules unconditionally would make a converged PnP re-apply
      // reinstall on every run (and fail offline).
      const depsPresent =
        existsSync(join(cwd, 'node_modules')) ||
        existsSync(join(cwd, '.pnp.cjs')) ||
        existsSync(join(cwd, '.pnp.js'));
      const installCurrent = installedWith === action.packageManager && depsPresent;
      if (!dryRun && (changed.includes('package.json') || !installCurrent)) {
        exec(action.packageManager, ['install'], { cwd });
        mkdirSync(dirname(marker), { recursive: true });
        writeFileSync(marker, action.packageManager);
      }
      continue;
    }

    const abs = join(cwd, action.path);
    planned.push(action.path); // every action is part of the plan

    if (action.type === 'mergeText') {
      const existing = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
      const { text, changed: didChange } = mergeTextLines(existing, action.lines, action.marker);
      if (didChange && !dryRun) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, text);
      }
      if (didChange) changed.push(action.path);
    } else if (action.type === 'mergeJson') {
      const { text, changed: didChange } = mergeJsonFile(abs, action.patch, undefined, action.force);
      if (didChange && !dryRun) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, text);
      }
      if (didChange) changed.push(action.path);
    } else if (action.type === 'writeFile') {
      const exists = existsSync(abs);
      if (action.mode === 'skip-if-exists' && exists) continue;
      if (exists && readFileSync(abs, 'utf8') === action.content) continue; // idempotent
      if (action.mode === 'overwrite-backup' && exists && !dryRun) backupFile(abs, backupDir, cwd);
      if (!dryRun) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, action.content);
      }
      changed.push(action.path);
    } else {
      throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  return { changed, planned, dryRun, notices };
}
