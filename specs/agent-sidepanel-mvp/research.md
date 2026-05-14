---
id: RES-ASM-001
title: "Agent Sidepanel MVP — Increment 1"
stage: research
feature: agent-sidepanel-mvp
status: complete
owner: analyst
inputs:
  - IDEA-ASM-001
created: 2026-05-14
updated: 2026-05-14
---

# Research — Agent Sidepanel MVP (Increment 1)

## Summary

The Agent Sidepanel MVP extends the shipped chat sidebar (`claude-cli-chat-sidebar`, REQ-CCS-001…028) so subscription holders without an `ANTHROPIC_API_KEY` can chat, and so the assistant can propose vault writes that the user explicitly accepts. The only Anthropic-supported way to use a Claude.ai subscription from a third-party plugin is to shell out to the user's locally installed `claude` binary (`claude -p`); the Agent SDK is explicitly disallowed for brokering subscription login. Two transports split behind one ADR-008 narrow port: SDK-with-key for API-key users, `child_process.spawn`-of-`claude` for subscription users. `--bare` disables OAuth and **must not** be passed on the subscription transport.

Structured output is the second pillar. `--output-format json --json-schema '<schema>'` returns a `.structured_output` field validated server-side; without it, replies often include prose preambles, fences, or truncated JSON. The plugin revalidates with Zod at the application boundary and accepts only schema-validated `structured_output` for file-creation proposals. Session continuity captures `session_id` from `system/init` (under `stream-json --verbose --include-partial-messages`) and resumes with `--resume <id>`.

ToS posture is the loudest risk: the user installs and signs in to `claude` themselves; the plugin spawns it as a subprocess inheriting local credentials and never touches `~/.claude/.credentials.json` or any OAuth token.

## Research questions answered

| OQ | Question | Verdict | Confidence |
|---|---|---|---|
| OQ1 | JSON schema for structured envelope | `{ action, path, content, rationale?, folderHint? }`; diff deferred to Increment 2. | HIGH |
| OQ2 | Streaming behaviour under Electron | `stream-json --verbose --include-partial-messages` emits one NDJSON event per line; consume via `readline` (do not assume `data` events are line-aligned). | HIGH |
| OQ3 | Per-session message log placement | `specs/<active-feature>/sessions/<session-id>.md`; fall back to `.specorator/sessions/<session-id>.md`. Vault-local for Obsidian-Sync portability (REQ-CCS-028). | MEDIUM |
| OQ4 | First-run transport detection | Precedence: `ANTHROPIC_API_KEY` → SDK; else discoverable `claude` → subprocess; else degraded. User-visible in Settings; no mid-session switching. | HIGH |
| OQ5 | CLI-not-installed surface | Reuse REQ-CCS-019 degraded-state pattern + Settings "Claude CLI path" field with autodetect. | HIGH |

---

## Findings

### F1 — Claude Code CLI non-interactive mode (HIGH confidence)

The MVP uses four capability axes — invocation, framing, session continuity, tool gating — covered by the flags below; full surface is in `cli-reference`.

| Flag | Purpose in MVP |
|---|---|
| `-p "<prompt>"` | Non-interactive single query. |
| `--output-format text\|json\|stream-json` | Selects framing; `stream-json` emits NDJSON. |
| `--json-schema '<schema>'` | With `--output-format json`, returns server-validated `.structured_output`. |
| `--resume <session-id>` | Continues a prior session by id. |
| `--append-system-prompt` | Injects the stage-aware preamble from `workflow-state.md`. |
| `--allowedTools` / `--permission-mode` | Tool gating; MVP disables server-side tools (see D-ASM-010). |
| `--bare` | **Disables OAuth and forces `ANTHROPIC_API_KEY`. MUST NOT be used on the subscription transport.** |

NDJSON events under `stream-json --verbose --include-partial-messages`: `system/init` (carries `session_id`), `stream_event` (tokens), `tool_use`, `result` (final). Out-of-scope flags (`--model`, `--mcp-config`, `--settings`, `--cwd`) are noted but not wired.

