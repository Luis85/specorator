#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = '.github/workflows'
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort()

if (files.length === 0) {
  console.log('No workflow files found under .github/workflows.')
  process.exit(0)
}

const SHA_RE = /^.+@[0-9a-f]{40}$/
const violations = []

for (const file of files) {
  const path = join(dir, file)
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^\s*-?\s*uses:\s*(.+)$/)
    if (!match) continue
    let ref = match[1].trim()
    ref = ref.replace(/#.*$/, '').trim()
    ref = ref.replace(/^["']|["']$/g, '').trim()
    if (
      ref.startsWith('./') ||
      ref.startsWith('docker://') ||
      ref.startsWith('.github/workflows/')
    )
      continue
    if (!SHA_RE.test(ref)) {
      violations.push(`${path}:${i + 1}: ${line.trimEnd()}`)
    }
  }
}

if (violations.length > 0) {
  console.error(
    "Unpinned actions found — every 'uses:' must reference a 40-character commit SHA (see docs/security/supply-chain.md).",
  )
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}

console.log(
  `All third-party actions are SHA-pinned. (${files.length} workflow file${files.length === 1 ? '' : 's'} checked)`,
)
