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
  return id || 'my-plugin';
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
      status: str(prd.status).trim() || 'draft',
      created: str(prd.created).trim(),
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
