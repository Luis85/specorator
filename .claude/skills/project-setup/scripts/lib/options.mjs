// .claude/skills/project-setup/scripts/lib/options.mjs
import { readFileSync } from 'node:fs';

import { safePackageManager } from './packageManager.mjs';

const DEFAULTS = {
  packageManager: null, // null => use detected
  typescript: null, // null => use detected
  testFramework: null, // null => use detected
  guardrails: { fallowRatchet: true, locGuard: true, eslintSeverityStaging: true, coverageFloors: true, ci: true, cssGuard: true },
  // integrate/mcp gate generated files; fixApply is orchestration-only (SKILL.md), engine ignores.
  github: { integrate: false, mcp: false, fixApply: false },
  // scaffold gates the docs; grill is orchestration-only (SKILL.md/references), engine ignores.
  docs: { scaffold: true, grill: false },
  // Hooks are OPT-IN (all default off): sessionStart installs deps on Claude Code
  // web sessions; qualityGate runs typecheck+lint on Claude's Stop; preCommit wires
  // lint-staged via a git pre-commit hook. Nothing installs a hook unless asked.
  hooks: { sessionStart: false, qualityGate: false, preCommit: false },
  locCap: 500,
  // null => plain JS/TS repo. An object switches on the Obsidian-plugin harness
  // (see sanitizeObsidian for the answer shape and references/obsidian-plugin.md).
  obsidian: null,
  // Product-requirement docs authored via the setup questionnaire (SKILL.md §
  // product vision). Each entry renders to docs/prds/<id>-<slug>.md; empty => none.
  prds: [],
};

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function mergeDefaults(base, patch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch ?? {})) {
    out[k] = isObject(base[k]) && isObject(v) ? mergeDefaults(base[k], v) : v;
  }
  return out;
}

// Marketplace policy: lowercase kebab ids without "obsidian" in them. The id is
// also templated into generated TypeScript/CSS (view type, class prefix), so
// anything outside [a-z0-9-] must not survive.
function sanitizeObsidianId(raw) {
  const id = String(raw ?? '')
    .toLowerCase()
    .replace(/obsidian/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  // Fallback must itself be marketplace-valid ("plugin" is a forbidden word), so a
  // no-id answer doesn't produce a manifest that fails obsidianmd on day one.
  return id || 'my-notes';
}

function cleanString(v, fallback) {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

// Normalize the obsidian answer block. Strings that land in manifest.json are
// JSON-encoded at render time, so they only need trimming here; id and
// minAppVersion ARE rendered into executables/JSON verbatim and get hardened.
function sanitizeObsidian(raw) {
  if (!isObject(raw)) return null;
  const id = sanitizeObsidianId(raw.id);
  const fallbackName = id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  // 1.7.2 is the floor for the workspace APIs the scaffold uses (revealLeaf) —
  // the obsidianmd/no-unsupported-api lint rule enforces the match.
  const minAppVersion = /^\d+\.\d+\.\d+$/.test(String(raw.minAppVersion ?? '')) ? raw.minAppVersion : '1.7.2';
  return {
    id,
    name: cleanString(raw.name, fallbackName),
    description: cleanString(raw.description, 'A starter view with settings, tests, and quality gates.'),
    author: cleanString(raw.author, 'Unknown'),
    authorUrl: cleanString(raw.authorUrl, ''),
    minAppVersion,
    mobile: raw.mobile === true,
    vue: raw.vue !== false,
  };
}

// The community-marketplace manifest rules eslint-plugin-obsidianmd enforces on
// the generated manifest.json — checked up front so a bad answer is rejected with
// guidance during the interview, not discovered as a lint failure after the whole
// scaffold is written. Returns human-readable problems (empty array = valid).
const FORBIDDEN_MANIFEST_WORD = /obsidian|plugin/i;

// True when semver `v` (x.y.z) is strictly below the [maj, min, patch] floor.
function isBelowVersion(v, floor) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v));
  if (!m) return false; // shape is validated/defaulted elsewhere
  const parts = [Number(m[1]), Number(m[2]), Number(m[3])];
  for (let i = 0; i < 3; i++) {
    if (parts[i] !== floor[i]) return parts[i] < floor[i];
  }
  return false;
}

