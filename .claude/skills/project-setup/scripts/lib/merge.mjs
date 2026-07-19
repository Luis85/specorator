// .claude/skills/project-setup/scripts/lib/merge.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Additive merge: existing values win on conflict; missing keys are filled;
// arrays union (dedup by structural equality). To REPLACE a value, use a
// backup-overwrite write instead — merge never clobbers user data.
export function deepMerge(base, patch) {
  if (isObject(base) && isObject(patch)) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = k in base ? deepMerge(base[k], v) : v;
    }
    return out;
  }
  if (Array.isArray(base) && Array.isArray(patch)) {
    const out = [...base];
    for (const item of patch) {
      if (!out.some((x) => JSON.stringify(x) === JSON.stringify(item))) out.push(item);
    }
    return out;
  }
  return base === undefined ? patch : base;
}

// `npm init -y` seeds this placeholder `test` script (exits 1). deepMerge keeps the
// base scalar, so a generated gate script would lose to it and `npm test` would be
// dead on arrival for a brand-new project. Treat the exact placeholder as absent so
// the generated script wins — it's never a script anyone wants to keep.
const NPM_INIT_PLACEHOLDER = 'echo "Error: no test specified" && exit 1';

// `current` is optional, for tests that pass an in-memory object instead of reading disk.
export function mergeJsonFile(path, patch, current, force = []) {
  const base = current ?? (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
  const merged = deepMerge(base, patch);
  // `force` lets the patch win over an existing scalar for named keys (deepMerge
  // otherwise keeps the base). A plain key forces a top-level field (e.g. `version`
  // syncing to the manifest); a dotted `scripts.verify` forces one nested key, so a
  // recomputed engine-owned script isn't left stale on re-apply.
  for (const k of force) {
    const dot = k.indexOf('.');
    if (dot !== -1) {
      // Force ONE nested key, splitting on the FIRST dot so a sub-key that itself
      // contains dots (e.g. a nano-staged glob "*.{ts,...}") stays intact — and so
      // sibling keys the user added under the same top-level object survive.
      const top = k.slice(0, dot);
      const sub = k.slice(dot + 1);
      if (isObject(patch[top]) && sub in patch[top]) {
        if (!isObject(merged[top])) merged[top] = {};
        merged[top][sub] = patch[top][sub];
      }
    } else if (k in patch) {
      merged[k] = patch[k];
    }
  }
  // Overwrite an npm-init placeholder script with the generated one (nested under
  // `scripts`, so `force` — top-level only — can't reach it).
  if (isObject(base.scripts) && isObject(patch.scripts) && isObject(merged.scripts)) {
    for (const [k, v] of Object.entries(patch.scripts)) {
      if (base.scripts[k] === NPM_INIT_PLACEHOLDER) merged.scripts[k] = v;
    }
  }
  const changed = JSON.stringify(base) !== JSON.stringify(merged);
  return { merged, changed, text: JSON.stringify(merged, null, 2) + '\n' };
}

export function mergeTextLines(existing, lines, marker) {
  const present = new Set(existing.split('\n').map((l) => l.trim()));
  const additions = lines.filter((l) => !present.has(l.trim()));
  if (additions.length === 0) return { text: existing, changed: false };
  const block = (marker ? [`# ${marker}`] : []).concat(additions).join('\n');
  const sep = existing === '' || existing.endsWith('\n') ? '' : '\n';
  return { text: `${existing}${sep}${block}\n`, changed: true };
}

export function backupFile(absPath, backupDir, cwd) {
  if (!existsSync(absPath)) return null;
  // Path-preserve under backupDir (mirror the file's location relative to cwd)
  // so two files with the same basename never collide; fall back to basename
  // when cwd is not provided.
  const sub = cwd ? relative(cwd, absPath) : basename(absPath);
  const dest = join(backupDir, sub);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(absPath, dest);
  return dest;
}
