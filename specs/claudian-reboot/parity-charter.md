---
id: CHARTER-CLAUDIAN-REBOOT
title: Claudian Reboot — Parity Charter
status: draft
owner: brainstorming
created: 2026-05-24
epic: claudian-reboot
reference: D:\Projects\claudian-main   # MIT, read-only structural + visual reference
supersedes_roadmap_in: specs/plugin-shell-reboot/workflow-state.md (the coarse P0–P7 table)
---

# Claudian Reboot — Parity Charter

Authoritative, epic-level statement of **what "done" means** for the claudian-reboot
program. Every phase's `/spec:design` (Part A UX + Part B UI) and `/spec:review`
treats this charter as a mandatory input. Built from an audit of `D:\Projects\claudian-main`
(298 TS files, 45 CSS modules, 10 locales).

---

## 1. The goal (read this first)

Deliver a **1:1 reproduction of the Claudian experience** — full feature set, same
layout, flows, affordances, microcopy, and interaction feel — **reimplemented in the
Specorator architecture** (Vite/Vitest/Vue 3 SFC + DDD layering + narrow ports +
three bridges). Not a fork of Claudian's code; a clean-room reimplementation that a
Claudian user would recognise immediately.

### What "1:1 within our constraints" means — and does NOT mean

**Does mean** (binding):
- Every Claudian user-facing feature in §3 exists and behaves the same.
- Same screen layouts, component placement, states (empty/loading/streaming/error),
  iconography intent, microcopy meaning, keyboard affordances, and motion.
- A side-by-side screenshot of each surface reads as "the same product."

**Does NOT mean**:
- **Pixel-identical CSS.** Claudian ships raw hand-written CSS (45 modules). We render
  through the Obsidian theme-token layer (`--sp-*`) so the plugin honours the user's
  theme. Spacing/colour resolve from tokens, not copied hex. Target = *perceptual*
  parity, not byte-parity.
- **Copying assets or the Claudian name/logo.** Product identity stays **Specorator**.
  We mirror UX *patterns*, not brand marks. (MIT: keep an attribution note; do not
  represent the result as Claudian.)
- **Same tech under the hood.** Claudian uses imperative DOM builders; we use Vue SFCs
  with `data-testid` + PageObjects, no `v-html`, no `innerHTML`, no `window.confirm`.

### Bounding constraints (these shape every "within constraints" call)
- Obsidian theme tokens via the `--sp-*` design-token layer (regrow from P0).
- Accessibility: keyboard nav, focus management, forced-colors, reduced-motion,
  WCAG 2.2 AA — Claudian ships `accessibility.css`; we must meet or beat it.
- Security/DOM rules from CLAUDE.md (no raw HTML injection, Obsidian `Modal` for
  blocking flows, ports for all Obsidian API).
- `manifest.json` identity (`id`, `version`, `minAppVersion 1.12.7`) unchanged — this
  is **not** Claudian's manifest.
- Desktop-only (matches Claudian; subprocess/CLI providers).
- **[CHARTER-REQ-SEC] Secrets stay out of `data.json`.** API keys / tokens / any secret
  MUST use Obsidian **native secret storage** (`app.secretStorage` — stored in
  vault-keyed *local storage*, outside `data.json`; UI via `SecretComponent`), behind a
  `SecretStorePort`. We deliberately do NOT copy Claudian, which writes raw API keys
  into its settings JSON. Applies when secrets first appear (Claude API key / providers).
  *(Verify the `app.secretStorage` API is available at `minAppVersion 1.12.7`; if it
  needs a newer Obsidian, escalate — do not silently bump the manifest.)*
- **[CHARTER-REQ-SET] User/device-scoped settings stay out of `data.json`.** Vaults are
  used collaboratively and backed by git, so `data.json` is committed + shared. Personal
  prefs (locale, logLevel, device CLI paths, …) MUST persist to a **device-local** store
  — Obsidian `app.saveLocalStorage`/`loadLocalStorage` (device-scoped, not synced), or a
  separate gitignored file — never `data.json`. `data.json` holds only genuinely
  vault-shared settings (P0 has none). The `SettingsPort` contract is unchanged; only its
  ObsidianBridge backing store moves to local storage.
- **[CHARTER-REQ-FRESH] No backwards compatibility — this is a complete rewrite.** No
  migration of legacy `data.json`, prior-version settings, chat sessions, or any old
  state; no compat shims, no deprecated-field handling, no version-bump migrations. A
  fresh install starts clean; an in-place upgrade simply ignores prior state. This
  **removes all settings-migration work** — settings just **load-or-default** from the
  device-local store (supersedes the relocate-and-clear migration drafted under
  CHARTER-REQ-SET; that migration is dropped).

---

## 2. The current roadmap is incomplete (why this charter exists)

