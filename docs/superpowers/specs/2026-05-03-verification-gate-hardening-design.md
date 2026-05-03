---
title: Verification gate hardening (#139)
date: 2026-05-03
status: approved
---

# Verification gate hardening

## Goal

Harden local pre-push and pre-PR verification so contributors catch CI/release failures before pushing. Eliminates Windows-hostile shell constructs and docs drift.

## Deliverables

### scripts/verify-workflows.js
Node.js reimplementation of the CI bash/awk SHA-pin check. Uses only `node:fs` and `node:path` — no install required. Reads all `.github/workflows/*.yml|.yaml`, finds `uses:` lines, skips local (`./`) and Docker (`docker://`) refs, fails if any ref lacks a 40-char hex SHA. Replaces inline bash in CI.

### scripts/build-pages.js
Cross-platform Pages build. Sets `VITE_BASE_URL=/specorator/app/`, runs `npm run build:web`, assembles `_site/` (copies `site/index.html` → `_site/index.html`, `dist-standalone/` → `_site/app/`).

### .githooks/pre-push
Runs `npm run typecheck && npm run lint && npm run validate:manifest` — fast enough not to block pushes.

### package.json scripts
| Script | Command |
|---|---|
| `verify:workflows` | `node scripts/verify-workflows.js` |
| `build:pages` | `node scripts/build-pages.js` |
| `hooks:install` | `git config core.hooksPath .githooks` |
| `verify` (extended) | append `&& npm run validate:manifest && npm run verify:workflows && git diff --check` |

### ci.yml — workflow-lint job
Add `setup-node` (lts/*) step. Replace inline bash SHA-pin check with `node scripts/verify-workflows.js`. No `npm ci` needed (script uses only built-ins).

### docs/local-development.md
- Fix Pages trigger: `main` → `demo`
- Replace long verify command with `npm run verify`
- Replace Unix-only Pages local build with `npm run build:pages`
- Add Husky note as follow-up candidate

## Out of scope
- Husky adoption (documented as follow-up, not implemented)
- `format:check` enforcement (currently fails on develop baseline — separate follow-up)
- actionlint local install
