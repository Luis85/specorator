# Critique: Obsidian-CLI MCP Surface Expansion

Author: specorator:critic (parallel research dispatch, 2026-05-24)

**Verdict recommendation: NO-GO on a blanket expansion.** Tiered allow-list only, with three RATs gating any tier above T1.

## 1. Top 10 most dangerous commands (ranked)

| # | Command | Why catastrophic |
|---|---|---|
| 1 | `eval` | Arbitrary JS in Obsidian's renderer context — full vault read/write, Node integration in plugin sandbox, exfil to any URL. Game over. |
| 2 | `dev:cdp` | Chrome DevTools Protocol = `Runtime.evaluate` = `eval` by another name. Same blast radius. |
| 3 | `plugin install` / `enable` | Installs third-party code that then runs unsandboxed. Persistent compromise that survives MCP shutdown. |
| 4 | `command` (palette executor) | Generic write primitive. Includes "Delete vault", "Reset settings", "Reload without saving", every installed plugin's commands. |
| 5 | `file delete` / `history:restore` / `sync:restore` | Data destruction; `sync:restore` can roll back recent legitimate work silently. |
| 6 | `web` (built-in webviewer) | Renders attacker-controlled HTML in app process; combined with `dev:dom` becomes a read-side exfil channel. Session cookies for any logged-in service. |
| 7 | `publish:add` / `publish:remove` | Public disclosure of vault content. Irreversible (cached by crawlers). |
| 8 | `snippet enable` / `theme install` | CSS injection → clickjacking, credential phishing overlays, `@import` exfil of file://. |
| 9 | `property:set` (bulk) | Silent corruption of frontmatter across vault — undermines every workflow-state tracker including Specorator's own. |
| 10 | `sync off` | Disables backup before destructive op. Classic ransomware pre-step. |

## 2. Plugin install trust chain

There is none. Community plugins are reviewed once at marketplace listing; updates are not re-reviewed. An agent with `plugin install` can pick a typo-squatted slug or an abandoned plugin that has since changed hands. Once enabled, the plugin executes in the same renderer as Specorator — it can read `.mcp.json`, scrape the proposal store, and call back to the loopback MCP itself. **Recommendation: never expose plugin install/enable. Require human install via Obsidian's UI.**

## 3. `command` blast radius

Effectively a universal write tool. Cannot be allow-listed by command ID safely because plugins register commands at runtime — the namespace is unbounded and unstable. A new plugin installed tomorrow could register `dangerous-plugin:wipe-vault` and your allow-list wouldn't know. **Recommendation: deny entirely; if needed, enumerate at request time and require per-ID human approval, cached per session only.**

## 4. `web` + `dev:dom` + `dev:cdp` exfil chain

`web` loads attacker-controlled page in Electron webview that shares the user's profile (cookies, localStorage for any service previously opened). `dev:dom` reads the rendered DOM including post-auth content. `dev:cdp` can call `Network.getCookies`, `Page.captureScreenshot`, `Runtime.evaluate`. CORS does not apply to CDP. **This trio is a pre-built exfiltration kit.** Deny all three. If `web` is wanted for docs, ship a separate read-only renderer with a fresh partition and no Node integration.

## 5. Proposal-store load

Linear queueing collapses under any bulk op (a 200-file rename = 200 proposals). User fatigue → rubber-stamp → security theatre. **Tier writes:**
- **Auto-accept:** append to `specs/{slug}/*.md` for the active feature only
- **Batch-approve:** same-folder bulk ops shown as one diff
- **Always-prompt:** anything touching `.obsidian/`, plugins, themes, settings
- **Forbid:** the top-10 list above

## 6. Loopback HTTP exposure

Any local process — browser extension via `localhost` fetch, dev server, other Electron app — can port-scan and discover the MCP. Defenses, in order of strength: (a) Unix domain socket / Windows named pipe instead of TCP; (b) per-session bearer token written to a 0600 file the agent must read; (c) `Origin`/`Host` header pinning; (d) require a handshake message signed with a token the user pastes once. **Loopback alone is not a security boundary on a multi-user or malware-infected machine.**

## 7. `.mcp.json` at vault root

Vaults get synced (iCloud, Syncthing, Git). Committing `.mcp.json` leaks the port and any embedded token to every sync target and every `git log`. **Mitigation:** write to `.obsidian/mcp.local.json` (gitignored by default in most setups), add to a shipped `.gitignore`, and rotate the token on every plugin start.