`workflow-state.md` lists a coarse P0–P7. An audit of `claudian-main` shows that map
**omits major surface**: rich message renderers, the input toolbar widgets, image +
file attachments, bang-bash mode, rewind, compact, subagents, agents, skills (beyond
slash), per-provider settings UX, and the ACP transport. Building only P1–P7 as worded
yields a working chat — **not the Claudian experience.** §4 replaces that map.

---

## 3. Full feature & surface inventory (from claudian-main)

> The completeness checklist. Nothing here may be silently dropped; anything we choose
> to defer goes in §6 (Out of scope) with a reason.

### 3.1 Chat conversation surface
- Streaming assistant messages; user/assistant/system message rendering (`MessageRenderer`).
- **Tool-call rendering** (`ToolCallRenderer`, `toolIcons`, `toolInput`, `toolNames`,
  `toolResultContent`) — per-tool icon, collapsible input/result.
- **Write/Edit rendering** with **word-level diff preview** (`WriteEditRenderer`, `DiffRenderer`).
- **Thinking blocks** (`ThinkingBlockRenderer`, collapsible).
- **Todo list rendering** (`TodoListRenderer`, `todoUtils`, `core/tools/todo`).
- **Subagent rendering + lifecycle** (`SubagentRenderer`, `SubagentManager`,
  `subagentLifecycleResolution`).
- **Inline interactive blocks**: ask-user-question, exit-plan-mode, plan-approval
  (`InlineAskUserQuestion`, `InlineExitPlanMode`, `InlinePlanApproval`).
- Collapsible primitive; usage/token info (`usageInfo`).

### 3.2 Tabs, sessions, history
- Multi-tab chat (`TabBar`, `TabManager`, `Tab`).
- Conversation **history** + **resume** (`ResumeSessionDropdown`, per-provider history stores).
- **Fork** a conversation (`ForkTargetModal`, `rewind.ts`, `ClaudeRewindService`).
- **Rewind / checkpoint** to an earlier turn.
- **Compact** a conversation; **auto title generation** (`titleGeneration`).

### 3.3 Composer / input
- `InputController`, `InputToolbar`, textarea auto-resize.
- **Slash commands `/`** + **Skills `$`** (`SlashCommandDropdown`, `builtInCommands`,
  per-provider skill catalogs/storage).
- **`@mention`** of vault files, subagents, MCP servers, external dirs
  (`MentionDropdownController`, `VaultMentionCache`, `VaultMentionDataProvider`).
- **Instruction mode `#`** (`InstructionModeManager`, `InstructionConfirmModal`, `instructionRefine`).
- **Plan mode** toggle `Shift+Tab` (`plan-mode.css`).
- **Bang-bash `!`** run-bash mode (`BangBashModeManager`, `BangBashService`).
- **Navigation sidebar** (`NavigationSidebar`) + **status panel** (`StatusPanel`).

### 3.4 Context & attachments
- **File context / chips** (`FileContext`, `FileChipsView`, `FileContextState`, `file-link`).
- **Image context / embed / modal** (`ImageContext`, image-embed, image-modal).
- **External context**, browser-selection + canvas-selection controllers
  (`BrowserSelectionController`, `CanvasSelectionController`, `SelectionHighlight`).
- **Inline Edit** modal with word-level diff (`InlineEditModal`, per-provider inline-edit services).

### 3.5 Input toolbar widgets (the control strip)
- Model selector, mode selector, permission toggle, thinking selector,
  service-tier toggle, MCP selector, external-context control, usage/context meter.

### 3.6 Providers
- **Claude** (Agent SDK/CLI): runtime, sessions, history, agents, plugins, skills,
  slash commands, permission updates, rewind, cold-start, title/inline-edit/instruction
  auxiliary services.
- **Codex** (app-server JSON-RPC transport, JSONL history, skills, subagents).
- **Opencode** (ACP transport, modes, models, agents).
- **ACP** shared transport (`providers/acp`), provider registry, model routing,
  capabilities, workspace registry.

### 3.7 MCP
- `McpServerManager`, `McpConfigParser`, `McpTester`; settings UI (`McpServerModal`,
  `McpSettingsManager`, `McpTestModal`); transports stdio/SSE/HTTP. (Claude manages
  vault MCP in-app; Codex uses CLI-managed config.)

### 3.8 Settings shell
- Provider tabs (Claude/Codex/Opencode each: settings tab, model picker, agent/skill/
  subagent settings, slash-command settings).
- Environment settings + env snippet manager; keyboard navigation; approvals/permissions.

### 3.9 Cross-cutting
- **i18n**: 10 locales (de, en, es, fr, ja, ko, pt, ru, zh-CN, zh-TW).
- **Accessibility** stylesheet + behaviours.
- **Security/approvals** (`ApprovalManager`, permission updates).
- Plugin commands + ribbon entry.

