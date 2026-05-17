# WP-9 loop state

Updated by the implementer subagent each RALPH iteration. The brief is `brief.md` in this folder.

> **Worktree context** — All implementation entries below describe work performed on `claude/asv3-wp09-security-hardening` inside `.worktrees/asv3-wp09/`. The brief was scaffolded from the main worktree on `claude/improve-sidepanel-chat-8pgcT` (PR #395 era).

## Iterations

### Iteration 1 — secret-store coverage (Track 1)

- Added `tests/infrastructure/localstorage/LocalStorageSecretStore.test.ts` closing the 0% coverage gap. Asserts `available === false`, `getSecret` returns `null`, `setSecret` is a no-op, and no console channel leaks the secret value.
- Added `tests/infrastructure/mock/MockSecretStore.test.ts` raising the 58% baseline to ≥ 95%. Asserts round-trip persistence, overwrite semantics, empty-string vs unset distinction, `available: false` degraded branch, snapshot helper, and the same no-leak invariant.
- Added the `/^[a-z0-9-]+$/` regex assertion on `SECRET_ID_ANTHROPIC` to pin the Obsidian `App.secretStorage` validator constraint at compile time.
- Result: 21 new tests pass; pre-existing tests untouched.

### Iteration 2 — `assertSpawnable` defense-in-depth (Track 2)

- New module `src/infrastructure/obsidian/assertSpawnable.ts` (`Result<void, ClaudeCliError>`). Rejects empty strings, shell metacharacters (`; & | ` $ < > \n \r`), relative paths, common shell/interpreter basenames (`sh`, `bash`, `zsh`, `dash`, `fish`, `ksh`, `csh`, `tcsh`, `cmd.exe`, `powershell.exe`, `pwsh.exe`, `wsl.exe`, `env`, `node`), and any basename not matching `^claude(-code)?(\.exe|\.cmd|\.bat)?$`. Cross-platform absolute-path / basename extraction so the rejection table is testable on POSIX hosts.
- Wired into `ClaudeSubprocessAdapter._spawnChild` (streaming path) and `runSubprocessStructured` (structured path) BEFORE `lifecycle.spawn`. Guard failure surfaces as `ClaudeCliError{CLI_LAUNCH_FAILED}` with a `SPAWN_GUARD_FAILED:` prefix in the technical message — UI reuses the existing copy.
- Tests: `tests/infrastructure/obsidian/assertSpawnable.test.ts` — 49 assertions covering every rejection branch + acceptance of the canonical claude basenames.
- Existing 222 obsidian-infra tests still pass (`/fake/bin/claude` paths in fixtures already satisfy the guard).

### Iteration 3 — link-surface audit + `no-unsafe-anchor-href` rule (Track 3)

- **Audit summary**: every `.vue` file under `src/ui/components/{agent,chat}/` was scanned for `href` / `:href` / `window.open` / `.location.href` patterns. Only `src/ui/components/agent/MarkdownBlock.vue` contains anchor `href` emission, and it already routes through a `safeHref`-style filter (WP-4 territory — not touched). No other component in scope composes anchor URLs.
- New rule `eslint-rules/no-unsafe-anchor-href.cjs` (CommonJS) covers four surfaces: `<a :href="...">` / `<a v-bind:href="...">` Vue template bindings, `.href = ...` assignments, `window.open(...)` calls, and `setAttribute('href', ...)` calls. Accepts static string literals, no-expression template literals, and any `safeHref(...)` call.
- Wired into `eslint.config.js` at WARN severity, scoped to `src/ui/components/{agent,chat}/**/*.vue`. The existing `local` plugin block registers both rules; a follow-up block enables the new rule for the audit scope.
- Tests: `eslint-rules/__tests__/no-unsafe-anchor-href.test.cjs` — covers 6 invalid + 11 valid JS cases plus 5 Vue template assertions via `vue-eslint-parser`. Wired into `npm run lint:rules`.
- `npm run lint` is 0-errors; the new rule produces 0 warnings against current code (preventive only).

### Iteration 4 — `no-claude-home-reads` extension assertions (Track 4)

- Investigation: the existing `no-claude-home-reads.cjs` rule body already covers the `homedir() + '.claude'` style concatenation via `concatenatesClaudeDir`, including bare `homedir()`, `os.homedir()`, optional-chained forms, and template-literal interpolation (Codex P1/P2 fixes from PR #348 are already in tree).
- Added five explicit positive test fixtures locking in the brief's exact patterns under WP-9 sign-off (`homedir() + '/.claude'`, `os.homedir() + '/.claude'`, `'/.claude/' + homedir()`, `` `${homedir()}/.claude` ``). No rule body change needed.

### Pre-PR gate

`npm audit` clean, `npm run typecheck` clean, `npm run lint` 0 errors, `npm run test` 152 files / 1933 tests pass, `npm run build` + `npm run build:web` succeed, `npm run docs:api` succeeds (one pre-existing TypeDoc broken-link warning, unrelated to this WP).

## Carry-out items

_None._