## 8. ToS / marketplace policy

Obsidian's Developer Policy requires user consent for network calls and prohibits installing plugins without explicit user action. Programmatic `plugin install` via an agent almost certainly violates the spirit of the marketplace guidelines. **Treat as high-likelihood policy breach until cleared in writing.**

## Risk register (LDJ format)

| ID | Risk | Sev | Lik | Mitigation |
|---|---|---|---|---|
| R1 | `eval` / `dev:cdp` re-enabled "just for debugging" | 5 | 4 | Hard deny at server level; not behind a setting |
| R2 | Agent installs malicious plugin | 5 | 3 | Never expose plugin install; human-only via UI |
| R3 | `command` tool runs destructive palette ID | 5 | 4 | Deny tool entirely or per-ID human approval |
| R4 | `web` + `dev:dom` exfiltrates auth cookies | 5 | 3 | Deny trio; separate partition if `web` needed |
| R5 | Loopback port discovered by co-located process | 4 | 4 | Unix socket / named pipe + bearer token |
| R6 | `.mcp.json` committed to git, token leaked | 4 | 4 | Write to `.obsidian/`, gitignore, rotate per start |
| R7 | Proposal fatigue → rubber-stamping | 4 | 5 | Tiered write policy; batch diffs; rate limits |
| R8 | Bulk `property:set` silently corrupts frontmatter | 4 | 3 | Dry-run preview; checksum diff in proposal |
| R9 | `sync off` before destructive op | 4 | 2 | Deny; or require re-enable check after any write |
| R10 | Theme/snippet CSS phishing overlay | 3 | 2 | Deny install; allow enable of pre-installed only |
| R11 | `publish:add` exposes private vault | 5 | 2 | Hard deny |
| R12 | `history:restore` / `sync:restore` data loss | 4 | 2 | Deny; human-only via Obsidian UI |
| R13 | Marketplace ToS violation | 3 | 4 | Pre-clear with Obsidian; deny plugin install meantime |
| R14 | Token in `.mcp.json` survives plugin reload | 3 | 4 | Rotate on every start; short TTL |
| R15 | Agent escalation: writes own `.mcp.json` to expand scope | 4 | 3 | Server rejects scope changes from MCP clients; settings UI only |

## Three riskiest assumptions (need RATs before any expansion)

**RAT-1 — "Loopback is a security boundary."**
*Falsification:* run a non-privileged second process on the same machine and have it enumerate the MCP port, hit `/tools/list`, and successfully call a write tool within 60 seconds without any Specorator-issued credential. If it succeeds, loopback-only is refuted.

**RAT-2 — "Users will read proposals before approving."**
*Falsification:* instrument the current proposal flow. Queue 20 plausible writes in a session with 3 silently malicious ones. If ≥1 of 5 pilot users approves any malicious proposal, the proposal UI is refuted as a security control for bulk ops.

**RAT-3 — "A curated allow-list of palette commands is stable."**
*Falsification:* snapshot the palette command IDs on a fresh vault, install the top-10 community plugins, snapshot again. If >20% of new IDs match destructive verbs, the allow-list-by-ID approach is refuted.

## Rejected expansion paths (one-liners)

- **Full CLI surface behind a single "advanced mode" toggle** — collapses every mitigation into one user decision they will make once and forget.
- **`eval` with a regex denylist** — denylists for Turing-complete inputs do not work. Ever.
- **Trust-on-first-use for plugins** — first use is exactly when the agent is most likely to install the wrong one.
- **Per-command human approval for `command`** — runtime ID namespace; allow-list cannot be authored.
- **`.mcp.json` at vault root with no token** — leaks via sync; co-located processes get free access.

## Recommendation to the Decider

Ship a **Tier 1** expansion only: add `file:create` and `file:rename` scoped to `specs/{slug}/` for the active feature, both as auto-accepted writes with diff in the activity log. Defer everything else until RAT-1, RAT-2, and RAT-3 return green. The top-10 dangerous list and the `web`/`dev:*` trio should be marked **permanently denied** in ADR-018's successor, not "deferred."

**Default to no-go on this expansion.** The asymmetry — one bad write can compromise the vault permanently, one missed feature is a week of inconvenience — favours restraint.