### 3.10 Visual system to mirror (45 CSS modules → `--sp-*` tokens)
`base/` (animations, container, variables) · `components/` (code, context-footer,
header, history, input, messages, nav-sidebar, status-panel, subagent, tabs, thinking,
toolcalls) · `features/` (ask-user-question, diff, file-context, file-link,
image-*, inline-edit, plan-mode, resume-session, slash-commands) · `modals/`
(fork-target, instruction, mcp-modal) · `settings/` (agent, base, env-snippets, mcp,
opencode-model-picker, plugin, slash) · `toolbar/` (external-context, mcp/model/mode/
thinking selectors, permission + service-tier toggles) · `accessibility.css`.
Each maps to a Vue component + a `--sp-*` token slice; this list is the visual-parity
checklist for `/spec:review`.

---

## 4. Recommended phase map (supersedes the coarse P0–P7)

Each phase = its own `/spec` cycle on a branch off `next`, vertical slice, **with Part B
(UI) visual parity baked in** (not deferred). Slicing may adjust; coverage may not shrink.

| Phase | Scope | Key claudian surfaces |
|---|---|---|
| **P0** | Shell reboot (gut, keep skeleton, empty Vue sidebar) | — (done/planned) |
| **P1** | Chat core slice: `ChatRuntime` port + Claude provider (CLI) + single-thread + streaming + basic message render + minimal toolbar (send) | core/runtime, providers/claude, messages.css, input.css, container, variables, header |
| **P2** | Rich rendering: tool-calls, thinking, todo, diff, write/edit, collapsible, subagent, usage | §3.1; toolcalls/thinking/subagent/code/diff/messages css |
| **P3** | Tabs, history, resume, fork, rewind, compact, title-gen | §3.2; tabs/history/resume-session/nav-sidebar css |
| **P4** | Composer power: slash + skills (`$`), `@mention`, instruction (`#`), plan mode + inline plan/exit/ask-user blocks, bang-bash (`!`) | §3.3, inline blocks; slash-commands/plan-mode/ask-user-question/input css |
| **P5** | Context & attachments: file chips, images (context/embed/modal), external/browser/canvas selection, **inline edit + word-level diff** | §3.4; file-context/file-link/image-*/inline-edit css |
| **P6** | Toolbar & controls: model/mode/permission/thinking/service-tier/MCP selectors + usage meter | §3.5; toolbar/* css |
| **P7** | Approvals & security: ApprovalManager, permission updates, approval rules + persistence | §3.9 security; status-panel/permission-toggle css |
| **P8** | MCP client: stdio/SSE/HTTP, manager/parser/tester + settings UI + test modal | §3.7; mcp-modal/mcp-settings/mcp-selector css |
| **P9** | Providers — Codex (app-server JSON-RPC) + Opencode (ACP) + registry/model-routing/capabilities | §3.6; opencode-model-picker css |
| **P10** | Settings shell + per-provider settings UX (agents, skills, subagents, env snippets, keyboard nav) | §3.8; settings/* css |
| **P11** | i18n — all 10 locales | §3.9 i18n |
| **P12** | a11y polish + `accessibility.css` parity + **final parity screenshot sign-off** (all surfaces) | §3.10, accessibility.css |

> P1 is the first vertical slice that produces something usable. P2–P6 are where the
> "Claudian feel" is mostly won. P7–P12 complete the surface. The exact phase count is
> negotiable; the §3 inventory is the invariant.

---

## 5. Parity acceptance method (how each phase proves "1:1")

1. **Per-surface screenshot parity.** For each surface a phase touches, capture a
   side-by-side: `claudian-main` (run it) vs the rebuilt surface, at 320/520/720 px
   widths, light + dark theme. Store under `specs/<phase-slug>/parity-screenshots.md`
   (mirrors the discarded AUX feature's approach). `/spec:review` checks them.
2. **Feature-parity checklist.** Each phase's `requirements.md` enumerates the §3
   items it claims, as EARS REQs, each mapped to a Claudian source path (the behaviour
   spec) and a test.
3. **Interaction parity.** Keyboard shortcuts (`Shift+Tab` plan, `/` `$` `@` `#` `!`
   triggers, arrow-nav in dropdowns), motion, and empty/loading/streaming/error states
   match — asserted in component tests + the screenshot set.
4. **Token-mapping review.** Every Claudian CSS module a phase reproduces is mapped to
   `--sp-*` tokens; the `brand-reviewer` / `reviewer` agent confirms no raw Obsidian
   var or physical CSS property leaks (the AUX `lint-style-tokens` guard regrows here).
5. **Definition of program-done:** all §3 inventory items shipped or explicitly deferred
   in §6; P12 sign-off screenshots approved; full verify gate green on `next`; `next` →
   `develop` PR opened.

---

## 6. Decisions to confirm (from the deep audits)

> The two deep audits (`claudian-audit-frontend.md`, `claudian-audit-backend.md`)
> surfaced these. Resolve each at the owning phase's `/spec:design` (or earlier if it
> needs an ADR). None blocks P0.

### 6a. Needs an ADR (architecturally load-bearing)
- **`ChatRuntimePort` shape** — Claudian's `ChatRuntime` is a streaming async-generator
  with injected callback setters; that contract bends ADR-008's "narrow method" style.
  ADR to bless the shape before P1.
- **`HomeFsPort` (beyond-vault filesystem)** — Claude/Codex read `~/.claude`, `~/.codex`
  transcripts; the six core ports are vault-scoped. New port for home-dir access needs
  an ADR (security surface: reads outside the vault).
- **Secret handling — RESOLVED:** Obsidian **native secret storage** behind a
  `SecretStorePort` (CHARTER-REQ-SEC). NOT plain settings JSON. ADR to record the
  `SecretStorePort` contract + the `app.secretStorage` binding + the `minAppVersion`
  check. Filed when secrets first land (≈P1 Claude key / P9 providers).
- **Settings storage — RESOLVED:** user/device-scoped settings persist to device-local
  storage, never `data.json` (CHARTER-REQ-SET). ADR-PSR-002 records the `SettingsPort`
  backing-store decision. **No migration** (CHARTER-REQ-FRESH) — settings load-or-default;
  the relocate-and-clear migration is dropped. **P0-relevant** (P0 persists
  `locale`/`logLevel`) → ADR-PSR-002 filed in P0; spec/tasks settings persistence
  re-points to device-local with NO migration path.
- **Approval-rule persistence** target/shape (device-local vs vault; ties to CHARTER-REQ-SET).

> **Confirmed decisions (2026-05-24):** (1) secrets → Obsidian secret storage +
> `SecretStorePort` (not Claudian's plain-JSON); (2) provider scope → ship **Claude
> complete first; Codex + Opencode behind capability gates**, feature-incomplete is
> acceptable (matches Claudian's own posture) — P9 stays one phase, expands later.

### 6b. Scope confirmations (in / out)
- Codex + Opencode **feature completeness** vs Claude-complete + capability-gating
  (Claudian itself flags these "may be incomplete").
- Claude **plugins** subsystem (`providers/claude/plugins`) — niche; in/out.
- MCP for **non-Claude** providers (Claude is in-app; Codex CLI-managed).
- Provider auth beyond CLI/env (**Openrouter / Kimi** compatibility).
- Bundling `@modelcontextprotocol/sdk`; i18n key type-generation.
- Any Claudian surface the team decides Specorator does not want.

### 6c. Recommended new narrow ports (full tables in the audit files)
Frontend: `FilePickerPort`, `EditorSelectionPort`, `ClipboardPort`, `AuxModelPort`.
Backend: `ChatRuntimePort`, `ProviderRegistryPort`, `ProviderHistoryPort`,
`HomeFsPort`*, `McpConfigStorePort`, `McpClientPort`, `TranslationPort` (formalise),
`SecretStorePort`*, `ApprovalRuleStorePort`. (* = needs ADR, see §6a.)
Each is mapped to a phase + the bridge that implements it in the audit files.

> **Note on the existing scaffold:** the audits read the *pre-P0* tree, which still
> contains the AUX/MPS agent UI + chat code. P0 deletes that. So P1–P6 rebuild those
> surfaces clean — the deleted code + its AUX design are *reference* (charter §7), not a
> base to extend. "Mostly extension" in the frontend audit describes the pre-gut tree.

---

## 7. References
- **Deep per-surface audits (design input for P1–P12):**
  `specs/claudian-reboot/claudian-audit-frontend.md` (chat/render/composer/context/
  toolbar — §3.1–3.5) and `claudian-audit-backend.md` (provider runtime/MCP/settings/
  i18n/a11y/security — §3.6–3.9). Each maps Claudian source + CSS → Vue component +
  DDD layer + narrow port + `--sp-*` tokens, per surface, with parity-critical detail.
- **Visual + behavioural reference:** `D:\Projects\claudian-main` (MIT). Read-only.
  Per-surface, cite the exact source path in each phase's requirements/design.
- **Prior parity work (reuse, don't re-derive):** the discarded `agent-ux-parity` (AUX)
  feature on `develop`/git history built a `--sp-*` token layer, `SpIcon`, UI primitives,
  a `lint-style-tokens` guard, and `parity-screenshots.md` against Claudian. Its
  `design.md` + Claudian audit are valuable input to P1–P12 designs.
- **Architecture rules:** `CLAUDE.md`, `AGENTS.md`, `memory/constitution.md`, ADR-008
  (narrow ports), ADR-PSR-001 (the reboot).
- **Brand/visual system:** the `specorator-design` skill (tokens, voice, iconography).
