---
id: PRD-AS-001
title: Approvals & Security (Claudian Reboot P7)
stage: requirements
feature: approvals-security
status: accepted     # autonomous drive — no human gate; CLAR-AS-001..005 resolved by PM recommendation, to be ratified by the P7 architect ADRs (notably ADR-AS-001 — ApprovalRuleStorePort)
owner: pm
inputs:
  - CHARTER-CLAUDIAN-REBOOT §3.9 (security/approvals) / §3.10 (status-panel/permission-toggle css) / §4 (P7) / §5 / §6a (approval-rule persistence ADR note) / CHARTER-REQ-SET / CHARTER-REQ-FRESH
  - specs/claudian-reboot/claudian-audit-backend.md §"Security / approvals (ApprovalManager + permission updates)" + the ApprovalRuleStorePort row
  - specs/approvals-security/workflow-state.md (P7 scope + the ApprovalRuleStorePort ADR note + the two integration points)
  - D:\Projects\claudian-main (read-only MIT structural + visual reference)
  - P1–P6 on `next`: ChatRuntimePort.ts (the P4 inline callback setters + the P6 ToolbarCapabilities.permissionMode), src/domain/chat/inline/** (ApprovalRequest / ApprovalDecision / ExitPlanModeRequest), src/ui/chat/toolbar/PermissionToggle.vue + buildToolbarViewModel.ts (the P6 honest-defer seam), src/domain/settings/PluginSettings.ts (device-local SettingsPort pattern, ADR-PSR-002)
created: 2026-05-26
updated: 2026-05-26
epic: claudian-reboot
phase: P7
area: AS
integration_branch: next
---

# PRD — Approvals & Security (Claudian Reboot P7)

## Summary

P7 makes the **approval decision engine** and **permission management** live on the P1–P6
chat surface. Two surfaces shipped as honest seams in earlier phases get their backing here:

1. **The P4 inline approval blocks** (`src/domain/chat/inline/**`: `ApprovalRequest`,
   `AskUserQuestionRequest`, `ExitPlanModeRequest`, resolved by `RespondToInlineBlockUseCase`)
   render today and return the user's decision for the *current request only* —
   `'allow-always'` carries no persistence (P4 `Approval.ts` explicitly defers the rule store
   to P7). P7 adds the **rule engine behind the prompt**: an incoming tool-approval request is
   matched against the user's persisted + session rules; a match auto-decides (allow/deny)
   without prompting; an unmatched request surfaces the existing P4 inline prompt unchanged;
   and a user's `allow-always` (or deny-always) decision **persists a new rule**.

2. **The P6 permission toggle** (`PermissionToggle.vue` + `ToolbarCapabilities.permissionMode`)
   shipped visible-disabled with an honest "permissions arrive in a later release" notice and a
   PLAN display special-case (P6 `REQ-TC-015/016`). P7 **backs it**: the three Claudian
   permission modes become **live**, the toggle sets and reflects the active mode, and the mode
   threads into the runtime so it gates whether actions need approval at all (notably **plan
   mode**, which gates edits behind approval).

The central P7 decision is **where and how approval rules persist**. Per CHARTER-REQ-SET,
user/device-scoped state persists **device-local** (never `data.json`, never a collaborative
git-backed vault file); per CHARTER-REQ-FRESH there is **no migration** of any prior rule state.
P7 introduces a new narrow port — **`ApprovalRuleStorePort`** — whose contract, rule shape, and
three-bridge backing the P7 architect ratifies in **ADR-AS-001** (mirroring how ADR-PSR-002
recorded the device-local `SettingsPort` decision). Specorator deliberately does **not** copy
Claudian's choice of writing rules into the project's `.claude/settings.json` SDK
`projectSettings` file (a shared, git-committed vault path) — that conflicts with CHARTER-REQ-SET.

This is a **parity PRD**: each functional requirement maps 1:1 to a Claudian source path (the
behaviour spec) and a Given/When/Then acceptance (the test seed), per charter §5.

### The permission-mode set (grounded in claudian-main)

Claudian's permission-mode model is **exactly three modes** —
`PermissionMode = 'yolo' | 'plan' | 'normal'` (`D:\Projects\claudian-main\src\core\types\settings.ts:76`,
persisted as `ClaudianSettings.permissionMode` line 99 + per-provider
`savedProviderPermissionMode` line 136). Each maps to a Claude Agent-SDK `PermissionMode`
on the wire via `resolveSDKPermissionMode` and is synced session-scoped on plan exit
(`ClaudeApprovalHandler.ts:63–71`, the `{ type:'setMode', mode, destination:'session' }`
permission update).

| Claudian mode | Meaning (parity) | P7 backing (Claude) |
|---|---|---|
| **`normal`** | Default — unmatched actions surface the approval prompt; matched rules auto-decide | **Backed in P7** — the default mode; the rule engine + inline prompt path |
| **`plan`** | Plan mode — the agent plans without acting; edits/actions are gated behind plan-approval (`exit-plan-mode`) before they run | **Backed in P7** — plan mode threads to the runtime; the P4 exit-plan block + the post-exit `setMode` sync gate edits behind approval |
| **`yolo`** | Auto-approve — bypass per-action prompts for this session | **Backed in P7** — sets the runtime to the bypass SDK mode; no per-action prompt while active (rules + the prompt path are short-circuited) |

> **Mode set is the invariant; the SDK-string mapping is HOW.** The exact Claudian→SDK
> mapping (`yolo`↔`bypassPermissions`, `plan`↔`plan`, `normal`↔`default`/`acceptEdits`) and
> the `setMode` destination live in the provider-specific infrastructure
> (`ClaudePermissionUpdates` / the runtime), and are ratified by the P7 architect (CLAR-AS-002).
> **No fourth mode** exists in Claudian; the P6 `ToolbarCapabilities.permissionMode` two-state
> (`'default' | 'plan'`) display union expands to carry the live three-mode value in P7
> (additive — CLAR-AS-002). Codex/Opencode permission models are **out of P7** (→ P9, NG6).

### The approval-rule model (grounded in claudian-main `ApprovalManager`)

Claudian's `ApprovalManager` (`D:\Projects\claudian-main\src\core\security\ApprovalManager.ts`)
is **pure** rule-matching. A rule is a `{ toolName, ruleContent? }` pair
(`ClaudePermissionUpdates.ts:30`, the `addRules` SDK update) and `matchesRulePattern` decides a
match per tool family:

- **Bash** (`TOOL_BASH`): exact match, or an **explicit wildcard** — `"git *"` (space wildcard)
  or `"npm:*"` (CC colon format). A bare prefix without a wildcard does **not** match — an
  intentional security stance (`ApprovalManager.ts:80–98`).
- **File tools** (`Read`/`Write`/`Edit`/`NotebookEdit`): **path-prefix match with path-segment
  boundary awareness** — `/a/b` matches `/a/b/c` and `/a/b` but not `/a/bc`
  (`isPathPrefixMatch`, lines 116–130). A trailing `/` matches the whole subtree.
- **Other tools** (`Glob`/`Grep`/…): **simple prefix** match (line 111). A `*` rule, or a rule
  with no `ruleContent`, matches everything for that tool.

So a P7 rule matches on **(tool name + an action pattern derived from the tool input)**, carries
a **decision** (allow / deny), and has a **lifetime** (session-scoped from `allow`/`deny`, or
persisted from `allow-always`/`deny-always`). Backslashes are normalised to `/`
(`ApprovalManager.ts:71`). The action pattern per tool comes from `getActionPattern`
(bash→command, file→path, glob/grep→pattern, default→`JSON.stringify(input)`; lines 13–33).

> P7 reproduces this **matching semantics** as pure domain logic; the rule **store** is the new
> `ApprovalRuleStorePort`. Claudian distinguishes session (`allow`) vs project-settings
> (`allow-always`) persistence (`ClaudePermissionUpdates.ts:11–12`); Specorator keeps the
> session-vs-persisted *lifetime distinction* but relocates the persisted destination to
> **device-local** (CHARTER-REQ-SET), not the project `.claude/settings.json` (CLAR-AS-001).

### The decision flow (the P7 spine)

```
agent wants a tool
   → runtime invokes the approval callback (ChatRuntimePort.setApprovalCallback, P4 seam)
   → ApprovalManager matches the (tool, action-pattern) against session + persisted rules
        ├─ permission mode 'yolo'  → auto-allow (no prompt)
        ├─ permission mode 'plan'  → edits/actions gated behind the P4 exit-plan-mode block
        ├─ a matching allow rule    → auto-allow (no prompt)
        ├─ a matching deny rule     → auto-deny  (no prompt)
        └─ no match (mode 'normal') → surface the P4 inline approval prompt UNCHANGED
   → on a prompted decision:
        ├─ 'allow' / 'deny'             → session-scoped (in-memory) rule, this session only
        └─ 'allow-always' / 'deny-always' → persist a rule via ApprovalRuleStorePort (device-local)
   → rules survive reload (load-or-default from the device-local store; NO migration)
status/approvals UI shows the active permission mode + the current rule list
```

## Goals

- **G1** — Make the permission mode **live**: the three Claudian modes (`normal`/`plan`/`yolo`)
  thread into the runtime, the P6 permission toggle **sets and reflects** the active mode, and
  the mode determines whether actions need approval — replacing the P6 honest-defer seam with a
  real control.
- **G2** — Make the approval **rule engine** real: an incoming tool-approval request is matched
  against the user's session + persisted rules with **Claudian's exact matching semantics**
  (bash explicit-wildcard, file path-segment-boundary prefix, other-tool prefix), auto-deciding
  matched requests without a prompt and surfacing the **unchanged P4 inline prompt** for
  unmatched ones.
- **G3** — Make a user decision **persist a rule device-local**: an `allow-always`/`deny-always`
  decision saves a rule through the new `ApprovalRuleStorePort`; rules survive a reload via
  load-or-default; nothing rule-related touches `data.json` or a vault file (CHARTER-REQ-SET);
  no migration of prior state (CHARTER-REQ-FRESH).
- **G4** — Gate **plan mode** correctly: while plan mode is active the agent plans without
  acting, and edits/actions are gated behind the P4 exit-plan-mode approval before they run
  (mirroring Claudian's `setMode` session sync on plan exit).
- **G5** — Surface the **status / approvals UI**: a status panel + permission display that shows
  the active permission mode and the current approval rules (mode + rule list), rendered through
  the `status-panel/permission-toggle` `--sp-*` token slice.
- **G6** — Stay **additive and identity-neutral**: with no rule set and the default `normal`
  mode, P1–P6 behave **byte-identically** — the existing "always surface the inline prompt"
  path is the no-rules default; the P4 inline DTOs, the P6 toolbar view-model, and the
  `ChatRuntimePort` P1–P6 members are unchanged except for additive optionals; the Vue layer
  never imports `obsidian`.

## Non-goals

- **NG1** — **MCP client / servers / config / tester** (in-app MCP, including which MCP tools an
  approval rule may target). → **P8**. P7's rule engine matches on tool name + action pattern
  generically; it does not introduce MCP server management or `mcp__server__tool` discovery.
- **NG2** — **Richer rule-editor / approvals settings UX** (a full settings-tab rule manager with
  add/edit/import). → **P10**. P7 ships the engine + a **minimal** status/approvals surface
  (active mode + rule list, with a clear/remove affordance); the rich editor is later.
- **NG3** — **A full network-approval context panel** (`ApprovalNetworkContext` host/protocol +
  `blockedPath` surfacing from `core/runtime/types.ts:19`). P7 may pass through the
  decision-reason/blocked-path context the P4 block already renders, but does not build a
  dedicated network-approval UI (CLAR-AS-005). → later/optional.
- **NG4** — **Re-speccing the P4 inline blocks' rendering / interaction.** The ask-user-question,
  exit-plan-mode, and approval *blocks* shipped in P4 and render unchanged. P7 adds the rule
  engine *behind* them and the `allow-always`/`deny-always` persistence path; it does not change
  how a block looks or how a single decision is collected.
- **NG5** — **Secret storage / API-key handling.** No secret is involved in approval rules. The
  `SecretStorePort` (CHARTER-REQ-SEC) lands when secrets first appear (Claude key / providers);
  P7 must ensure **no secret material ever enters a rule, a log, or the rule store** (NFR-AS-002).
- **NG6** — **Codex / Opencode permission models.** Their modes/approval flows are **P9**. P7
  backs **Claude** + builds the provider-agnostic **seams** (the mode threads through the runtime
  capability flag, not a `providerId` branch); a non-Claude provider's mode set is out of scope.
- **NG7** — **Per-rule editing / reordering / expiry policies beyond session-vs-persisted.** A
  rule is allow/deny, session or persisted. Time-boxed rules, per-conversation rules, and rule
  precedence beyond "deny wins / first match" are not in P7 (the precedence default is
  CLAR-AS-004).
- **NG8** — **i18n of all 10 locales** for new P7 strings beyond the project default-locale
  baseline. → **P11**. New strings go through the existing `TranslationPort` with English keys.
- **NG9** — **The P6 toolbar layout / the other seven widgets.** P7 only makes the permission
  toggle live; it does not re-spec the model/mode/thinking/service-tier/MCP/external/usage widgets.

## Personas / stakeholders

| Persona | Need | Why it matters |
|---|---|---|
| Returning Claudian user | The same `normal`/`plan`/`yolo` modes and the same "allow once / always allow / deny" approval prompts, with `always` actually remembering | Parity (charter §1) — the approval flow is a daily, trust-defining interaction; if `always` forgot, the product would feel broken |
| Security-conscious vault owner | Confidence that auto-approve rules are explicit, bash rules require explicit wildcards, and rule state is **never** committed to the shared git-backed vault | The vault is collaborative + git-backed (CHARTER-REQ-SET); a leaked `allow git push *` rule in `data.json` would be a shared-state hazard |
| Plugin maintainer / reviewer | A pure, testable rule-matching core; a narrow `ApprovalRuleStorePort` on all three bridges; additive P1–P6 surfaces | DDD/ports discipline (ADR-008) + the additivity invariant keep P7 from regressing the merged P1–P6 chat |
| `npm run dev` / GitHub Pages user | The approval engine works against the Mock/LocalStorage bridges with no Obsidian runtime | The rule store must have a non-Obsidian backing so dev + the web demo keep functioning |

## Jobs to be done

- When **the agent asks to run a tool I trust repeatedly**, I want to **choose "always allow"
  once**, so I can **stop being prompted for that action in this and future sessions**.
- When **I want the agent to plan before touching my vault**, I want to **switch to plan mode**,
  so I can **review the plan and approve edits before any change is made**.
- When **I am doing throwaway exploration**, I want to **flip to yolo (auto-approve) mode**, so I
  can **work without per-action prompts for this session**.
- When **I am unsure what I have auto-approved**, I want to **see the active mode and my current
  rules**, so I can **review and clear a rule I no longer trust**.
- When **I have set no rules**, I want **the approval prompt to behave exactly as it did in P4–P6**,
  so I can **trust that turning the engine on changed nothing until I opt in**.

## Functional requirements (EARS)

> Use [EARS notation](../../docs/ears-notation.md). One requirement per entry. Stable IDs.
> Grouped: **permission mode** (REQ-AS-001..006), **approval rules / matching**
> (REQ-AS-010..016), **decision flow** (REQ-AS-020..025), **persistence** (REQ-AS-030..034),
> **status / approvals UI** (REQ-AS-040..043), **accessibility & additivity** (REQ-AS-050..054).
> Each maps 1:1 to a claudian-main path + a future TEST-AS id (charter §5.2).

---

### Group A — Permission mode

Claudian source: `core/types/settings.ts:76` (`PermissionMode = 'yolo'|'plan'|'normal'`),
`providers/claude/runtime/ClaudeApprovalHandler.ts:63–71` (plan-exit `setMode` session sync),
`src/ui/chat/toolbar/PermissionToggle.vue` + `buildToolbarViewModel.ts:173` (the P6 seam).

---

### REQ-AS-001 — Render the three permission modes on the toolbar

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL render the permission toggle offering the three Claudian
  permission modes — `normal`, `plan`, and `yolo` — and SHALL show which mode is currently active.*
- **Acceptance:**
  - Given the active tab is in `normal` mode
  - When the permission toggle renders
  - Then it presents the three modes and indicates `normal` as active (and `plan` shows the PLAN display from the P6 special-case)
- **Priority:** must
- **Satisfies:** CHARTER §3.9; claudian `PermissionMode` three-mode set (`settings.ts:76`); supersedes the P6 honest-defer seam (REQ-TC-015/016)
- **Test:** TEST-AS-001

### REQ-AS-002 — Setting a permission mode drives the live runtime mode

- **Pattern:** event-driven
- **Statement:** *WHEN the user selects a permission mode on the toggle, the plugin SHALL set the
  active tab's permission mode and thread that mode into the runtime so subsequent turns honour it.*
- **Acceptance:**
  - Given the active tab is in `normal` mode
  - When the user selects `yolo`
  - Then the active tab's permission mode becomes `yolo` and the runtime is told the mode so the next turn applies it
- **Priority:** must
- **Satisfies:** CHARTER §3.9; claudian `ClaudeApprovalHandler` `getPermissionMode`/`syncPermissionMode`; the P6 toggle becomes live (NG1 of P6 → backed here)
- **Test:** TEST-AS-002

### REQ-AS-003 — The toggle reflects the live mode, including the PLAN display

- **Pattern:** state-driven
- **Statement:** *WHILE a permission mode is active for the tab, the plugin SHALL render the toggle
  reflecting that mode, replacing the toggle with the PLAN label while plan mode is active (the P6
  display special-case, now backed).*
- **Acceptance:**
  - Given the active tab is in `plan` mode
  - When the toggle renders
  - Then it shows the PLAN label; and given the tab returns to `normal`/`yolo`, the toggle shows the active mode
- **Priority:** must
- **Satisfies:** claudian PLAN display (`PermissionToggle.vue:31`); `ToolbarCapabilities.permissionMode` expanded to the live three-mode value (CLAR-AS-002)
- **Test:** TEST-AS-003

### REQ-AS-004 — yolo mode auto-approves without per-action prompts

- **Pattern:** state-driven
- **Statement:** *WHILE the active permission mode is `yolo`, the plugin SHALL auto-approve tool
  actions for the session without surfacing the inline approval prompt.*
- **Acceptance:**
  - Given the active tab is in `yolo` mode
  - When the agent requests a tool action
  - Then the action is allowed without showing the approval prompt
- **Priority:** must
- **Satisfies:** CHARTER §3.9; claudian `yolo` mode (auto-approve); `ClaudeApprovalHandler` bypass path
- **Test:** TEST-AS-004

### REQ-AS-005 — plan mode gates edits behind plan approval

- **Pattern:** state-driven
- **Statement:** *WHILE the active permission mode is `plan`, the plugin SHALL prevent the agent's
  edits/actions from executing until the user approves them via the P4 exit-plan-mode block, after
  which the plugin SHALL sync the resulting permission mode into the runtime session.*
- **Acceptance:**
  - Given the active tab is in `plan` mode and the agent produces a plan
  - When the agent attempts to exit plan mode to act
  - Then the P4 exit-plan-mode block is surfaced; on `implement` the edits proceed and the runtime mode is synced session-scoped; on `cancel`/`revise` no edit runs
- **Priority:** must
- **Satisfies:** CHARTER §3.9; claudian `ClaudeApprovalHandler.ts:52–80` (exit-plan-mode → `setMode` `destination:'session'`); consumes the P4 `ExitPlanModeRequest`/`ExitPlanModeDecision` (NG4 — block render unchanged)
- **Test:** TEST-AS-005

### REQ-AS-006 — Permission mode is per-tab and reflects on tab switch

- **Pattern:** event-driven
- **Statement:** *WHEN the user switches to a different chat tab, the plugin SHALL update the
  permission toggle to reflect that tab's active permission mode.*
- **Acceptance:**
  - Given tab A is in `plan` mode and tab B is in `normal` mode
  - When the user switches from tab A to tab B
  - Then the toggle shows `normal`
- **Priority:** should
- **Satisfies:** claudian per-tab `savedProviderPermissionMode` (`settings.ts:136`); the P6 per-tab control-state model (CLAR-TC-003); per-tab-vs-global is CLAR-AS-003
- **Test:** TEST-AS-006

---

### Group B — Approval rules & matching (the ApprovalManager core)

Claudian source: `core/security/ApprovalManager.ts` (`getActionPattern`, `getActionDescription`,
`matchesRulePattern`, `isPathPrefixMatch`, `matchesBashPrefix`).

---

### REQ-AS-010 — Derive an action pattern from the tool and its input

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL derive an action pattern for an approval request from the tool
  name and its input — the command for bash, the file path for file tools, the search pattern for
  glob/grep — matching Claudian's `getActionPattern`.*
- **Acceptance:**
  - Given a `Bash` request with `command: "git status"`
  - When the action pattern is derived
  - Then it is `"git status"`; and given a `Read` with `file_path: "/notes/a.md"` the pattern is `"/notes/a.md"`; and given a tool with no recognised field the pattern falls back to the serialised input
- **Priority:** must
- **Satisfies:** claudian `getActionPattern` (`ApprovalManager.ts:13–33`)
- **Test:** TEST-AS-010

### REQ-AS-011 — Match bash rules only on exact or explicit-wildcard patterns

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL match a bash approval rule only when the action exactly equals
  the rule, or the rule is an explicit wildcard (`"git *"` space form or `"npm:*"` colon form) whose
  prefix the action begins with — never a bare prefix without a wildcard.*
- **Acceptance:**
  - Given a rule `"git *"`
  - When matching `"git status"`
  - Then it matches; and given the rule `"git"` (no wildcard) matching `"git status"` does **not** match; and `"npm:*"` matches `"npm install"`
- **Priority:** must
- **Satisfies:** claudian `matchesRulePattern` bash branch (`ApprovalManager.ts:80–98`) + `matchesBashPrefix` (132–142) — the intentional explicit-wildcard security stance
- **Test:** TEST-AS-011

### REQ-AS-012 — Match file-tool rules by path-prefix with segment boundaries

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL match a file-tool approval rule (`Read`/`Write`/`Edit`/
  `NotebookEdit`) by path-prefix with path-segment-boundary awareness, so a rule path matches an
  action path only at a `/` boundary (or a trailing-`/` subtree), and SHALL normalise `\` to `/`
  before matching.*
- **Acceptance:**
  - Given a rule `"/a/b"`
  - When matching `"/a/b/c.md"` it matches and `"/a/b"` matches, but `"/a/bc.md"` does **not** match
  - And given a rule `"/a/b/"` it matches the whole `/a/b/` subtree
- **Priority:** must
- **Satisfies:** claudian `isPathPrefixMatch` (`ApprovalManager.ts:116–130`) + backslash normalisation (line 71)
- **Test:** TEST-AS-012

### REQ-AS-013 — Match other-tool rules by simple prefix; empty/`*` rule matches all

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL match a non-bash, non-file tool rule by simple prefix, and SHALL
  treat a rule with no pattern (or the `*` pattern) as matching every action for that tool.*
- **Acceptance:**
  - Given a `Grep` rule `"TODO"` matching action `"TODO-list"` it matches by prefix
  - And given a rule with no `ruleContent`, or `"*"`, every action for that tool matches
- **Priority:** must
- **Satisfies:** claudian `matchesRulePattern` other-tool prefix + no-pattern/`*` branches (`ApprovalManager.ts:66–113`)
- **Test:** TEST-AS-013

### REQ-AS-014 — A non-determinable action pattern does not match a content rule

- **Pattern:** unwanted-behaviour
- **Statement:** *IF an action pattern cannot be determined (it is null) and a rule carries a
  content pattern, THEN the plugin SHALL NOT treat the rule as a match.*
- **Acceptance:**
  - Given an action whose pattern is null
  - When matching against a rule that has a `ruleContent`
  - Then it does not match (the action falls through to the prompt)
- **Priority:** must
- **Satisfies:** claudian null-action guard (`ApprovalManager.ts:68–69`)
- **Test:** TEST-AS-014

### REQ-AS-015 — Produce a human-readable action description for the prompt

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL produce a human-readable description of an approval request
  (e.g. "Run command: …", "Edit file: …") for display in the inline prompt, matching Claudian's
  `getActionDescription`.*
- **Acceptance:**
  - Given a `Bash` request `command: "npm test"`
  - When the description is produced
  - Then it reads "Run command: npm test"; and a `Write` to `/a.md` reads "Write to file: /a.md"
- **Priority:** should
- **Satisfies:** claudian `getActionDescription` (`ApprovalManager.ts:35–53`); feeds the P4 `ApprovalRequest.context`
- **Test:** TEST-AS-015

### REQ-AS-016 — A rule decision can be allow or deny

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL represent an approval rule as a tool name, an optional action
  pattern, a decision of allow or deny, and a lifetime of session or persisted.*
- **Acceptance:**
  - Given a persisted allow rule for `Bash "git *"` and a session deny rule for `Bash "rm *"`
  - When the rule set is inspected
  - Then both are represented with their tool, pattern, decision, and lifetime
- **Priority:** must
- **Satisfies:** claudian rule shape `{ toolName, ruleContent? }` + `behavior:'allow'` (`ClaudePermissionUpdates.ts:30`); Specorator adds the explicit deny decision (CLAR-AS-004); session-vs-persisted lifetime (`ClaudePermissionUpdates.ts:11–12`)
- **Test:** TEST-AS-016

---

### Group C — Decision flow (engine ↔ the P4 inline prompt)

Claudian source: `ClaudeApprovalHandler.ts` (the `CanUseTool` callback), the
`ChatRuntimePort.setApprovalCallback` P4 seam, `src/domain/chat/inline/Approval.ts`.

---

### REQ-AS-020 — A matched allow rule auto-approves without prompting

- **Pattern:** state-driven
- **Statement:** *WHILE a persisted or session allow rule matches an incoming approval request, the
  plugin SHALL auto-approve the request without surfacing the inline approval prompt.*
- **Acceptance:**
  - Given a persisted allow rule for `Bash "git *"`
  - When the agent requests `Bash "git status"`
  - Then the request is allowed automatically and no approval prompt is shown
- **Priority:** must
- **Satisfies:** CHARTER §3.9; claudian rule-gated auto-approve (`ClaudeApprovalHandler` + `matchesRulePattern`)
- **Test:** TEST-AS-020

### REQ-AS-021 — A matched deny rule auto-denies without prompting

- **Pattern:** state-driven
- **Statement:** *WHILE a persisted or session deny rule matches an incoming approval request, the
  plugin SHALL auto-deny the request without surfacing the inline approval prompt.*
- **Acceptance:**
  - Given a session deny rule for `Bash "rm *"`
  - When the agent requests `Bash "rm -rf /x"`
  - Then the request is denied automatically and no approval prompt is shown
- **Priority:** must
- **Satisfies:** CHARTER §3.9; claudian deny behavior (`ClaudeApprovalHandler.ts:128`); Specorator's explicit deny-rule extension (CLAR-AS-004)
- **Test:** TEST-AS-021

### REQ-AS-022 — An unmatched request surfaces the P4 inline prompt unchanged

- **Pattern:** event-driven
- **Statement:** *WHEN an approval request matches no rule and the mode is `normal`, the plugin
  SHALL surface the existing P4 inline approval block unchanged so the user can decide.*
- **Acceptance:**
  - Given no rule matches the request and the mode is `normal`
  - When the request arrives
  - Then the P4 inline approval block renders with its tool + context + options (deny / allow once / always allow), unchanged from P4
- **Priority:** must
- **Satisfies:** CHARTER §3.9; the P4 `ApprovalRequest` block (`src/domain/chat/inline/Approval.ts`); the no-rules default path (G6)
- **Test:** TEST-AS-022

### REQ-AS-023 — Deny takes precedence and first-match wins on conflict

- **Pattern:** unwanted-behaviour
- **Statement:** *IF more than one rule matches an incoming request with conflicting decisions,
  THEN the plugin SHALL apply a deterministic precedence (a matching deny denies) rather than a
  non-deterministic or last-write outcome.*
- **Acceptance:**
  - Given both an allow rule and a deny rule match the same action
  - When the request is evaluated
  - Then the action is denied (deny precedence)
- **Priority:** must
- **Satisfies:** safety extension of claudian's match (claudian has no deny rule, so no conflict); precedence policy is CLAR-AS-004
- **Test:** TEST-AS-023

### REQ-AS-024 — The mode short-circuits the rule lookup

- **Pattern:** state-driven
- **Statement:** *WHILE the active permission mode is `yolo`, the plugin SHALL auto-approve before
  consulting rules; WHILE `plan`, the plugin SHALL route actions through the plan-approval gate
  before any rule-based execution.*
- **Acceptance:**
  - Given mode `yolo` and a deny rule for the action
  - When the request arrives
  - Then it is allowed (yolo short-circuits the rule lookup, matching Claudian's bypass)
- **Priority:** should
- **Satisfies:** claudian mode-gated flow (`ClaudeApprovalHandler` reads `getPermissionMode` before per-action approval); mode-vs-rule ordering is CLAR-AS-004
- **Test:** TEST-AS-024

### REQ-AS-025 — Cancelling the inline prompt denies and interrupts the turn

- **Pattern:** event-driven
- **Statement:** *WHEN the user cancels the inline approval prompt (e.g. Escape), the plugin SHALL
  deny the request and signal the turn to interrupt, persisting no rule.*
- **Acceptance:**
  - Given the inline approval prompt is shown
  - When the user cancels it
  - Then the request is denied with an interrupt and no rule is persisted
- **Priority:** must
- **Satisfies:** claudian `cancel` → `{ behavior:'deny', interrupt:true }` (`ClaudeApprovalHandler.ts:114–116`); the P4 callback `null` (cancel) contract (`ChatRuntimePort.setApprovalCallback`)
- **Test:** TEST-AS-025

---

### Group D — Persistence (the ApprovalRuleStorePort, device-local)

Claudian source: `ClaudePermissionUpdates.ts:11–12` (session vs `projectSettings` destination);
charter §6a (the approval-rule-persistence ADR note); CHARTER-REQ-SET / CHARTER-REQ-FRESH;
the device-local `SettingsPort` pattern (ADR-PSR-002).

---

### REQ-AS-030 — An "always" decision persists a rule device-local

- **Pattern:** event-driven
- **Statement:** *WHEN the user chooses `allow-always` (or `deny-always`) on the inline approval
  prompt, the plugin SHALL persist a corresponding rule through the `ApprovalRuleStorePort` to a
  device-local store.*
- **Acceptance:**
  - Given the inline prompt for `Bash "git status"`
  - When the user chooses "always allow"
  - Then a persisted allow rule for that action is saved via `ApprovalRuleStorePort` (device-local)
- **Priority:** must
- **Satisfies:** CHARTER §3.9 / §6a; claudian `allow-always` → persisted rule (`ClaudePermissionUpdates.ts:11–12`); device-local relocation (CHARTER-REQ-SET, CLAR-AS-001)
- **Test:** TEST-AS-030

### REQ-AS-031 — An "allow once" / "deny once" decision is session-scoped only

- **Pattern:** event-driven
- **Statement:** *WHEN the user chooses `allow` or `deny` (the "once" decisions), the plugin SHALL
  apply the decision for the current session only and SHALL NOT persist a rule.*
- **Acceptance:**
  - Given the inline prompt for an action
  - When the user chooses "allow once"
  - Then a session-scoped rule is held in memory and no persisted store write occurs
- **Priority:** must
- **Satisfies:** claudian `allow` → `destination:'session'` (`ClaudePermissionUpdates.ts:11`)
- **Test:** TEST-AS-031

### REQ-AS-032 — Persisted rules survive a reload

- **Pattern:** event-driven
- **Statement:** *WHEN the plugin reloads, the plugin SHALL load persisted approval rules from the
  device-local store (load-or-default) so previously-saved rules continue to auto-decide.*
- **Acceptance:**
  - Given a persisted allow rule for `Bash "git *"` was saved and the plugin reloads
  - When the agent next requests `Bash "git status"`
  - Then it is auto-approved from the reloaded rule with no prompt
- **Priority:** must
- **Satisfies:** CHARTER §6a; load-or-default with **no migration** (CHARTER-REQ-FRESH); mirrors ADR-PSR-002 settings load-or-default
- **Test:** TEST-AS-032

### REQ-AS-033 — Session rules do not survive a reload

- **Pattern:** unwanted-behaviour
- **Statement:** *IF a rule was created as session-scoped ("once"), THEN the plugin SHALL NOT
  retain it across a reload.*
- **Acceptance:**
  - Given a session "allow once" rule for an action and the plugin reloads
  - When the agent next requests that action
  - Then the inline prompt is surfaced again (the session rule is gone)
- **Priority:** must
- **Satisfies:** claudian session-vs-project destination split; the lifetime distinction (REQ-AS-016)
- **Test:** TEST-AS-033

### REQ-AS-034 — Rule state never touches `data.json` or a vault file

- **Pattern:** unwanted-behaviour
- **Statement:** *IF an approval rule is persisted, THEN the plugin SHALL write it only to the
  device-local store and SHALL NOT write it to `data.json` or any collaborative git-backed vault
  file.*
- **Acceptance:**
  - Given a persisted rule is saved
  - When the vault and `data.json` are inspected
  - Then neither contains rule data; the device-local store holds it (CHARTER-REQ-SET)
- **Priority:** must
- **Satisfies:** CHARTER-REQ-SET; supersedes Claudian's `.claude/settings.json` `projectSettings` destination (CLAR-AS-001); NFR-AS-001/002
- **Test:** TEST-AS-034

---

### Group E — Status / approvals UI

Claudian source: `components/status-panel.css` (running/approval state),
`toolbar/permission-toggle.css`; the minimal approvals surface (rules list).

---

### REQ-AS-040 — The status panel shows the active permission mode

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL display the active permission mode in the status/approvals
  surface, rendered through the `status-panel`/`permission-toggle` `--sp-*` token slice.*
- **Acceptance:**
  - Given the active tab is in `yolo` mode
  - When the status surface renders
  - Then it shows the active mode as `yolo`
- **Priority:** must
- **Satisfies:** CHARTER §3.9 / §3.10; claudian `status-panel.css` running/approval state
- **Test:** TEST-AS-040

### REQ-AS-041 — The approvals surface lists the current rules

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL list the current approval rules (each with its tool, action
  pattern, decision, and session-vs-persisted lifetime) in the approvals surface.*
- **Acceptance:**
  - Given a persisted allow rule for `Bash "git *"` and a session deny rule for `Bash "rm *"`
  - When the approvals surface renders
  - Then both rules appear with their tool, pattern, decision, and lifetime
- **Priority:** should
- **Satisfies:** CHARTER §3.9; minimal rule list (rich editor → P10, NG2)
- **Test:** TEST-AS-041

### REQ-AS-042 — The user can remove a persisted rule

- **Pattern:** event-driven
- **Statement:** *WHEN the user removes a rule from the approvals surface, the plugin SHALL delete
  it from the device-local store so it no longer auto-decides.*
- **Acceptance:**
  - Given a persisted allow rule for `Bash "git *"`
  - When the user removes it
  - Then the rule is deleted from the store and the next `Bash "git status"` surfaces the prompt again
- **Priority:** should
- **Satisfies:** CHARTER §3.9; the `ApprovalRuleStorePort` clear/remove contract (CLAR-AS-001); minimal management (NG2 defers the rich editor)
- **Test:** TEST-AS-042

### REQ-AS-043 — The approvals surface reflects rule and mode changes live

- **Pattern:** event-driven
- **Statement:** *WHEN a rule is added/removed or the permission mode changes, the plugin SHALL
  update the status/approvals surface to reflect the new state.*
- **Acceptance:**
  - Given the approvals surface is open showing one rule
  - When the user persists a new "always allow" rule from a prompt
  - Then the surface shows two rules without a manual refresh
- **Priority:** should
- **Satisfies:** CHARTER §3.9; live reflection of the rule/mode state
- **Test:** TEST-AS-043

---

### Group F — Accessibility & additivity (cross-cutting)

---

### REQ-AS-050 — The permission toggle and rule list are keyboard-operable

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL allow the permission toggle and the approvals rule-list controls
  (select a mode, remove a rule) to be operated by keyboard — focus, Enter/Space to activate, Arrow
  keys to move through options — in addition to any pointer affordance.*
- **Acceptance:**
  - Given the permission toggle is focused via keyboard
  - When the user presses Enter and Arrow keys to choose `plan`
  - Then the mode changes to `plan` with no reliance on a hover/pointer-only trigger
- **Priority:** must
- **Satisfies:** CHARTER §1 a11y (WCAG 2.2 AA); extends the P6 keyboard-open discipline (REQ-TC-040)
- **Test:** TEST-AS-050

### REQ-AS-051 — The mode control exposes its state to assistive technology

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL expose the active permission mode and each rule-list control's
  state to assistive technology and SHALL provide an accessible name for every approvals control.*
- **Acceptance:**
  - Given the toggle is set to `yolo`
  - When its accessibility state is inspected
  - Then it reports the active mode and carries an accessible name describing the control
- **Priority:** must
- **Satisfies:** CHARTER §1 a11y; extends the P6 AT-state discipline (REQ-TC-041)
- **Test:** TEST-AS-051

### REQ-AS-052 — With no rule and default mode, P1–P6 behave identically

- **Pattern:** unwanted-behaviour
- **Statement:** *IF no approval rule is set and the permission mode is the default `normal`, THEN
  the plugin SHALL behave exactly as P1–P6 did — every approval request surfaces the P4 inline
  prompt and the P6 toolbar/runtime surfaces serialise unchanged.*
- **Acceptance:**
  - Given a fresh install with no rules and `normal` mode
  - When the agent requests any tool
  - Then the P4 inline prompt is surfaced (the no-rules default), and a turn submitted without touching approvals serialises exactly as on `next` today
- **Priority:** must
- **Satisfies:** the additivity invariant (G6); the P4 "always prompt" default; charter §4 (P0–P6 byte-identical)
- **Test:** TEST-AS-052

### REQ-AS-053 — The approval engine works on the Mock and LocalStorage bridges

- **Pattern:** ubiquitous
- **Statement:** *The plugin SHALL provide an `ApprovalRuleStorePort` backing on all three bridges
  so the rule engine works under `MockBridge` (tests / `npm run dev`) and `LocalStorageBridge`
  (web demo) without an Obsidian runtime.*
- **Acceptance:**
  - Given the plugin runs under `MockBridge`
  - When a rule is persisted and re-read
  - Then the round-trip succeeds via the in-memory store backing (no Obsidian dependency)
- **Priority:** must
- **Satisfies:** ADR-008 three-bridge discipline; the `ApprovalRuleStorePort` rows in the backend audit
- **Test:** TEST-AS-053

### REQ-AS-054 — A rule-store failure degrades gracefully, never crashing the turn

- **Pattern:** unwanted-behaviour
- **Statement:** *IF the rule store fails to load or save, THEN the plugin SHALL return a failure
  `Result`, fall back to the no-rules prompt path, and surface a non-blocking notice — never throw
  across the approval-callback boundary or crash the turn.*
- **Acceptance:**
  - Given the rule store throws on load
  - When an approval request arrives
  - Then the engine falls back to surfacing the inline prompt, a non-blocking notice is shown, and no error crosses the use-case boundary
- **Priority:** must
- **Satisfies:** ADR-004 `Result<T,E>`; NFR-AS-009; the fail-safe-to-prompt stance (a store failure must never silently auto-approve)
- **Test:** TEST-AS-054

## Non-functional requirements

> Targets inherited from the epic constraints (charter §1 bounding constraints + §5),
> `CLAUDE.md` (DDD/ports/DOM/testing), ADR-008, ADR-004, ADR-PSR-002 (device-local store),
> CHARTER-REQ-SET / CHARTER-REQ-FRESH. Restated per project convention. P7 introduces **one
> new port** (`ApprovalRuleStorePort`, ADR-AS-001) but **no new numeric threshold** — every
> target below is inherited.

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-AS-001 | architecture (additivity) | The P1–P6 `ChatRuntimePort` members, the P4 inline DTOs (`ApprovalRequest`/`ExitPlanModeRequest`/`AskUserQuestionRequest` + decisions), and the P6 toolbar view-model stay byte-identical except for additive optionals (the live three-mode permission value, the rule-store wiring); with no rule + `normal` mode, P0–P6 are byte-identical | A no-rules / `normal`-mode turn and the P4 prompt render exactly as on `next`; new members/fields are additive-only |
| NFR-AS-002 | security/privacy (secrets) | No secret/token/API-key material is ever placed in a rule, the rule store, or any log; rules are inert **data** (tool name + pattern + decision + lifetime), never executable code | No secret in any rule DTO or store payload; rule data is non-executable; LoggerPort emits no rule content that could carry a secret |
| NFR-AS-003 | security (rule storage location) | Approval rules persist **device-local** only — never `data.json`, never a collaborative git-backed vault file | Vault + `data.json` contain no rule data; the device-local store holds rules (CHARTER-REQ-SET) |
| NFR-AS-004 | security (fail-safe) | A rule-store error never results in a silent auto-approve; the engine fails **safe to the prompt** path | On any store load/save failure the request falls back to the inline prompt, not auto-allow |
| NFR-AS-005 | architecture (DDD/ports) | DDD inward-only imports; the rule-matching core is pure domain; the `ApprovalRuleStorePort` is one narrow port for one consumer (the approvals use cases), added to all three bridges; no aggregate | No `obsidian` import outside `src/infrastructure/obsidian/**` + `src/plugin/**`; `ApprovalManager` matching is pure; port on `ObsidianBridge`/`MockBridge`/`LocalStorageBridge` |
| NFR-AS-006 | architecture | Vue components never import `obsidian`; the permission toggle, status panel, and rule list consume ports / view-model DTOs only | ESLint `no-restricted-imports` green; no `obsidian` symbol in `src/ui/**` |
| NFR-AS-007 | security/DOM | No `innerHTML`/`outerHTML`/`insertAdjacentHTML`, no `v-html`, no `window.confirm`/`alert`/`prompt`; any blocking confirmation uses an Obsidian `Modal`; the inline approval block stays a non-blocking Vue block | `no-restricted-properties` + `vue/no-v-html` + `no-restricted-globals` green |
| NFR-AS-008 | code-style | New components use `<script setup>`; use cases + store/port methods return `Result<T,E>`; DTOs (rules, mode) cross the Pinia store boundary (no domain class instances) | ESLint Composition-API rule green; use cases return `Result`; store holds DTOs |
| NFR-AS-009 | reliability | The approval engine and rule matching are total — partial/absent rule data, an unknown tool, or a store failure degrade to the prompt rather than crashing; no thrown error crosses the approval-callback boundary | Engine returns a decision (or falls back to prompt) for any input; matching never throws; failures return `Result.err` |
| NFR-AS-010 | testing | Tests mirror `src/` path-for-path; mounted components have co-located `data-testid` PageObjects; no CSS/id selectors in tests | `tests/**` lint green; every new component test has a `.po.ts` |
| NFR-AS-011 | testing (coverage) | Coverage thresholds hold | ≥ 80 statements / 70 branches / 80 functions / 80 lines (`npm run test:coverage`) |
| NFR-AS-012 | visual parity | The permission toggle, status panel, and approvals list render through the `status-panel`/`permission-toggle` `--sp-*` token slice; no raw Obsidian var, hardcoded hex, or physical CSS property leaks | `lint-style-tokens` guard green; parity screenshots vs claudian at 320/520/720 px, light + dark |
| NFR-AS-013 | accessibility | Permission toggle + rule-list controls keyboard-operable; mode/rule state exposed to AT; focus managed + visible; forced-colors + reduced-motion honoured | WCAG 2.2 AA; keyboard + AT-state + forced-colors asserted in component tests |
| NFR-AS-014 | identity/manifest | Product identity stays Specorator; `manifest.json` (`id`, `version`, `minAppVersion 1.12.7`) untouched; no migration of prior rule/permission state | manifest diff empty; no migration/compat code (CHARTER-REQ-FRESH) |
| NFR-AS-015 | i18n | New user-facing strings (mode labels, decision labels, rule descriptions, the approvals surface) go through the existing `TranslationPort` with English keys | No hardcoded user-facing string in new components; full-locale parity deferred (NG8) |
| NFR-AS-016 | dependencies | No new runtime dependency for the approval engine or the rule store (matching + storage are in-repo; the SDK `PermissionUpdate` mapping reuses the existing provider runtime) | `package.json` runtime deps unchanged |

## Success metrics

- **North star:** A returning Claudian user finds the same approval experience — picks
  `normal`/`plan`/`yolo`, gets prompted with the same "deny / allow once / always allow" choices,
  and finds that "always allow" **actually remembers across a reload** while bash rules still
  require explicit wildcards — verified by the matching-semantics tests + the parity screenshots
  (charter §5) passing at `/spec:review`.
- **Supporting:**
  - 100% of `must` REQ-AS-* mapped to a Claudian source path and an executed test (charter §5.2).
  - The matching core reproduces Claudian's `matchesRulePattern` semantics exactly — bash
    explicit-wildcard, file path-segment-boundary prefix, other-tool prefix, null-action guard
    (REQ-AS-011..014), each with a passing test.
  - Persisted rules survive a reload and session rules do not (REQ-AS-032/033); no rule data in
    `data.json` or the vault (REQ-AS-034 / NFR-AS-003).
  - The permission toggle drives the live runtime mode (REQ-AS-002) and plan mode gates edits
    behind plan-approval (REQ-AS-005).
- **Counter-metric (safety + additivity + scope leakage):** **zero** cases where (a) a rule-store
  failure or an unknown action results in a silent auto-approve (must fail safe to the prompt —
  NFR-AS-004); (b) a bare bash prefix without an explicit wildcard auto-approves (the explicit-
  wildcard stance must hold — REQ-AS-011); (c) rule data lands in `data.json` or a vault file
  (NFR-AS-003); (d) the no-rules/`normal` default changes any P1–P6 behaviour (REQ-AS-052); or
  (e) any P7 artifact implements MCP (NG1), a rich rule-editor settings UX (NG2), a network-
  approval panel (NG3), a P4-block re-spec (NG4), secret storage (NG5), or a Codex/Opencode
  permission model (NG6). Tracked by a review checklist: any silent auto-approve, any leaked rule
  write, any P1–P6 regression, or any REQ/spec/task touching a deferred surface is a defect to
  bounce to the owning phase.

## Release criteria

What must be true to ship P7 to `next`.

- [ ] All `must` REQ-AS-* pass acceptance (three live modes drive the runtime; plan gates edits;
      yolo auto-approves; the matching core reproduces Claudian's semantics; matched rules auto-
      decide; unmatched requests surface the unchanged P4 prompt; "always" persists device-local;
      rules survive reload; the status/approvals UI shows mode + rules; keyboard + AT-state a11y;
      no-rules default is byte-identical to P1–P6).
- [ ] All NFR-AS-* met or explicitly waived with an ADR (notably NFR-AS-001 additivity,
      NFR-AS-003 device-local storage, NFR-AS-004 fail-safe, NFR-AS-012 token parity,
      NFR-AS-013 a11y).
- [ ] CLAR-AS-001..005 ratified by the accepted P7 architect ADRs — notably **ADR-AS-001**
      (`ApprovalRuleStorePort` contract + rule shape + device-local backing) — before design
      freezes the rule model + the additive permission-mode plumbing.
- [ ] Parity screenshots captured (status panel + permission toggle + approvals list at
      320/520/720 px, light + dark) and approved at `/spec:review` (charter §5.1) — accumulating
      toward the single final epic review gate.
- [ ] Additivity regression check: with no rule + `normal` mode the P4 prompt and the P6 toolbar/
      runtime surfaces are byte-identical to `next` (REQ-AS-052 / NFR-AS-001).
- [ ] Safety check: a forced rule-store failure falls back to the prompt, never auto-approves
      (NFR-AS-004 / REQ-AS-054); a bare bash prefix does not auto-approve (REQ-AS-011).
- [ ] `npm run verify` + `npm run test:all` exit zero on the P7 branch.
- [ ] Counter-metric clean: no silent auto-approve, no leaked rule write, no P1–P6 regression, no
      scope leakage into NG1–NG9.

## Open questions / clarifications

> These are **architect-owned** (P7 is autonomous-drive; no human gate). Each is an ADR-worthy
> decision flagged with options + constraints. Because the brief mandates autonomous drive, each
> carries a **PM-recommended resolution** to unblock design rather than a hold; the P7 architect
> ADRs ratify (or amend) them. They are **resolved-by-recommendation** for the purpose of
> `status: accepted`.

- **CLAR-AS-001 — The `ApprovalRuleStorePort` contract, rule shape, and persistence target.**
  *owner: architect (ADR-AS-001).* What is the port contract, the persisted rule shape, and the
  device-local backing? Options: (a) a narrow `ApprovalRuleStorePort` —
  `loadRules(): Result<Rule[]>`, `addRule(r): Result<void>`, `removeRule(id): Result<void>`,
  `clear(): Result<void>` — with rules stored device-local (Obsidian `app.saveLocalStorage`/
  `loadLocalStorage`, per ADR-PSR-002), the rule shape mirroring Claudian's
  `{ toolName, ruleContent? }` plus an explicit `decision: 'allow'|'deny'` and
  `lifetime: 'session'|'persisted'`; (b) fold rules into `SettingsPort`/`PluginSettings`.
  Constraints: **device-local only** — never `data.json`, never a vault file (CHARTER-REQ-SET);
  **no migration** (CHARTER-REQ-FRESH); one narrow port for one consumer (ADR-008); all three
  bridges back it. **PM recommendation:** option (a) — a dedicated `ApprovalRuleStorePort`
  (not folded into `SettingsPort`), so rules are a distinct concern with its own load-or-default,
  device-local backing; this matches the backend audit's `ApprovalRuleStorePort` row and keeps
  `PluginSettings` lean. Specorator deliberately diverges from Claudian's `projectSettings`
  (`.claude/settings.json`) destination, which is a shared git-backed vault path.

- **CLAR-AS-002 — The live permission-mode plumbing + the `ToolbarCapabilities` expansion.**
  *owner: architect.* How does the live three-mode value (`normal`/`plan`/`yolo`) thread through
  the runtime, and how does the P6 `ToolbarCapabilities.permissionMode` (`'default'|'plan'`)
  expand to carry it? Options: (a) add an additive `permissionMode?` to `ChatRuntimeQueryOptions`
  (or a runtime setter mirroring Claudian's `setPermissionModeSyncCallback`) and widen the
  toolbar capability/control value to the three-mode union — additive, P1–P6 byte-identical;
  (b) a separate permission-mode store on the tab/session model. Constraints: **additive only**
  (NFR-AS-001); the exact Claudian→SDK string mapping (`yolo`↔`bypassPermissions`,
  `plan`↔`plan`, `normal`↔`default`/`acceptEdits`) and the `setMode` `destination:'session'`
  stay in provider infrastructure (`ClaudePermissionUpdates`); never a `providerId` branch in the
  UI. **PM recommendation:** option (a) — thread the mode via an additive runtime option/setter
  and expand the toolbar control value to the three-mode union; keep the SDK-string mapping in
  the Claude runtime so the UI stays provider-agnostic.

- **CLAR-AS-003 — Per-tab vs global permission mode + rules.** *owner: architect.* Is the active
  permission mode per-tab (mirroring Claudian's `savedProviderPermissionMode` and the P6 per-tab
  control state, CLAR-TC-003), and are persisted rules global to the device while session rules
  are per-tab/per-session? Options: (a) mode is per-tab, persisted rules are device-global,
  session rules are per-session; (b) everything global. Constraints: parity with Claudian's
  per-tab mode + the P6 per-tab model; persisted rules are inherently device-scoped (the store).
  **PM recommendation:** option (a) — per-tab mode (parity with P6 + Claudian), device-global
  persisted rules, per-session "once" rules; this matches both the toggle-reflects-on-tab-switch
  requirement (REQ-AS-006) and the device-local store (REQ-AS-034).

- **CLAR-AS-004 — Deny rules + precedence + mode-vs-rule ordering.** *owner: architect.* Claudian
  persists only **allow** rules (`behavior:'allow'`); Specorator adds an explicit **deny** rule
  (so the user can "always deny"). What is the precedence on conflict, and where does the mode
  short-circuit sit relative to the rule lookup? Options: (a) deny-wins precedence, first-match
  within a decision, and the mode gate (`yolo` auto-allow / `plan` plan-gate) evaluated **before**
  the rule lookup; (b) allow-only rules (drop deny), matching Claudian exactly. Constraints:
  safety (a store failure or ambiguity must not auto-approve — NFR-AS-004); the explicit-wildcard
  bash stance (REQ-AS-011) must hold under either choice. **PM recommendation:** option (a) —
  add the explicit deny rule with **deny-wins** precedence and evaluate the **mode gate first**
  (`yolo` short-circuits to allow, `plan` routes through plan-approval), then the rule lookup,
  then the prompt fallback; the deny rule is a genuine safety improvement over Claudian's
  allow-only model and costs no parity (Claudian users still get allow rules + the prompt).

- **CLAR-AS-005 — Network/blocked-path approval context surfacing.** *owner: architect.* Claudian
  carries `ApprovalNetworkContext` (host/protocol) + `blockedPath` + `decisionReason` on the
  approval callback (`core/runtime/types.ts:19–31`, `ClaudeApprovalHandler.ts:105`). How much of
  that context does P7's prompt surface? Options: (a) pass through the `decisionReason`/
  `blockedPath` context the P4 `ApprovalRequest.context` already renders, without a dedicated
  network panel; (b) build a full network-approval context UI now. Constraints: NG3 defers the
  full network panel; the P4 block render is unchanged (NG4). **PM recommendation:** option (a) —
  surface the available context through the existing P4 `ApprovalRequest.context` string (so the
  prompt is informative) and defer a dedicated network-approval panel to a later/optional phase
  (NG3); this keeps P7 focused on the rule engine + mode without re-speccing the P4 block.

## Out of scope

See Non-goals NG1–NG9. Restated for the cycle: no MCP client/servers/tester or MCP-tool rule
discovery (P8), no rich rule-editor / approvals settings UX (P10 — P7 ships the engine + a minimal
surface), no dedicated network-approval context panel (NG3, later/optional), no re-spec of the P4
inline blocks' render/interaction (P4 shipped them; P7 adds the engine behind them), no secret
storage / API-key handling (CHARTER-REQ-SEC, when secrets first land), no Codex/Opencode
permission models (P9), no per-rule expiry/precedence beyond session-vs-persisted + deny-wins, no
full-locale i18n (P11), no change to the other seven P6 toolbar widgets.

---

## Quality gate

- [x] Goals and non-goals explicit.
- [x] Personas / stakeholders named.
- [x] Jobs to be done captured.
- [x] Every functional requirement uses EARS and has an ID (REQ-AS-001..006, 010..016, 020..025, 030..034, 040..043, 050..054).
- [x] Acceptance criteria testable (Given/When/Then, each mapped to a claudian path + a TEST-AS id).
- [x] NFRs listed with targets (NFR-AS-001..016; no new numeric threshold — all inherited; one new port `ApprovalRuleStorePort` via ADR-AS-001).
- [x] Success metrics defined (including a counter-metric: safety + additivity + scope leakage vs NG1–NG9).
- [x] Release criteria stated.
- [x] `/spec:clarify` returned no open questions — **closed by recommendation**: CLAR-AS-001..005
      carry PM-recommended resolutions to be ratified by the P7 architect ADRs (autonomous drive,
      no human gate). PRD → `accepted`.
