#!/usr/bin/env node
// @ts-check
// Marketplace gate checks. Run before every Specorator release.
// Usage: npm run release:preflight
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, extname } from 'node:path'

/** @type {string[]} */
const errors = []
/** @type {string[]} */
const warnings = []

// Pass --check-tag when manifest.version is the post-bump candidate. Without
// it the already-tagged check is skipped — before the bump, manifest.version
// is still the last released version, so the check would always fail.
const checkTag = process.argv.includes('--check-tag')

/**
 * @param {string} label
 * @param {string} message
 */
function fail(label, message) {
  errors.push(`  ✗ [${label}] ${message}`)
}

/**
 * @param {string} label
 * @param {string} message
 */
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
{
  const SAMPLE_PATTERNS = [/\bSampleModal\b/, /\bSampleSettingTab\b/]

  /**
   * @param {string} dir
   * @param {string[]} acc
   * @returns {string[]}
   */
  function walkTs(dir, acc = []) {
    if (!existsSync(dir)) return acc
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) { walkTs(p, acc); continue }
      if (extname(entry.name) === '.ts') acc.push(p)
    }
    return acc
  }

  const srcFiles = walkTs('src')
  for (const re of SAMPLE_PATTERNS) {
    const hits = srcFiles.filter((f) => re.test(readFileSync(f, 'utf8')))
    if (hits.length > 0) {
      fail('sample-remnants', `${re.source} found in: ${hits.join(', ')}`)
    }
  }
}

// ── 3. Version alignment (manifest / package.json / versions.json) ────────────
{
  const result = spawnSync('node', ['scripts/validate-manifest.js'], { encoding: 'utf8' })
  if (result.status !== 0) {
    fail('manifest-validation', (result.stderr || result.stdout || '').trim())
  }
}

// ── 4. Version tag guard ──────────────────────────────────────────────────────
{
  try {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
    const version = String(manifest.version ?? '')
    if (version) {
      if (version.startsWith('v')) {
        fail('version-tag', `manifest.version starts with "v" (${version}) — Obsidian tags must be plain X.Y.Z`)
      }
      if (checkTag) {
        // Only safe to run after the version bump; manifest.version is the
        // last released version before the bump, so this would always fire.
        const lsRemote = spawnSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${version}`], { encoding: 'utf8' })
        if (lsRemote.status !== 0) throw new Error(lsRemote.stderr || 'git ls-remote failed')
        if (lsRemote.stdout.trim()) {
          fail('version-tag', `Tag ${version} already exists on origin — bump the version before releasing`)
        }
      }
    }
  } catch (e) {
    if (/** @type {any} */ (e).code !== 'ENOENT') fail('version-tag', /** @type {Error} */ (e).message)
  }
}

// ── 5. Description quality ────────────────────────────────────────────────────
{
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
    if (/** @type {any} */ (e).code !== 'ENOENT') fail('description', /** @type {Error} */ (e).message)
  }
}

// ── 6. funding_url advisory ───────────────────────────────────────────────────
{
  try {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
    if ('fundingUrl' in manifest) {
      warn(
        'funding_url',
        'manifest.fundingUrl is set — remove it if you are not actively accepting donations',
      )
    }
  } catch { /* manifest parse errors already reported above */ }
}

// ── 7. Release workflow produces individual files, not a zip ─────────────────
{
  const wfPath = join('.github', 'workflows', 'release.yml')
  if (existsSync(wfPath)) {
    const wf = readFileSync(wfPath, 'utf8')
    for (const asset of ['manifest.json', 'main.js', 'styles.css']) {
      // Match the asset as a standalone line (block-scalar entry) — substring
      // match would false-positive on e.g. `require('./manifest.json')` in run steps.
      const onOwnLine = new RegExp(`^\\s+${asset.replace('.', '\\.')}\\s*$`, 'm')
      if (!onOwnLine.test(wf)) {
        fail('release-workflow', `release.yml does not list required asset "${asset}" in the files block`)
      }
    }
    // Scope archive detection to the files block-scalar; a bare /\.zip/ test on the
    // whole file false-positives on .zip in comments or run: scripts elsewhere.
    const filesBlockMatch = wf.match(/^( +)files:\s*\|\s*\n((?:\1 [^\n]*\n?)*)/m)
    if (filesBlockMatch && /\.zip|\.tar\.gz/i.test(filesBlockMatch[2])) {
      fail('release-workflow', 'release.yml files block lists a zip/tarball — assets must be individual files')
    }
  } else {
    fail('release-workflow', '.github/workflows/release.yml not found — cannot verify release assets will be published')
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
