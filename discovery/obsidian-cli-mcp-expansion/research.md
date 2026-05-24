# Obsidian CLI MCP Expansion — Research

Author: specorator:analyst (parallel research dispatch, 2026-05-24)

## 1. Tool-surface candidates ranked

**Tier A — high value, low risk, read-mostly (add as discrete tools):**
- `links` / `backlinks` / `unresolved` / `orphans` / `deadends` — graph navigation is the single biggest gap vs aaronsb's plugin and is purely read-only.
- `outline` — cheap structural read that LLMs use heavily for "jump to section".
- `daily:read` / `daily:append` / `daily:prepend` — daily-note workflows are the #1 cited Obsidian MCP use case (buildmvpfast 2026 walkthrough).
- `diff` / `history:list` / `history:restore` (restore behind proposal) — undo safety net; restore is the highest-leverage write tool.
- `templates:list` / `templates:apply` — closes the loop with Specorator's own template workflow.
- `property:set` / `property:remove` (proposal-gated) — already partially present via `properties` read; writes complete the pair.

**Tier B — useful but needs scoping:**
- `commands` group (palette IDs) + a *gated* `commands:run` — huge surface, but each palette command can do anything. Keep read-only listing; route execution through proposals with an explicit per-command allowlist seeded from observed use.
- `bases:query` / `bases:views` — already partially in `bases`; expose query separately for typed results.
- `workspace:list` / `workspace:save` (proposal) — layout management.
- `tags`, `tasks` task-toggle (proposal-gated).

**Tier C — defer or never:**
- `plugin:install` / `plugin:enable` / `theme:install` / `snippet:enable` — supply-chain risk; require explicit human action, do not expose via MCP.
- `sync:*`, `publish:*` — irreversible, account-bound, ToS-adjacent. Skip.
- `eval`, `dev:cdp`, `dev:screenshot`, `dev:dom`, `devtools` — already denied; keep denied (see §3).
- `web url=…` — see §4.

## 2. Code-mode vs tool-per-command

`cli-rest-mcp` ships exactly two tools (`search`, `execute`) — the "Code Mode" pattern. Trade-offs for Specorator:

| Axis | Tool-per-command (current) | Code Mode |
|---|---|---|
| Discoverability | Schema-typed, LLM picks correct tool | LLM must `search` first; extra round-trip |
| Token cost | Grows with surface (~120 commands ≈ noisy) | Flat 2-tool footprint |
| Proposal-gating | Natural — gate per tool | Must inspect arbitrary `execute` payload; harder to audit |
| Safety review | Static allowlist (`SAFE_CLI_READ_COMMANDS`) | Runtime parsing of free-form command strings |
| UX in Specorator chat | Each tool call renders a typed proposal card | Generic "execute X" card loses semantics |

**Recommendation:** Stay tool-per-command for Tier A/B, but add **one** code-mode-style escape hatch `cli:run` (read-only commands only, regex-validated, no args containing `;` `|` `&&` `$(`) so unforeseen read commands don't require a release. ADR-018's proposal-gated writes only work if writes are typed — Code Mode would force a rewrite of ProposalStore.

## 3. Prior-art lessons

- **`cli-rest-mcp`**: localhost-only bind, 64-char API key, `execFile` not `exec`, `eval`/`restart`/`devtools` opt-in only. Specorator's loopback design already matches; adopt their explicit per-command blocklist surfaced in settings UI.
- **`aaronsb/obsidian-mcp-plugin`**: self-signed TLS cert in `.obsidian/plugins/.../certificates/` — users repeatedly hit trust-store friction. Specorator's in-process loopback avoids this entirely; keep it.
- **`ebullient/obsidian-vault-mcp`**: desktop-only, optional bearer auth — minimal surface, low attack value. Validates that read-only is sellable.
- **Dataview CVE-2021-42057**: malicious markdown executed via `eval`. Reinforces the deny-list for `eval` and any `dev:*` command that hits CDP/DOM.
- **2026 MCP RCE wave** (Obsidian Security, Apr 2026): MCP clients were exploited via unsanitised URLs opened during OAuth. Specorator never opens external URLs from MCP responses — keep that invariant explicit in ADR-018.
- **PHANTOMPULSE / Shell Commands abuse (Apr 2026)**: attackers chained legit plugin + sync to deliver RAT. Argument for never exposing `plugin:install`, `sync:*`, or shell-adjacent commands.

## 4. Interactive-command handling

CLI commands that mutate UI state (`daily` w/ `paneType`, `open`, `create open=true`, `random newtab=true`, `search:open`, `unique open=true`, `web url=…`, `workspace:load`, `tab:open`, `devtools`) behave like a side-effecting RPC: they return success but their visible effect is *steal focus from the user*. From an agent invocation this is hostile UX — the human running the chat suddenly has a pane open underneath them.

**Proposed handling:**
1. **Strip UI-opening params on the server.** When proxying `daily`, `create`, `random`, `unique`, `web`, force `open=false`, `paneType=undefined`, `newtab=false`. Return content payload only.
2. **Refuse `*:open` and `tab:open` / `workspace:load` outright** at the MCP boundary; surface them as *proposals* the user clicks to execute, never as direct tool calls.
3. **`web url=…`** is a network-fetch side door (the agent could exfiltrate via DNS or fetch attacker-controlled HTML rendered in-app). Deny by default; if exposed later, gate behind a domain allowlist in settings.
4. **`devtools` / `dev:cdp` / `dev:screenshot` / `dev:dom`** — keep denied; these expose the full DOM including secrets pasted into other panes.

This preserves Specorator's invariant that *agent actions never grab the user's focus without a proposal click*.

## 5. Sources

- [Obsidian CLI documentation](https://obsidian.md/help/cli)
- [Obsidian CLI landing](https://obsidian.md/cli)
- [REST and MCP server plugin (cli-rest-mcp)](https://community.obsidian.md/plugins/cli-rest-mcp)
- [aaronsb/obsidian-mcp-plugin](https://github.com/aaronsb/obsidian-mcp-plugin)
- [ebullient/obsidian-vault-mcp](https://github.com/ebullient/obsidian-vault-mcp)
- [cyanheads/obsidian-mcp-server](https://github.com/cyanheads/obsidian-mcp-server)
- [MarkusPfundstein/mcp-obsidian](https://github.com/MarkusPfundstein/mcp-obsidian)
- [Obsidian Security — From well-known to Well-Pwned (MCP client RCE, 2026)](https://www.obsidiansecurity.com/blog/from-well-known-to-well-pwned-common-vulnerabilities-in-ai-agents)
- [PHANTOMPULSE RAT via Obsidian plugin abuse (The Hacker News, Apr 2026)](https://thehackernews.com/2026/04/obsidian-plugin-abuse-delivers.html)
- [Obsidian Shell Commands abuse playbook (Penligent)](https://www.penligent.ai/hackinglabs/obsidian-shell-commands-abuse-shows-a-new-malware-playbook/)
- [Dataview eval RCE — CVE-2021-42057](https://github.com/blacksmithgu/obsidian-dataview/issues/615)
- [Obsidian + Claude AI knowledge management 2026 (buildmvpfast)](https://www.buildmvpfast.com/blog/obsidian-claude-ai-knowledge-management-system-2026)
- [MCP or CLI? (Security Boulevard, Apr 2026)](https://securityboulevard.com/2026/04/mcp-or-cli-how-to-choose-right-interface-for-your-ai-tools/)
- [Obsidian Plugin Security: Trojan Deployment Risk 2026](https://thecodersblog.com/obsidian-plugin-security-vulnerability-2026/)
