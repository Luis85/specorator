#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { mkdirSync, cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const siteIndex = join('site', 'index.html')
if (!existsSync(siteIndex)) {
  console.error(`Missing ${siteIndex}. Run from the project root.`)
  process.exit(1)
}

execSync('npm run build:web', {
  stdio: 'inherit',
  env: { ...process.env, VITE_BASE_URL: '/specorator/app/' },
})

mkdirSync(join('_site', 'app'), { recursive: true })
cpSync(siteIndex, join('_site', 'index.html'))
cpSync('dist-standalone', join('_site', 'app'), { recursive: true })

console.log('Pages site assembled at _site/. Open _site/index.html in a browser to preview.')
