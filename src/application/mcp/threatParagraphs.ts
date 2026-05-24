/**
 * Verbatim per-tool threat paragraphs for the 8 DevTools tools governed by
 * ADR-019 Part 4. Single source of truth for both the settings-tab confirm
 * modal (Part B §S07–S09) and the threat-paragraph drift-guard test
 * (T-MHP-088 / TEST-MHP-055).
 *
 * Satisfies REQ-MHP-016, REQ-MHP-017, REQ-MHP-020; RISK-MHP-015 (drift-guard).
 *
 * The values below are copied byte-for-byte from
 * `docs/adr/ADR-019-mcp-tier-policy-and-devtools-opt-in.md` §"Part 4 — Threat
 * paragraphs (verbatim user-facing copy)". Each value concatenates the four
 * sub-sections ("What it can access", "Abuse vector", "Mitigation provided by
 * this feature", "What remains the user's responsibility") into a single
 * string suitable for the modal body.
 *
 * Any future edit to ADR-019 Part 4 must land in the same PR as the
 * corresponding edit here; the drift-guard test fails otherwise.
 */

/**
 * The 8 DevTools tool identifiers governed by ADR-019. Mirrors
 * `DevToolsToolId` in `PluginSettings.ts` but redeclared here so this
 * application-layer module does not depend on the settings domain (the
 * settings module re-exports the same literal union; ADR-008 narrow-port
 * direction is preserved).
 */
export type DevToolsToolId =
	| 'dev:screenshot'
	| 'dev:errors'
	| 'dev:console'
	| 'dev:dom'
	| 'dev:cdp'
	| 'dev:debug'
	| 'dev:mobile'
	| 'devtools'

const DEV_SCREENSHOT =
	'What it can access. Captures a PNG of the rendered Obsidian renderer (the entire desktop window or the active webContents). The image is returned to the MCP client as base64. Any visible note content, open frontmatter, secrets pasted into another pane, and any other vault content currently on screen is captured.\n\n' +
	'Abuse vector. A malicious or compromised agent invokes dev:screenshot while the user has, e.g., an API key pasted into a note, an unredacted credential in a daily-note braindump, or another client\'s vault open. The PNG is then exfiltrated through the agent\'s normal channel (model API call back to the agent vendor). Unlike vault_* reads, screenshot bypasses the path/folder allowlist entirely — the only filter is "what pixels are on the user\'s screen right now."\n\n' +
	'Mitigation provided by this feature. (a) Every dev:screenshot invocation generates a proposal even when the DevTools master toggle has auto-accept on, so the audit log records the timestamp, client identifier, and proposal id. (b) The screenshot result payload is not itself written to the audit log — only the fact that a screenshot was taken — so the log file does not become an exfiltration channel of its own. (c) The DevTools master toggle defaults OFF; enabling it surfaces an in-settings warning explaining (a) and (b).\n\n' +
	'What remains the user\'s responsibility. The user accepts that anything visible on screen when the tool fires may leave the machine via the connected agent. Specorator cannot redact note content the user has chosen to display. If the vault contains real secrets, the user must disable DevTools before opening those notes.'

const DEV_ERRORS =
	'What it can access. Returns the recent Electron renderer error stream (uncaught exceptions, console.error output, deprecation warnings).\n\n' +
	'Abuse vector. Error messages frequently embed file paths, plugin internals, and occasionally vault paths or partial note contents (e.g., a malformed dataview query that printed a tag name into a stack trace). A patient agent can use repeated dev:errors polls as a covert side channel for whatever the user does next.\n\n' +
	'Mitigation provided by this feature. Same as dev:screenshot: per-invocation proposal + audit-log entry; tool body is not persisted. The default-off + warning copy applies.\n\n' +
	'What remains the user\'s responsibility. The user accepts that vault paths and plugin-internals strings may leak via error text. Specorator does not redact errors.'

const DEV_CONSOLE =
	'What it can access. Returns recent renderer console.log output. Like dev:errors but broader — includes plugin-emitted diagnostics, including any plugin that happens to log frontmatter or note contents to console.\n\n' +
	'Abuse vector. Same shape as dev:errors with larger surface area. Some popular plugins log search results, dataview row counts, or LLM-completion text to console.\n\n' +
	'Mitigation provided by this feature. Same as the other low-risk tools. The user-facing copy for the DevTools toggle must explicitly name dev:console as the highest-leakage of the three so the master toggle is not enabled lightly.\n\n' +
	'What remains the user\'s responsibility. The user accepts that any plugin-emitted log line may be exposed. Choosing which plugins to run is a pre-existing trust decision; this tool exposes the output of those decisions.'

const DEV_DOM =
	'What it can access. Reads the rendered DOM of the active webContents by selector. This includes the full text of every open note, every property in every open frontmatter, the text of any open canvas card, and the text of any open Obsidian modal (including the command palette and any plugin-rendered settings UI).\n\n' +
	'Abuse vector. dev:dom is the non-screenshot version of total renderer read access. It does not need the user\'s screen to be facing the camera; it reads structured text directly. A single dev:dom call against a vault with the user\'s .env-like note open exfiltrates everything in that note.\n\n' +
	'Mitigation provided by this feature. Per-tool opt-in (dev:dom toggle separate from the master DevTools toggle). The settings UI for this toggle must render a red-bordered warning naming this specific risk. Per-invocation proposal + audit-log entry. Critically, dev:dom is also subject to the non-auto-accept default — even when the master DevTools toggle has auto-accept on for the low-risk three, dev:dom always prompts.\n\n' +
	'What remains the user\'s responsibility. The user accepts that any text currently rendered in any pane may leave the machine on a single tool call. The user is responsible for closing sensitive notes before enabling this tool.'

