#!/usr/bin/env node
// Marketplace pre-flight gate. Run via: npm run release:preflight
// Called automatically by the /publish-release skill before any version bump.
// Exit 0 = all checks passed. Exit 1 = one or more errors (see stderr).

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, extname } from 'node:path'

const errors = []
const warnings = []

function fail(label, message) {
  errors.push(`  ✗ [${label}] ${message}`)
}

function warn(label, message) {
  warnings.push(`  ⚠ [${label}] ${message}`)
}

// ── 1. Required repo-root files ───────────────────────────────────────────────
if (!existsSync('README.md')) fail('docs', 'README.md missing at repo root')

const licenseVariants = ['LICENSE', 'LICENSE.md', 'LICENSE.txt']
if (!licenseVariants.some(existsSync)) {
  fail('docs', 'LICENSE file missing at repo root (expected LICENSE, LICENSE.md, or LICENSE.txt)')
}

// ── 2. No sample-plugin remnants ─────────────────────────────────────────────
const SAMPLE_PATTERNS = [
  { re: /\bSampleModal\b/, label: 'SampleModal class' },
  { re: /\bSampleSettingTab\b/, label: 'SampleSettingTab class' },
]

function walkTs(dir, results = []) {
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) { walkTs(p, results); continue }
    if (extname(entry.name) === '.ts') results.push(p)
  }
  return results
}

const srcFiles = walkTs('src')
for (const { re, label } of SAMPLE_PATTERNS) {
  const hits = srcFiles.filter(f => re.test(readFileSync(f, 'utf8')))
  if (hits.length > 0) {
    fail('sample-remnants', `${label} found in: ${hits.join(', ')}`)
  }
}

// ── 3. Version alignment (manifest / package.json / versions.json) ────────────
try {
  execSync('node scripts/validate-manifest.js', { stdio: 'pipe' })
} catch (e) {
  fail('manifest-validation', e.stderr?.toString().trim() ?? e.message)
}

// ── 4. Description quality (beyond the length check in validate-manifest.js) ──
try {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
  const desc = typeof manifest.description === 'string' ? manifest.description : ''

  if (/\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(desc)) {
    fail('description', 'manifest.description contains emoji characters')
  }
  if (/^this plugin\b/i.test(desc.trim())) {
    fail('description', 'manifest.description must not begin with "This plugin"')
  }
  if (!desc.trim().endsWith('.')) {
    fail('description', 'manifest.description must end with a period (.)')
  }
} catch (e) {
  if (e.code !== 'ENOENT') fail('description', e.message)
}

// ── 5. funding_url advisory ───────────────────────────────────────────────────
try {
  const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
  if ('fundingUrl' in manifest) {
    warn(
      'funding_url',
      'manifest.fundingUrl is set — confirm the link points to an active donation page, or remove the field',
    )
  }
} catch { /* ignore — manifest parse errors already caught above */ }

// ── 6. Release assets present (post-build check) ─────────────────────────────
const REQUIRED_ASSETS = ['main.js', 'manifest.json', 'styles.css']
for (const asset of REQUIRED_ASSETS) {
  if (!existsSync(asset)) {
    fail('release-assets', `${asset} missing — run npm run build first`)
  } else if (statSync(asset).size === 0) {
    fail('release-assets', `${asset} is empty`)
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
if (warnings.length > 0) {
  console.warn(`\nPre-flight warnings (${warnings.length}):`)
  for (const w of warnings) console.warn(w)
}

if (errors.length > 0) {
  console.error(`\nPre-flight failed (${errors.length} error${errors.length === 1 ? '' : 's'}):`)
  for (const e of errors) console.error(e)
  process.exit(1)
}

console.log('✓ Pre-flight passed.')
