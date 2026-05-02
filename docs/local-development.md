---
title: Local development guide
doc_type: guide
status: current
owner: engineering
last_updated: 2026-05-02
---

# Local development guide

This guide takes you from a clean checkout to a running plugin inside Obsidian.

## Prerequisites

| Tool | Required version | Notes |
|------|-----------------|-------|
| Node.js | 22 LTS or later | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) to manage versions |
| npm | 10 or later | Bundled with Node 22 |
| Obsidian | 1.4.0 or later | Desktop app only — the plugin is `isDesktopOnly: true` |
| Git | Any recent version | |

Verify your environment before starting:

```sh
node --version   # expect v22.x.x
npm --version    # expect 10.x.x
```

## Installation

```sh
git clone https://github.com/Luis85/specorator.git
cd specorator
npm ci
```

`npm ci` installs the exact dependency versions from `package-lock.json`. Do not use `npm install` on a clean checkout — it may silently update the lock file.

## Development commands

| Command | What it does |
|---------|-------------|
| `npm run typecheck` | Type-checks all TypeScript and Vue files without emitting |
| `npm run lint` | Lints the codebase with ESLint |
| `npm run lint:fix` | Lints and auto-fixes fixable issues |
| `npm run format` | Reformats all files with Prettier |
| `npm run format:check` | Checks formatting without writing changes |
| `npm run test` | Runs the Vitest test suite once |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run test:coverage` | Runs tests and generates an lcov coverage report |
| `npm run build` | Type-checks and builds the Obsidian plugin bundle |
| `npm run dev:plugin` | Builds the plugin in watch mode (rebuilds on save) |
| `npm run build:web` | Builds the standalone browser UI to `dist-standalone/` |
| `npm run dev` | Runs the standalone UI dev server in the browser |
| `npm run docs:api` | Generates TypeDoc API docs to `docs/api/` |

Run the full verification gate before opening a pull request:

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api
```

## Build output

The plugin build (`npm run build` or `npm run dev:plugin`) writes directly to the project root — the same location Obsidian expects to find the files in a plugin folder:

| File | Committed? | Notes |
|------|-----------|-------|
| `main.js` | No | Plugin bundle — generated, listed in `.gitignore` |
| `styles.css` | Yes | Committed static CSS; the build may overwrite it during development |
| `manifest.json` | Yes | Plugin metadata — always committed |

Do not commit `main.js`. It is regenerated on every build and excluded by `.gitignore`.

## Sideloading the plugin into an Obsidian test vault

Obsidian loads community plugins from `<vault>/.obsidian/plugins/<plugin-id>/`. The plugin id is `specorator` (from `manifest.json`).

### 1. Create a dedicated test vault

Use a fresh, separate vault for development — never your personal vault. Create one through **Obsidian → Open another vault → Create new vault**.

Example location: `~/obsidian-vaults/specorator-dev/`

### 2. Link the plugin folder

The simplest setup is a symlink so the built files are picked up immediately:

```sh
# macOS / Linux
ln -s "$(pwd)" ~/obsidian-vaults/specorator-dev/.obsidian/plugins/specorator

# Windows (run as Administrator in PowerShell)
New-Item -ItemType SymbolicLink `
  -Path "$env:USERPROFILE\obsidian-vaults\specorator-dev\.obsidian\plugins\specorator" `
  -Target (Get-Location)
```

If you prefer not to symlink, copy `manifest.json`, `main.js`, and `styles.css` into the plugin folder after each build. The watch command (`npm run dev:plugin`) makes this less tedious.

### 3. Enable the plugin in Obsidian

1. Open the test vault in Obsidian.
2. Go to **Settings → Community plugins**.
3. Disable **Restricted mode** if it is on.
4. Find **Specorator** in the list and enable it.

Obsidian must be restarted (or the plugin reloaded) to pick up a new build of `main.js`. Use the [Hot-Reload plugin](https://github.com/pjeby/hot-reload) to reload automatically when files change.

### 4. Start watch mode

```sh
npm run dev:plugin
```

With the Hot-Reload plugin installed in your test vault, Obsidian will reload Specorator whenever the build finishes.

## Recommended test vault structure

```
specorator-dev/           ← Obsidian vault root
├── .obsidian/
│   └── plugins/
│       └── specorator/  ← symlink or copied plugin files
├── projects/            ← workflow projects created through the plugin
└── inbox/               ← scratch notes
```

Keep the test vault empty of personal content. The plugin may write files during development.

## Verifying plugin behavior before opening a PR

1. Run the full verification gate: `npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api`
2. Confirm the plugin loads in Obsidian without errors (check **Settings → Community plugins** and the developer console with `Ctrl+Shift+I` / `Cmd+Option+I`).
3. Open the Specorator panel and confirm the UI renders correctly.
4. Exercise the specific code path changed by your PR and confirm it works as expected.
5. Check the developer console for any uncaught errors or Vue warnings.

## Standalone browser UI

The plugin UI can also be developed and tested without Obsidian:

```sh
npm run dev
```

This starts a Vite dev server (typically at `http://localhost:5173`). The browser build uses `MockBridge` instead of `ObsidianBridge`, so all plugin-specific Obsidian APIs are simulated. This is the recommended environment for UI-focused work.

## Related

- [vite.config.ts](../vite.config.ts) — build configuration for both plugin and standalone modes
- [vitest.config.ts](../vitest.config.ts) — test configuration
- [docs/adr/](adr/) — architecture decision records
- [GitHub issue #10](https://github.com/Luis85/specorator/issues/10) — original tracking issue