const DEV_CDP =
	'What it can access. Chrome DevTools Protocol — Runtime.evaluate (arbitrary JS in the renderer), Network.getCookies (any cookies the user\'s Electron session holds), Page.captureScreenshot, Page.navigate, Storage.*. Per critique.md §1 row 2: "Chrome DevTools Protocol = Runtime.evaluate = eval by another name."\n\n' +
	'Abuse vector. Total compromise. A dev:cdp call with Runtime.evaluate can do anything any in-renderer plugin could do — read every file the Obsidian process can read, write every file it can write, exfiltrate to any URL via fetch. CORS does not apply to CDP per critique.md §4. If the user has previously logged into any service in an Obsidian webviewer pane, Network.getCookies reads those cookies.\n\n' +
	'Mitigation provided by this feature. Per-tool opt-in with the loudest possible warning. Always-prompt (no auto-accept option exposed). Audit-log entry on every invocation. The settings copy must state that enabling this is functionally equivalent to giving the agent shell access to the Obsidian process. Recommendation for ADR-019: surface a one-line confirmation modal when the toggle is flipped on, separate from the per-invocation accept (i.e., two human actions to ever fire dev:cdp: enable the tool, then accept the proposal).\n\n' +
	'What remains the user\'s responsibility. The user accepts that with dev:cdp enabled, the agent has equivalent privilege to a fully trusted Obsidian plugin author. The only reason this tool is not "permanently denied" alongside eval (critique.md §1 row 1) is the user\'s explicit request in CLAR-MHP-004.\n\n' +
	'Even with this toggle on, every dev:cdp invocation always prompts for approval.'

const DEV_DEBUG =
	'What it can access. Enables debug-mode flags on the Electron renderer; typically exposes timing data, internal state dumps, and verbose-mode console.log from Obsidian itself (which can include note content during indexing).\n\n' +
	'Abuse vector. Lower direct blast radius than dev:cdp, but enabling debug mode often turns on additional logging that other tools (dev:console, dev:errors) then read more of. Functions as a force multiplier for the low-risk tier.\n\n' +
	'Mitigation provided by this feature. Per-tool opt-in with warning; per-invocation proposal; audit-log entry. Settings copy must explain the force-multiplier dynamic — enabling dev:debug makes the low-risk three more leaky.\n\n' +
	'What remains the user\'s responsibility. The user accepts the force-multiplier dynamic and is responsible for not enabling dev:debug simultaneously with auto-accept on the low-risk tier unless the threat model is acceptable in that combination.'

const DEV_MOBILE =
	'What it can access. Toggles mobile-device emulation in the renderer (touch events, narrower viewport, mobile user-agent). Does not directly read or write vault state.\n\n' +
	'Abuse vector. Indirect. A malicious agent can force mobile emulation, which causes some plugins to render differently and may expose mobile-only UI affordances that bypass desktop assumptions. Lowest of the high-risk five but listed because it changes the renderer in ways the user may not visually notice (the chat sidebar may not reflect the emulation state).\n\n' +
	'Mitigation provided by this feature. Per-tool opt-in; per-invocation proposal; audit-log entry. Settings copy should note that the emulation change is visible in the main pane but may not be obvious in the sidebar.\n\n' +
	'What remains the user\'s responsibility. The user accepts that enabling this allows the agent to manipulate the renderer\'s emulation state. The user should disable when not actively using mobile-debugging workflows.'

const DEVTOOLS =
	'What it can access. Opens the Electron DevTools panel (the full Chrome DevTools UI) docked or undocked from the Obsidian window. Once open, a co-located malicious process or even a screen-watching attacker has full access to DevTools\' Console / Elements / Sources / Network / Application tabs against the renderer.\n\n' +
	'Abuse vector. Opens a UI surface that an attacker who has any other foothold on the machine can drive — including a different user\'s process on a shared workstation. Unlike dev:cdp, which lets the agent itself do harm, devtools lets anyone with screen access do harm. Also classically the surface other attackers use post-foothold.\n\n' +
	'Mitigation provided by this feature. Per-tool opt-in; per-invocation proposal; audit-log entry. Settings copy must state that opening DevTools means anyone who can see the user\'s screen can read everything DevTools can read. Auto-accept is not exposed.\n\n' +
	'What remains the user\'s responsibility. The user accepts that this tool\'s threat model includes co-located humans, not just co-located processes. Single-user remote workstations are different from shared-machine and coworking environments.'

/**
 * Per-tool threat paragraphs keyed by `DevToolsToolId`. The settings tab and
 * the confirm modal both read from this map; the drift-guard test
 * (`tests/application/mcp/threatParagraphs.drift.test.ts`, T-MHP-088) asserts
 * each value is byte-equal to the corresponding paragraph in
 * `docs/adr/ADR-019-mcp-tier-policy-and-devtools-opt-in.md` §"Part 4".
 *
 * The `dev:cdp` entry includes the second-paragraph "always prompts" sentence
 * verbatim per REQ-MHP-020 / Part B §S07 ("For dev:cdp only: append this
 * sentence as a second paragraph after the threat paragraph: Even with this
 * toggle on, every dev:cdp invocation prompts for approval.").
 */
export const THREAT_PARAGRAPHS_MHP: Readonly<Record<DevToolsToolId, string>> = {
	'dev:screenshot': DEV_SCREENSHOT,
	'dev:errors': DEV_ERRORS,
	'dev:console': DEV_CONSOLE,
	'dev:dom': DEV_DOM,
	'dev:cdp': DEV_CDP,
	'dev:debug': DEV_DEBUG,
	'dev:mobile': DEV_MOBILE,
	devtools: DEVTOOLS,
}
