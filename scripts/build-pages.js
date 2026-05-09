#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { mkdirSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const astroDir = join('sites', 'specorator')
if (!existsSync(astroDir)) {
  console.error(`Missing ${astroDir}. Run from the project root.`)
  process.exit(1)
}

// Build the Astro product page (writes directly to _site/ via outDir in astro.config.mjs)
execSync('npm ci', { stdio: 'inherit', cwd: astroDir })
execSync('npm run build', { stdio: 'inherit', cwd: astroDir })

// Build the standalone Vue demo
execSync('npm run build:web', {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE_URL: '/specorator/app/' },
})

// Slot the Vue SPA into _site/app/
mkdirSync(join('_site', 'app'), { recursive: true })
cpSync('dist-standalone', join('_site', 'app'), { recursive: true })

console.log('Pages site assembled at _site/. Open _site/index.html in a browser to preview.')