**Sources:** [headless](https://code.claude.com/docs/en/headless), [cli-reference](https://code.claude.com/docs/en/cli-reference), [authentication](https://code.claude.com/docs/en/authentication).

### F2 — Claude Agent SDK is not the subscription path (HIGH confidence)

The SDK overview states: *"Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods instead."*

Keep the shipped SDK adapter (`ClaudeCliAdapter`, satisfies REQ-CCS-013) for API-key users. Add `ClaudeSubprocessAdapter` spawning the user's local `claude`. Both implement the same narrow port (existing `ClaudeCliPort` or renamed `AgentPort`); UI sees only a Settings label.

**Sources:** [agent-sdk/overview](https://code.claude.com/docs/en/agent-sdk/overview), [agent-sdk/typescript](https://platform.claude.com/docs/en/agent-sdk/typescript).

### F3 — Spawning the CLI from the Obsidian Electron renderer (MEDIUM confidence)

`require('child_process').spawn` works in the Obsidian renderer. Three hazards: (1) **PATH discovery is unreliable from GUI-launched Electron** on macOS/Linux — mitigate with a Settings "Claude CLI path" field plus autodetect via `sh -lc 'command -v claude'` (login shell matches terminal behaviour); (2) **macOS signed-app spawn latency** — [Electron #26143](https://github.com/electron/electron/issues/26143) reports 300–3000 ms first-spawn on signed/notarised builds; (3) **Linux AppArmor / userns sandbox crashes** on some distros — test on vanilla Ubuntu 24.04, document the workaround (disable userns restriction or run Obsidian outside the snap).

**Process lifecycle:** the adapter keeps **one long-lived `ChildProcess` per chat thread** for free-text streaming, reused turn-to-turn (amortises hazard 2). Structured one-shot calls (file-creation proposals) use a **short-lived process per call** so each JSON envelope is self-contained. On plugin unload, `shutdown()` calls `child.kill()`. Binary resolution: (a) Settings field, (b) `sh -lc 'command -v claude'`, (c) `where.exe claude` on Windows, (d) mark unavailable.

**Sources:** [Electron #26143](https://github.com/electron/electron/issues/26143), [Obsidian forum thread](https://forum.obsidian.md/t/cli-crashes-with-sandbox-error-when-spawned-as-a-subprocess-on-linux-apparmor-userns-restriction/111867).

### F4 — Structured JSON output discipline (HIGH confidence)

Two envelopes with very different reliability: `--output-format json` (no schema) returns `{ result: "<free-text>", ... }` — the model's answer in `.result` may include prose, code fences, preambles, or truncated JSON. `--output-format json --json-schema '<schema>'` returns `{ result, structured_output, ... }` with `.structured_output` server-side validated. Known failure modes without `--json-schema` ([anthropics/claude-code#9058](https://github.com/anthropics/claude-code/issues/9058)): leading prose, fence wrapping, partial responses.

Mitigations stack: (a) always pass `--json-schema` for structured operations; (b) tight system-prompt suffix ("Return only the JSON object — no commentary"); (c) defensive parse extracting the first balanced `{…}` block as fallback; (d) Zod revalidation at the application boundary. The Increment-1 proposal schema is `{ action: 'createFile' (const), path: string (^[^/].*\.md$), content: string (minLength 1), rationale?: string, folderHint?: string }` with `additionalProperties: false`; full text lives in design.md.

**Sources:** [structured-outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [claude-code#9058](https://github.com/anthropics/claude-code/issues/9058).

### F5 — Session persistence (HIGH confidence)

The CLI writes its own NDJSON to `~/.claude/projects/<slugified-cwd>/<session-uuid>.jsonl` and indexes `~/.claude/history.jsonl`; these belong to the CLI, not the plugin. The plugin captures `session_id` from each run's `system/init` event, stores it on the chat-thread DTO, and resumes with `--resume <id>`. It maintains its own log per session at `specs/<active-feature>/sessions/<session-id>.md` (markdown + YAML for Sync portability, REQ-CCS-028) and **never** reads or duplicates the CLI's `~/.claude/` JSONL files.

**Sources:** [agent-sdk/session-storage](https://code.claude.com/docs/en/agent-sdk/session-storage), [agent-sdk/sessions](https://platform.claude.com/docs/en/agent-sdk/sessions).

### F6 — Anthropic ToS / licensing posture (LOW–MEDIUM confidence — caveat required)

Two official support articles converge: the Agent SDK overview forbids brokering claude.ai login from third-party products, and `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) is intended for the user's own CI/scripts.

**Safe pattern (binding):** the plugin shells out to the user's locally installed `claude` binary, which authenticates against the user's own credentials. The plugin **MUST NOT** read, copy, transmit, or persist `~/.claude/.credentials.json` or any OAuth token; **MUST NOT** prompt for or store an OAuth token in settings; **MUST NOT** market itself as offering claude.ai login. Setup docs say "uses the `claude` CLI you already installed." From mid-2026 per the support article, Agent-SDK / `claude -p` usage on subscription plans draws from a separate monthly Agent-SDK credit pool; the plugin does not meter this.

**Caveat:** primary sources are Anthropic support-portal articles, not the ToS themselves. For distributed release, obtain written confirmation. Until then, ship a short Settings disclosure ("Specorator does not handle your Claude.ai credentials. The `claude` CLI you installed manages its own login.").

**Sources:** [support 11145838 — Claude Code with Pro/Max](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan), [support 15036540 — Agent SDK with your Claude plan](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

---

## Decision table

| ID | Decision | Rationale | Confidence | Source |
|---|---|---|---|---|
| D-ASM-001 | Add `ClaudeSubprocessAdapter` that spawns the local `claude` binary; keep `ClaudeCliAdapter` (SDK + key) untouched. Both implement the same narrow port. | Agent SDK is disallowed for subscription brokering; subprocess is the only ToS-safe path. ADR-008 narrow port keeps UI transport-agnostic. | HIGH | F2, F6 |
| D-ASM-002 | Never pass `--bare` to the subscription subprocess. | `--bare` disables OAuth and forces `ANTHROPIC_API_KEY`. | HIGH | F1 |
| D-ASM-003 | Use `--output-format stream-json --verbose --include-partial-messages` for free-text chat; consume NDJSON via `readline` on child stdout. | NDJSON is documented framing; `readline` is the only safe line-boundary primitive on chunked streams. | HIGH | F1, F3 |
| D-ASM-004 | Use `--output-format json --json-schema '<schema>'` for every file-creation proposal; read `.structured_output`; revalidate with Zod at the application boundary. | Server-side schema validation eliminates prose/fence/truncation failure modes; Zod gives a single canonical type at the seam. | HIGH | F4 |
| D-ASM-005 | Capture `session_id` from `system/init`; resume with `--resume <id>`; persist plugin-side log to `specs/<feature>/sessions/<id>.md`. | Decouples plugin from CLI internals; keeps logs vault-local and Sync-portable (REQ-CCS-028). | HIGH | F1, F5 |
| D-ASM-006 | Transport precedence: API key → discovered CLI → degraded. Surface in Settings; no mid-session switching. | Preserves REQ-CCS-013; deterministic + user-visible per idea.md success criterion. | HIGH | OQ4, F2 |
| D-ASM-007 | Add Settings "Claude CLI path" with autodetect via `sh -lc 'command -v claude'` (Unix) / `where.exe claude` (Windows). | GUI-launched Electron does not inherit shell PATH; explicit field + login-shell autodetect matches terminal behaviour. | MEDIUM | F3 |
| D-ASM-008 | Increment-1 proposal schema: `{ action: 'createFile', path, content, rationale?, folderHint? }`. Diff/edit deferred to Increment 2. | Smallest schema that delivers trust-first writes; rationale aids accept decision; diff needs base-revision tracking. | HIGH | OQ1, F4 |
| D-ASM-009 | Plugin never reads, copies, transmits, or persists `~/.claude/.credentials.json` or any OAuth token; setup doc says "uses the `claude` CLI you installed." | ToS posture: third-party brokering of claude.ai login is forbidden. | MEDIUM | F6 |
| D-ASM-010 | Tools disabled in Increment 1 via `--permission-mode dontAsk --disallowedTools "Read,Edit,Write,Bash,Glob,Grep,WebFetch,WebSearch"` (explicit denylist, no reliance on empty-string semantics). All writes gated client-side via `VaultPort`. | Trust-first writes require explicit user accept; server-side tool execution would bypass the gate. Explicit denylist avoids ambiguity around empty-string flag values. | HIGH | F1, idea constraints |

---

## Open risks

- **R-ASM-001 — ToS interpretation risk (MEDIUM):** primary sources are support articles, not the ToS. *Mitigation:* obtain written confirmation from Anthropic before broad distribution; ship the disclosure copy in Settings; design so revoking the subscription transport is a one-adapter delete.
- **R-ASM-002 — Linux sandbox crash on spawn (MEDIUM):** AppArmor / userns restrictions can crash spawned `claude` on some distros. *Mitigation:* test on vanilla Ubuntu 24.04 pre-release; ship a setup-doc page; surface as `CLI_LAUNCH_FAILED` with workaround link.
- **R-ASM-003 — Spawn latency on macOS signed builds (LOW):** 300–3000 ms first-spawn (Electron #26143). *Mitigation:* lazy start with "starting up…" affordance; long-lived process per chat thread amortises cold start.
- **R-ASM-004 — Schema-validated output regressions (LOW):** the CLI's `--json-schema` validator may relax upstream. *Mitigation:* Zod revalidation at the application boundary is defence-in-depth; never trust `.structured_output` unconditionally.
- **R-ASM-005 — Session-log placement when no feature is active (LOW):** the `.specorator/sessions/` fallback leaks into vault root. *Mitigation:* mark directory user-visible; add Setting to choose alternate path post-MVP; recommend `.gitignore` entry.
- **R-ASM-006 — Agent-SDK credit-pool surprise (LOW):** from mid-2026, subscription users see a separate Agent-SDK credit drain. *Mitigation:* onboarding note in the sidebar; no in-product metering.
- **R-ASM-007 — PATH discovery on Windows (LOW):** `where.exe` may return multiple paths when the binary is shimmed. *Mitigation:* take the first non-empty line; validate with `path.isAbsolute`.
