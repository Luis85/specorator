# Release Notes — Agent Sidepanel MVP (Increment 1)

**Release date:** 2026-05-15
**Channel:** preview (`demo`)
**Scope:** PR-ASM-1..5, all merged to `develop` on 2026-05-15.

## What's new

### Chat-driven file creation via the user's own Claude CLI
The Specorator chat sidepanel now supports a subscription transport: the plugin shells out to the user's locally-installed `claude` binary instead of (or alongside) the Anthropic API. The plugin never reads `~/.claude/`, never copies `.credentials.json`, and never tunnels `CLAUDE_CODE_OAUTH_TOKEN` through env — the user's CLI owns its own OAuth state.

### `/create-file` slash command with overwrite gate
A new `/create-file <path>` command produces a `FileWriteProposal` card. Accept writes the file via the **single sanctioned vault-mutation path** (with an interactive overwrite-confirmation modal if the path exists); Reject leaves the vault untouched and writes only an audit row. Every terminal outcome mirrors to a per-feature session log under `specs/{slug}/sessions/`.

### Stage-aware system prompts
Every chat send now carries a one-shot stage preamble assembled from the active feature's `workflow-state.md`. The model receives context about which stage you're in and what artifact it should be producing.

### Session persistence + `--resume`
Threads survive plugin reloads. The first response carries a `session_id`; subsequent sends resume it via `--resume <session>` on the spawned subprocess.

## Trust posture

- **NFR-ASM-004** — the plugin never reads `~/.claude/`, never references `.credentials.json`, never sets `CLAUDE_CODE_OAUTH_TOKEN`. Enforced by:
  - `local/no-claude-home-reads` ESLint rule scoped to `src/**`.
  - `tests/integration/no-claude-home.test.ts` runtime `fs` audit.
  - `tests/integration/credentials-grep-audit.test.ts` static-substring audit.
- **NFR-ASM-005 + NFR-ASM-012** — completion telemetry redacts session ids and never includes prompt body, binary path, or `$HOME`.
- **NFR-ASM-011** — `commitFileWriteProposal` is the only function that calls `VaultPort.writeFile` on behalf of an LLM proposal. Verified by in-file invariant + grep.

## Settings

- `transportKind`: `'subscription' | 'api-key'` — choose the transport. Default `'api-key'` for migration safety.
- `claudeCliPath`: absolute path to the `claude` binary (subscription transport only; auto-discovered if blank).

## Compatibility

- Existing `api-key` users: unchanged. No migration required.
- Subscription users: install Claude Code on the same machine; the plugin auto-discovers the binary or you can pin it in Settings.

## Known limitations

- Telemetry currently emits the literal `'<redacted>'` for session id. Suitable for counting completions; not yet suitable for distinct-session counts. Will be revisited if aggregation tooling demands it.
- Completion telemetry currently only covers the subscription transport. Api-key parity is on the roadmap for the next increment.

## Tracking

- 67/67 REQ-ASM closed.
- 1375/1375 unit tests passing.
- §13.4 release-blockers checklist fully verified in PR-ASM-5 (#348).