export function validateObsidianFields(o) {
  if (!isObject(o)) return [];
  const problems = [];
  if (FORBIDDEN_MANIFEST_WORD.test(o.name)) {
    problems.push(`Plugin name ${JSON.stringify(o.name)} can't contain "Obsidian" or "Plugin" — the community marketplace forbids both as redundant. Choose a name without them.`);
  }
  if (FORBIDDEN_MANIFEST_WORD.test(o.id)) {
    problems.push(`Plugin id ${JSON.stringify(o.id)} can't contain "obsidian" or "plugin". Use a short slug like "quick-notes".`);
  }
  // The id becomes a CSS class prefix (".<id>-view"); a digit-leading class selector
  // is invalid, so the generated stylesheet would be silently ignored.
  if (/^[0-9]/.test(String(o.id))) {
    problems.push(`Plugin id ${JSON.stringify(o.id)} must start with a letter — it becomes a CSS class prefix (".${o.id}-view") and a digit-leading selector is invalid. Reorder it, e.g. "notes-24".`);
  }
  // The Vue variant's registerViews.ts calls Workspace.revealLeaf (Obsidian ≥ 1.7.2),
  // which obsidianmd/no-unsupported-api enforces against minAppVersion — a lower but
  // syntactically valid floor would fail the fresh scaffold's own lint.
  if (o.vue && isBelowVersion(o.minAppVersion, [1, 7, 2])) {
    problems.push(`minAppVersion ${JSON.stringify(o.minAppVersion)} is below 1.7.2, which the Vue view's revealLeaf API requires. Set it to 1.7.2 or higher (or scaffold without the Vue view).`);
  }
  const d = String(o.description ?? '');
  // Mirror obsidianmd: a forbidden word is reported instead of (not in addition to)
  // the format check, matching the rule's else-if ordering.
  if (FORBIDDEN_MANIFEST_WORD.test(d)) {
    problems.push('Description can\'t contain "Obsidian" or "plugin" (both are redundant to the marketplace). Rephrase without them.');
  } else if (d.length < 10 || d.length > 250 || !/^[A-Z]/.test(d) || !d.endsWith('.') || !/^[A-Za-z0-9\s.,!?'"-]+$/.test(d)) {
    problems.push(`Description must be 10-250 characters, start with a capital letter, end with a period, and use plain text only (no emoji or special characters). Got ${JSON.stringify(d)}.`);
  }
  return problems;
}

// Normalize the PRD list from the questionnaire. id/title are templated into a
// FILE PATH and YAML frontmatter, so coerce every field to a safe primitive and
// force id to prd-<digits> (auto-numbered when absent). Title/status/goals stay
// prose — the doc renderer JSON-encodes the title and escapes the index rows.
function sanitizePrds(raw) {
  if (!Array.isArray(raw)) return [];
  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  return raw.slice(0, 50).map((p, i) => {
    const prd = isObject(p) ? p : {};
    const id = /^prd-\d{1,4}$/.test(str(prd.id)) ? str(prd.id) : `prd-${String(i).padStart(3, '0')}`;
    return {
      id,
      title: str(prd.title).trim() || (i === 0 ? 'Product Vision' : 'Untitled'),
      // status/created render RAW into YAML frontmatter (title is JSON-encoded at
      // render time; these stay plain scalars), so strip anything that could break
      // the scalar or inject a key — newlines and colons in particular.
      status: str(prd.status).replace(/[^\w .-]/g, '').trim() || 'draft',
      created: str(prd.created).replace(/[^\w.+-]/g, '').trim(),
      problem: str(prd.problem).trim(),
      vision: str(prd.vision).trim(),
      goals: Array.isArray(prd.goals) ? prd.goals.map(str).map((g) => g.trim()).filter(Boolean).slice(0, 30) : [],
      notes: str(prd.notes).trim(),
    };
  });
}

export function loadOptions(configPath) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    throw new Error(`Could not read answers JSON at ${configPath}: ${e.message}`);
  }
  if (!isObject(raw)) throw new Error('answers JSON must be a JSON object.');
  const options = mergeDefaults(DEFAULTS, raw);
  // Harden values that get rendered into generated executables. locCap is
  // templated raw into check-loc.mjs (`const MAX_LOC = <locCap>`), so a non-numeric
  // value would inject code — force a safe positive integer.
  const cap = Number(options.locCap);
  options.locCap = Number.isInteger(cap) && cap > 0 && cap <= 1_000_000 ? cap : 500;
  options.obsidian = sanitizeObsidian(options.obsidian);
  options.prds = sanitizePrds(options.prds);
  return options;
}

// Resolve install-volatile fields against the FIRST apply's resolution (explicit
// answer -> prior report -> detected -> default), so a post-install re-detect can't
// flip them (which would rewrite the report / re-baseline). packageManager is also
// whitelisted here — it's exec'd. Shared by `apply` and `verify`.
export function freezeOptions(options, frozen, state) {
  options.testFramework = options.testFramework ?? frozen?.testFramework ?? state?.testFramework ?? 'jest';
  options.packageManager = safePackageManager(options.packageManager ?? frozen?.packageManager ?? state?.packageManager ?? 'npm');
  options.typescript = options.typescript ?? frozen?.typescript ?? state?.typescript ?? true;
  // The Obsidian harness is Vitest + TypeScript by construction (single test
  // lane, vue-tsc/tsc typecheck gate) — a detected jest dep must not flip it.
  if (options.obsidian) {
    options.testFramework = 'vitest';
    options.typescript = true;
  }
  return options;
}
