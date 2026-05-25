---
id: DESIGN-AS-001
title: Approvals & Security (P7) — design (UX + UI + Architecture)
stage: design
feature: approvals-security
area: AS
status: complete
owner: architect
epic: claudian-reboot
phase: P7
integration_branch: next
reference: D:\Projects\claudian-main
requires:
  - PRD-AS-001                                  # specs/approvals-security/requirements.md
  - CHARTER-CLAUDIAN-REBOOT                      # §3.9 / §3.10 / §4 (P7) / §6a (approval-rule persistence)
adrs:
  - ADR-AS-001  # ApprovalRuleStorePort + rule DTO + pure matcher + device-local backing (CLAR-AS-001)
  - ADR-AS-002  # permission-mode additive plumbing: ChatRuntimeQueryOptions.permissionMode + ToolbarCapabilities expand (CLAR-AS-002/003)
  - ADR-AS-003  # ApprovalManager decision-flow use case: mode gate → match → prompt → persist (CLAR-AS-004/005)
created: 2026-05-26
updated: 2026-05-26
---

# Design — Approvals & Security (P7)

> Three parts. **A — UX** (the approval decision flow + states, the mode display + PLAN special-case,
> rule-matched auto-decision, prompt-on-unmatched, the persist-rule affordance on the inline decision,
> plan-mode edit-gating, the status/approvals surface, keyboard + a11y). **B — UI** (the Vue component
> inventory + co-located PageObjects, the `status-panel`/`permission-toggle` `--sp-*` token slice,
> microcopy / i18n en+de). **C — Architecture** (system overview, the `ApprovalRuleStorePort` + pure
> matcher + the `ApprovalManager` use case + the additive permission-mode seam, the three-bridge story,
> the data flow request → mode-gate → match → decide/prompt → optional persist, DDD placement, the
> security analysis, the ADR-AS list). The five CLARs resolve as **ADR-AS-001..003** (accepted,
> autonomous-drive).

This phase layers on the **merged P1–P6 surface**. It backs two honest seams shipped earlier:

1. **The P4 inline approval blocks** (`src/domain/chat/inline/Approval.ts`,
   `ChatRuntimePort.setApprovalCallback`) render unchanged and return the user's decision; P7 inserts
   the **rule engine** behind the callback (ADR-AS-003) and adds the `*-always` persistence path
   (ADR-AS-001).
2. **The P6 permission toggle** (`PermissionToggle.vue` + `ToolbarCapabilities.permissionMode`,
   visible-disabled "permissions arrive later"). P7 **backs it** (ADR-AS-002): the three Claudian
   modes (`normal`/`plan`/`yolo`) become live, the toggle sets + reflects the active mode, and the mode
   threads into the runtime so it gates whether actions need approval (notably plan mode).

The invariant (G6, REQ-AS-052, NFR-AS-001): **with no rule + `normal` mode, P1–P6 behave
byte-identically** — the P4 "always surface the inline prompt" path is the no-rules default; every new
member/field on `ChatRuntimeQueryOptions`/`TabControls`/`ApprovalDecision` is additive-only; the Vue
layer never imports `obsidian`.

---

## Part A — UX

### A.0 The surfaces this layers on

P4 ships the inline approval block (tool + context + the deny/allow-once/always-allow option row) and
the exit-plan-mode block. P6 ships the toolbar permission toggle (visible-disabled, with the PLAN
display special-case). P7 makes the toggle live, inserts the rule engine behind the inline block, adds
a `deny-always` option, and adds a **status/approvals surface** (active mode + rule list) rendered
through the `status-panel`/`permission-toggle` `--sp-*` slice (charter §3.10).

### A.1 The permission mode display (REQ-AS-001/003/006)

The P6 toggle becomes a live three-mode control:

```
┌── toolbar strip (P6) ───────────────────────────────────────────────┐
│ [Model ▾] [Mode⇄] [🛡 normal ▾] [Effort ▾] … ◷42%                    │   normal active
│ [Model ▾] [Mode⇄] [🛡 yolo ▾]   [Effort ▾] … ◷42%                    │   yolo active
│ [Model ▾] [Mode⇄] [ PLAN ]      [Effort ▾] … ◷42%                    │   plan active → PLAN label
└──────────────────────────────────────────────────────────────────────┘
```

- **`normal`** — the default; the toggle shows "normal" and is live (REQ-AS-001).
- **`yolo`** — the toggle shows "yolo"; selecting it auto-approves for the session (REQ-AS-004).
- **`plan`** — the toggle is **replaced by the "PLAN" label** (the P6 display special-case, now backed
  by the live mode — REQ-AS-003); edits are gated behind the P4 exit-plan-mode block (A.5).
- The toggle offers the **fixed three modes** (not a catalog list — the set is the invariant,
  CLAR-AS-002). Selecting a mode updates the active tab's `controls.permissionMode` and threads into
  the next turn (REQ-AS-002).
- **Per-tab** (CLAR-AS-003): switching tabs reflects that tab's mode (REQ-AS-006).

### A.2 The decision flow (the P7 spine, REQ-AS-020..025)

Every tool-approval request flows through the same gate (ADR-AS-003 §2):

```mermaid
flowchart TD
    req["agent requests a tool<br/>(setApprovalCallback fires)"] --> mode{permission mode}
    mode -->|yolo| allow["AUTO-ALLOW<br/>no prompt (REQ-AS-004/024)"]
    mode -->|plan| plan["route edits through the P4<br/>exit-plan-mode gate (REQ-AS-005/024)"]
    mode -->|normal| load["load rules:<br/>persisted (store) + session (memory)"]
    load -->|store error| safe["FAIL SAFE → prompt + notice<br/>(NFR-AS-004, REQ-AS-054)"]
    load -->|ok| match{match (pure matcher)?}
    match -->|matching deny| deny["AUTO-DENY (deny-wins)<br/>no prompt (REQ-AS-021/023)"]
    match -->|matching allow| allow2["AUTO-ALLOW<br/>no prompt (REQ-AS-020)"]
    match -->|no match| prompt["surface the UNCHANGED<br/>P4 inline prompt (REQ-AS-022)"]
    safe --> prompt
    prompt --> decide{user decision}
    decide -->|allow / deny| session["session rule (in-memory)<br/>(REQ-AS-031)"]
    decide -->|allow-always / deny-always| persist["persist a rule via<br/>ApprovalRuleStorePort (REQ-AS-030)"]
    decide -->|cancel / Escape| interrupt["deny + interrupt<br/>persist NO rule (REQ-AS-025)"]
```

- **Mode-gate-first** (CLAR-AS-004): `yolo` short-circuits to allow *before* the rule lookup
  (REQ-AS-024); `plan` routes through the plan gate.
- **Deny-wins** (CLAR-AS-004): a matching deny rule denies even when an allow rule also matches
  (REQ-AS-023).
- **Auto-decisions are silent** — no inline block renders for an auto-allow/auto-deny (REQ-AS-020/021).
- **Unmatched → the unchanged P4 prompt** (REQ-AS-022) — the no-rules/`normal` default (A.6).

### A.3 The persist-rule affordance on the inline decision (REQ-AS-030/031)

The P4 inline block's option row (deny / allow once / always allow) gains one entry — **deny always**
(the additive `'deny-always'` decision, ADR-AS-003 §3). The block render/interaction is otherwise
**unchanged** (NG4):

| Inline decision | Effect | Lifetime |
|---|---|---|
| **Allow once** (`allow`) | allow this request; remember for the session | session (in-memory) |
| **Deny once** (`deny`) | deny this request; remember for the session | session (in-memory) |
| **Always allow** (`allow-always`) | allow + **persist** an allow rule for the action | persisted (device-local) |
| **Always deny** (`deny-always`) | deny + **persist** a deny rule for the action | persisted (device-local) |
| **Cancel** (Escape, `null`) | deny + interrupt the turn; persist **no** rule | — |

The action description shown in the prompt is `getActionDescription` ("Run command: …", "Edit file:
…", REQ-AS-015) plus the available `decisionReason`/`blockedPath` context folded into the existing P4
`ApprovalRequest.context` string (CLAR-AS-005 — no dedicated network panel, NG3).

### A.4 Plan-mode edit-gating (REQ-AS-005)

While `plan` is active, the agent plans without acting; when it attempts to exit plan mode to act, the
**P4 exit-plan-mode block** is surfaced (unchanged). On `implement` the edits proceed and the runtime
syncs the resulting mode session-scoped (the `setMode` sync lives in the Claude runtime, ADR-AS-002
§3); on `revise`/`cancel` no edit runs. P7 routes through the P4 block — it does not re-spec it (NG4).

### A.5 The status / approvals surface (REQ-AS-040..043)

A minimal surface (NG2 defers the rich editor to P10) shows the **active mode** + the **current rule
list**, rendered through the `status-panel`/`permission-toggle` `--sp-*` slice (charter §3.10):

```
┌── Approvals ─────────────────────────────────────────────┐
│ Mode: yolo                                                │  (REQ-AS-040)
│ ───────────────────────────────────────────────────────  │
│ Rules                                                     │  (REQ-AS-041)
│  • Bash   "git *"     allow   persisted          [remove] │  (REQ-AS-042)
│  • Bash   "rm *"      deny    session                     │
│  • Write  "/notes/"   allow   persisted          [remove] │
│ (no rules → "No approval rules yet.")                     │
└───────────────────────────────────────────────────────────┘
```

- **Active mode** (REQ-AS-040) — reads the active tab's `controls.permissionMode`.
- **Rule list** (REQ-AS-041) — each rule shows tool · action pattern · decision · lifetime; persisted
  rules carry a **remove** affordance (REQ-AS-042); session rules are listed but are inherently
  ephemeral.
- **Live** (REQ-AS-043) — the surface reflects rule add/remove + mode change without a manual refresh
  (it reads reactive store state).
- Each row + control carries a stable `data-testid` (`approvals-panel`, `approvals-mode`,
  `approvals-rule`, `approvals-rule-remove`, `approvals-empty`).

### A.6 The no-rules / normal-mode default (REQ-AS-052)

With no rule and `normal` mode the flow finds no match → the P4 inline prompt every time. The engine is
a **transparent pass-through** to `setApprovalCallback`; the block renders exactly as on `next`. The
toolbar serialises a turn with no `permissionMode` field (the fold writes it only for non-`normal`
modes, ADR-AS-002 §1). Nothing changes until the user opts in (a rule or a non-normal mode).

### A.7 Accessibility (WCAG 2.2 AA, NFR-AS-013, REQ-AS-050/051)

- **The permission toggle** is keyboard-operable (focus, Enter/Space to activate, Arrow keys through
  the three modes), exposes its active mode to AT (`role="switch"`/`aria-checked` per the live state, or
  a `role="listbox"` for the three-mode pick), and carries an accessible name (REQ-AS-050/051). It is no
  longer `aria-disabled` (the P6 seam state is replaced).
- **The PLAN label** keeps an `aria-label` describing the active plan mode (REQ-AS-051).
- **The approvals rule list** — each `remove` control is a focusable button with an accessible name
  ("Remove rule: Bash git \*"); the list is keyboard-navigable (REQ-AS-050/051).
- **The inline approval block** — the option row (incl. the new deny-always) is keyboard-operable and
  Escape cancels (REQ-AS-025); unchanged from P4 except the added option.
- **Focus** is managed + visible; **forced-colors** + **reduced-motion** are honoured (the mode/state
  cues are text + border, never colour-only) — asserted in component tests.

---

## Part B — UI

### B.1 Component inventory

Each `<script setup>`, each with a co-located `data-testid` PageObject (`.po.ts`) (NFR-AS-010). No
component imports `obsidian`; rules, mode, and decisions arrive as DTOs from the store/view-model
(NFR-AS-006). No `v-html` (NFR-AS-007).

| Component | Responsibility | data-testid | New/changed |
|---|---|---|---|
| `chat/toolbar/PermissionToggle.vue` | the LIVE three-mode toggle (`normal`/`yolo` + the PLAN label); selecting a mode emits up to the surface (REQ-AS-001/002/003); keyboard + AT state (REQ-AS-050/051) — replaces the P6 honest-defer disabled seam | `toolbar-permission` | changed |
| `chat/approvals/ApprovalsPanel.vue` | the status/approvals surface — active mode + the rule list + remove affordance; live (REQ-AS-040..043) | `approvals-panel` | new |
| `chat/approvals/ApprovalRuleRow.vue` | one rule row (tool · pattern · decision · lifetime + remove) (REQ-AS-041/042) | `approvals-rule` | new |
| `chat/inline/InlineApproval.vue` | the P4 approval block — option row gains the `deny-always` entry (additive); render/interaction otherwise unchanged (REQ-AS-022/025/030, NG4) | `inline-approval` | changed (additive) |

`InlineApproval.vue` is the P4 component; P7 adds one option (driven by the additive
`ApprovalDecision` member) and does not change its layout, focus model, or context rendering.

### B.2 `--sp-*` token slice (charter §3.10 `status-panel` / `permission-toggle`)

Reuse the existing token set (`--sp-border`, `--sp-radius-*`, `--sp-bg-*`, `--sp-text-*`, `--sp-accent`,
`--sp-space-*`, `--sp-font-*`, `--sp-status-*`, the P6 `--sp-toggle-track`/`--sp-toggle-thumb`/
`--sp-toggle-active`, `--sp-toolbar-widget-h`). **No hex, no raw Obsidian var, no physical CSS
property** — `lint-style-tokens` guard (NFR-AS-012). Mint only the genuinely-new tokens, each justified
at review against a Claudian `status-panel.css` / `permission-toggle.css` rule:

| New token (only if not already present) | Surface | Maps to Claudian |
|---|---|---|
| `--sp-approvals-row-gap` | rule list rows | `status-panel.css` list spacing (reuse `--sp-space-2` if equivalent) |
| `--sp-approvals-decision-allow` | allow-rule badge | the allow/approve state colour (reuse `--sp-status-success`/`--sp-accent` if equivalent) |
| `--sp-approvals-decision-deny` | deny-rule badge | the deny/blocked state colour (reuse `--sp-status-error`/`--sp-warning` if equivalent) |
| `--sp-permission-mode-active` | the active mode pill | `permission-toggle.css` active fill (reuse `--sp-toggle-active`) |

> Prefer reuse over a near-duplicate; the permission toggle's track/thumb/active tokens already exist
> from P6. Each minted token is checked against a `status-panel.css` / `permission-toggle.css` rule at
> review (NFR-AS-012).

### B.3 Microcopy / i18n (en + de, NFR-AS-015)

All new strings go through the existing `TranslationPort`/`vue-i18n` with English keys (en + de like
P5/P6; full-locale parity is NG8 → P11). The P6 deferred-permission strings
(`toolbar.permission.deferred`) are **removed** (the seam is backed). New keys:

| Key | en |
|---|---|
| `agent.chat.toolbar.permission.mode.normal` | "Normal" |
| `agent.chat.toolbar.permission.mode.plan` | "Plan" |
| `agent.chat.toolbar.permission.mode.yolo` | "Auto-approve" |
| `agent.chat.toolbar.permission.plan` | "PLAN" |
| `agent.chat.inline.approval.allowAlways` | "Always allow" |
| `agent.chat.inline.approval.denyAlways` | "Always deny" |
| `agent.chat.approvals.title` | "Approvals" |
| `agent.chat.approvals.mode` | "Mode: {mode}" |
| `agent.chat.approvals.rulesHeading` | "Rules" |
| `agent.chat.approvals.empty` | "No approval rules yet." |
| `agent.chat.approvals.decision.allow` | "allow" |
| `agent.chat.approvals.decision.deny` | "deny" |
| `agent.chat.approvals.lifetime.session` | "session" |
| `agent.chat.approvals.lifetime.persisted` | "persisted" |
| `agent.chat.approvals.remove` | "Remove rule: {tool} {pattern}" |
| `agent.chat.approvals.storeError` | "Could not read your approval rules — asking for this action." |

No hardcoded user-facing string in any new/changed component; no rule `actionPattern` is logged
(NFR-AS-002).

### B.4 Parity-screenshot plan (deferred to the single final review gate)

Per charter §5.1, parity screenshots vs claudian at **320 / 520 / 720 px, light + dark**: (1) the
permission toggle in each of the three modes (incl. the PLAN label), (2) the inline approval block with
the four-option row (deny / allow once / always allow / always deny), (3) the approvals panel with a
mix of allow/deny + persisted/session rules + the empty state, (4) the auto-decided turn (no prompt
rendered). These accumulate for the single final human review gate (autonomous-drive directive).

---

## Part C — Architecture

### C.1 System overview

```mermaid
flowchart TD
    subgraph ui[ui (Vue, no obsidian)]
        toggle[PermissionToggle.vue — live three-mode]
        inline[InlineApproval.vue — +deny-always]
        panel[ApprovalsPanel.vue + ApprovalRuleRow.vue]
        surface[ChatSurface — registers the approval callback, owns the approvals view]
    end
    subgraph store[ui store]
        tabs["tabsStore — TabControls.permissionMode (per-tab) + rules view state"]
    end
    subgraph app[application]
        mgr[ApprovalManager — decide(): mode gate → match → prompt → persist]
        fold[foldControlOptions — pure, +permissionMode clause]
    end
    subgraph domain[domain]
        matcher[ApprovalMatcher — pure getActionPattern/getActionDescription/matchesRulePattern]
        rule[ApprovalRule DTO]
        pmode[PermissionMode type]
        port[ApprovalRuleStorePort]
        cqo[ChatRuntimeQueryOptions.permissionMode + ToolbarCapabilities expanded]
    end
    subgraph plugin[plugin (owns obsidian)]
        bridges[ObsidianBridge / MockBridge / LocalStorageBridge]
    end
    toggle -->|select mode| surface -->|setControl| tabs
    surface -->|register cb → delegate| mgr
    inline -->|decision| mgr
    panel --> tabs
    mgr --> matcher
    mgr --> port
    tabs -->|submit| fold --> cqo
    port --> bridges
    cqo -.->|read by runtime| bridges
```

### C.2 Components & responsibilities

| Layer | Component | Responsibility | New/changed |
|---|---|---|---|
| domain | `chat/PermissionMode.ts` | `type PermissionMode = 'normal' \| 'plan' \| 'yolo'` (ADR-AS-002 §1) | new |
| domain | `chat/ChatTurn.ts` | append `permissionMode?: PermissionMode` to `ChatRuntimeQueryOptions` (additive; P0–P6 byte-identical) | changed (additive) |
| domain | `chat/toolbar/TabControls.ts` | append `permissionMode?: PermissionMode` (additive) | changed (additive) |
| domain | `chat/inline/Approval.ts` | grow `ApprovalDecision` with `'deny-always'`; add the option label (additive; render unchanged, NG4) | changed (additive) |
| domain | `chat/approvals/ApprovalRule.ts` | the rule DTO `{ id, toolName, actionPattern?, decision, lifetime, createdAt }` (ADR-AS-001 §1) | new |
| domain | `chat/approvals/ApprovalMatcher.ts` | PURE `getActionPattern` / `getActionDescription` / `matchesRulePattern` (+ `isPathPrefixMatch`/`matchesBashPrefix`) — Claudian semantics exactly (ADR-AS-001 §3, REQ-AS-010..015) | new |
| domain | `ports/ApprovalRuleStorePort.ts` | `loadRules`/`addRule`/`removeRule`/`clear`, all `Promise<Result<…>>` (ADR-AS-001 §2) | new |
| domain | `ports/ChatRuntimePort.ts` | widen `ToolbarCapabilities.permissionMode` to `PermissionMode` (ADR-AS-002 §2); the P3/P4/P6 members stay byte-identical | changed (widening) |
| application | `chat/approvals/ApprovalManager.ts` | the decision-flow use case: mode gate → load (store + session) → match → auto-decide OR prompt → persist/session-add (ADR-AS-003); holds in-memory session rules; fail-safe-to-prompt on store error | new |
| application | `chat/toolbar/foldControlOptions.ts` | add a guarded `permissionMode` clause (write only when present + non-`normal`) (ADR-AS-002 §1) | changed (additive) |
| ui | `chat/toolbar/PermissionToggle.vue` | live three-mode toggle + PLAN label (B.1) | changed |
| ui | `chat/approvals/ApprovalsPanel.vue` + `ApprovalRuleRow.vue` | the status/approvals surface (B.1) | new |
| ui | `chat/inline/InlineApproval.vue` | +deny-always option (B.1, additive) | changed (additive) |
| ui | `chat/ChatSurface.vue` | register the approval callback → delegate to `ApprovalManager`; own the approvals view-model + the mode-getter | changed (additive) |
| ui | `stores/tabsStore.ts` | `setControl('permissionMode', …)` reuses the P6 `setControl`; expose the rule list for the panel; the fold picks up `permissionMode` | changed (additive) |
| ui | `composables/useApprovalRuleStorePort.ts` | inject `APPROVAL_RULE_STORE_PORT` (one-port-one-composable, ADR-008) | new |
| infrastructure | three bridges | implement `ApprovalRuleStorePort` (Obsidian device-local / Mock scriptable+in-memory / LS browser-localStorage); the Claude runtime maps `permissionMode`→SDK + the plan-exit setMode sync (ADR-AS-002 §3) | changed |
| infrastructure | `bridge/ports.ts` | add `APPROVAL_RULE_STORE_PORT` InjectionKey | changed (additive) |

### C.3 Additive domain changes

```ts
// src/domain/chat/PermissionMode.ts — new (ADR-AS-002 §1)
export type PermissionMode = 'normal' | 'plan' | 'yolo';

// src/domain/chat/ChatTurn.ts — APPENDED after serviceTier (ADR-AS-002 §1).
// The P0–P6 members stay byte-identical; absent ⇒ the runtime's default ('normal').
export interface ChatRuntimeQueryOptions {
  // model? / forceColdStart? / appendSystemPrompt? / mode? / reasoning? / serviceTier?  — UNCHANGED
  permissionMode?: PermissionMode;   // P7 additive (ADR-AS-002)
}

// src/domain/chat/toolbar/TabControls.ts — APPENDED (ADR-AS-002 §1)
export interface TabControls {
  // model? / mode? / reasoning? / serviceTier?  — UNCHANGED
  permissionMode?: PermissionMode;
}

// src/domain/chat/inline/Approval.ts — union grown (ADR-AS-003 §3, additive)
export type ApprovalDecision = 'deny' | 'allow' | 'allow-always' | 'deny-always';

// src/domain/chat/approvals/ApprovalRule.ts — new (ADR-AS-001 §1)
export interface ApprovalRule {
  readonly id: string;
  readonly toolName: string;
  readonly actionPattern?: string;            // absent / '*' ⇒ match-all for the tool
  readonly decision: 'allow' | 'deny';
  readonly lifetime: 'session' | 'persisted';
  readonly createdAt: number;
}
```

One additive optional per concern, mirroring how P6 appended `mode`/`reasoning`/`serviceTier`. The
`ToolbarCapabilities.permissionMode` union **widens** from `'default' | 'plan'` to `PermissionMode`
(`'default'`→`'normal'`) — the only non-additive *type* change, behaviour-additive and confined to the
P6 callers expanded in P7. `enabledMcpServers?` (P8) / `externalContextPaths?` (later) stay excluded.

### C.4 The `ApprovalRuleStorePort` + the pure matcher + the three-bridge story (ADR-AS-001)

**The port (store-only).** `loadRules`/`addRule`/`removeRule`/`clear`, all `Promise<Result<…>>`. It
handles only the **persisted** lifetime; session rules live in `ApprovalManager` memory. Its own
`InjectionKey` (`APPROVAL_RULE_STORE_PORT`) + composable (`useApprovalRuleStorePort`), one consumer
(the approvals use cases), no aggregate (ADR-008, NFR-AS-005).

**The pure matcher (domain, no I/O).** `getActionPattern` / `getActionDescription` /
`matchesRulePattern` reproduce Claudian's `ApprovalManager` semantics exactly (REQ-AS-010..015):

| Tool family | Match rule | Claudian source |
|---|---|---|
| **Bash** | exact OR explicit wildcard (`"git *"` space form / `"npm:*"` colon form); a bare prefix never matches | `matchesRulePattern` bash branch + `matchesBashPrefix` |
| **File** (`Read`/`Write`/`Edit`/`NotebookEdit`) | path-prefix with path-segment boundaries (`/a/b` ⊃ `/a/b/c`, ¬ `/a/bc`; trailing `/` = subtree); `\`→`/` normalised | `isPathPrefixMatch` + line 71 |
| **Other** (`Glob`/`Grep`/…) | simple prefix; `*`/no-pattern matches all | `matchesRulePattern` other-tool branch |
| **null action** + content rule | does **not** match → falls through to prompt | the null-action guard (line 68) |

| Port / read | `ObsidianBridge` | `MockBridge` | `LocalStorageBridge` |
|---|---|---|---|
| `ApprovalRuleStorePort` | `app.loadLocalStorage('specorator:approval-rules')` / `saveLocalStorage(...)` — device-local, never `data.json`, never a vault file (NFR-AS-003) | **scriptable** in-memory array — seed pre-existing rules; force a load/save failure for the fail-safe test (REQ-AS-053/054) | browser `localStorage` under the same key (GitHub Pages demo) — functional, no Obsidian (REQ-AS-053) |
| permission-mode→SDK + plan-exit setMode | the Claude runtime maps `yolo`↔`bypassPermissions`/`plan`↔`plan`/`normal`↔`default` + emits the session `setMode` on plan-exit (ADR-AS-002 §3) | scriptable runtime (drive the mode-gate tests) | inert (subscription/CLI parity, no live SDK setMode) |

`fake-ports.ts` grows an `approvalRuleStore` member (the scriptable `MockBridge` store, with a
failure-injection switch) so the `ApprovalManager` + panel tests run without Obsidian.

### C.5 Per-tab mode + device-global persisted rules (ADR-AS-002 / ADR-AS-001, CLAR-AS-003)

- **Permission mode is per-tab** (CLAR-AS-003 (a)) — it rides the P6 `TabControls` bag
  (`controls.permissionMode`) on `TabState`; switching tabs reflects that tab's mode (REQ-AS-006). The
  P6 `setControl` action sets it; `freshTab()` seeds `controls: {}` (so an unset member ⇒ `normal`).
- **Persisted rules are device-global** — they live in the device-local store (one set per device, not
  per tab), so an `allow-always` from any tab applies everywhere on that device (REQ-AS-032/034).
- **Session rules are per-session** (in-memory in `ApprovalManager`) — gone on reload (REQ-AS-033). A
  single `ApprovalManager` instance (per surface) holds the session rules; whether session rules are
  per-tab or per-surface is a **spec-level** detail to pin (flagged in Open clarifications).

### C.6 Data flow — primary scenarios

1. **Set mode → send:** `PermissionToggle` select → `ChatSurface` → `tabsStore.setControl('permissionMode',
   'yolo')` → on submit `foldControlOptions` writes `queryOptions.permissionMode = 'yolo'` (only because
   non-`normal`); the runtime maps it to the SDK bypass mode (REQ-AS-002/004, ADR-AS-002).
2. **Matched allow rule:** the runtime fires the approval callback → `ApprovalManager.decide` → mode
   `normal` → load rules → `matchesRulePattern` finds a persisted allow → AUTO-ALLOW, no block renders
   (REQ-AS-020).
3. **Matched deny rule:** same path → a matching deny → AUTO-DENY, no block (REQ-AS-021); deny-wins on
   conflict (REQ-AS-023).
4. **Unmatched → prompt → always allow:** no match → the P4 `InlineApproval` renders → user picks
   "always allow" → `ApprovalManager` builds an `ApprovalRule` (allow, persisted) + `store.addRule`;
   the next matching request auto-allows (REQ-AS-022/030/032).
5. **Allow once:** "allow once" → a session rule held in `ApprovalManager` memory; no store write
   (REQ-AS-031); gone on reload (REQ-AS-033).
6. **Cancel:** Escape → `null` from the block → deny + interrupt the turn; no rule persisted
   (REQ-AS-025).
7. **Plan mode:** mode `plan` → the agent plans → exit-plan attempt → the P4 exit-plan block → on
   `implement`, edits proceed + the runtime syncs the mode session-scoped (REQ-AS-005).
8. **Store failure:** `loadRules` returns `Result.err` → `ApprovalManager` logs (no rule content),
   shows the `approvals.storeError` notice, and falls through to the prompt — never auto-approves
   (NFR-AS-004, REQ-AS-054).
9. **Approvals panel:** `ApprovalsPanel` reads the loaded rules + the active mode; "remove" calls
   `store.removeRule(id)` → the rule is gone → the next matching request re-prompts (REQ-AS-040..043).
10. **No-rules / normal default:** no rule, `normal` → every request prompts (the P4 path); a turn
    folds no `permissionMode` → byte-identical to P6 (REQ-AS-052, NFR-AS-001).

### C.7 Edge cases

- **Empty / unparseable store** — `loadRules` returns `[]` (load-or-default, no migration); the engine
  prompts (REQ-AS-022/032, CHARTER-REQ-FRESH).
- **Null action pattern + content rule** — does not match; falls through to prompt (REQ-AS-014).
- **Bare bash prefix (no wildcard)** — does **not** match (the explicit-wildcard stance, REQ-AS-011);
  the prompt re-surfaces.
- **JSON-fallback pattern** (a serialised input beginning with `{`) — stored without an `actionPattern`
  (match-all for the tool), mirroring `ClaudePermissionUpdates.ts:31`.
- **Conflicting allow + deny match** — deny wins (REQ-AS-023).
- **yolo + a matching deny rule** — yolo short-circuits → allow (the mode gate is first, REQ-AS-024).
- **Tab A plan / tab B normal** — switching reflects each tab's mode (REQ-AS-006).
- **Duplicate "always allow" for the same action** — `addRule` may dedupe by `(toolName, actionPattern,
  decision)` (spec-level — pin the dedupe rule in `spec.md`).
- **Concurrency** — a store write is awaited before the decision resolves; a second request for the
  same action while the first is pending re-evaluates against the rules present at decision time
  (spec-level ordering detail to pin).
- **Matching/engine never throws** — the matcher is total; a store failure is a `Result.err`, not a
  throw (NFR-AS-009); no error crosses the approval-callback boundary (REQ-AS-054).

### C.8 Security analysis (NFR-AS-002/003/004)

- **Rules are inert data, never executable** — an `ApprovalRule` is `{ tool, pattern, decision,
  lifetime }`; the matcher does string comparison, never `eval`/exec; the rule never becomes code
  (NFR-AS-002).
- **No secret in a rule, the store, or a log** — the action pattern is a command/path/glob, never a
  token; `ApprovalManager` logs no `actionPattern` content; the store payload carries no secret
  (NFR-AS-002). A JSON-fallback pattern that could embed input is stored as match-all (no content),
  reducing accidental capture.
- **Device-local only** — rules live in `app.saveLocalStorage`, never `data.json`, never a vault file;
  a test asserts `data.json` + the vault contain no rule data (NFR-AS-003, REQ-AS-034).
- **Fail-safe-to-prompt** — a store load/save failure degrades to the inline prompt + a notice, never a
  silent auto-approve; deny-wins + the explicit-wildcard bash stance keep auto-approve conservative
  (NFR-AS-004, the counter-metric).
- **No provider branch** — the mode gate + capability reads go through ports/getters, never a
  `providerId` literal; the SDK mapping stays in the Claude runtime (REQ-AS-003, NG6).

### C.9 QA seam, Result boundary, constraints

- **QA seam:** the pure matcher (domain) + the `ApprovalManager` decision algorithm (application, with
  the scriptable fake store + a scripted mode getter) + the leaf components (props in, events out) are
  testable in isolation; mounted components get co-located `data-testid` PageObjects (NFR-AS-010); the
  mode-gate / match / fail-safe matrix is driven by the scriptable `MockBridge` store + mode.
- **Result boundary:** every store method returns `Result`; the matcher is total; no exception crosses
  the approval-callback boundary (NFR-AS-004/009, ADR-004).
- **DOM rules:** the toggle, panel, and inline block are declarative Vue — no `v-html`/`innerHTML`, no
  `window.confirm`/`alert`/`prompt`; the inline block stays a non-blocking Vue block (NFR-AS-007).
- **No new dependency:** the matcher + the store are in-repo; the SDK `PermissionUpdate`/`setMode`
  mapping reuses the existing Claude runtime (NFR-AS-016).
- **Identity / manifest:** no secret in any DTO or field; nothing rule/permission-related in
  `data.json`; `manifest.json` untouched; no migration (NFR-AS-014).

### C.10 ADR-AS list (status accepted)

| ADR | Decision | Ratifies | Status |
|---|---|---|---|
| **ADR-AS-001** | `ApprovalRuleStorePort` (store-only, `Result`-typed) + the rule DTO + the PURE matcher + device-local backing (no migration) + three bridges | CLAR-AS-001 (+ CLAR-AS-003 session/persisted half) | accepted |
| **ADR-AS-002** | additive `ChatRuntimeQueryOptions.permissionMode?` + `TabControls.permissionMode?` (folded, non-`normal` only) + widen `ToolbarCapabilities.permissionMode` to the live three-mode value; SDK mapping + plan-exit setMode in the Claude runtime; no provider branch | CLAR-AS-002 (+ CLAR-AS-003 per-tab-mode half) | accepted |
| **ADR-AS-003** | the `ApprovalManager` decision-flow use case (mode gate → match → prompt → persist); deny-wins + mode-gate-first; fail-safe-to-prompt; additive `'deny-always'`; context via the P4 `ApprovalRequest.context`; no-rules default = byte-identical P4 | CLAR-AS-004 + CLAR-AS-005 | accepted |

---

## Requirements coverage (Part C)

| REQ | Covered by |
|---|---|
| REQ-AS-001/003 | live `PermissionToggle.vue` (three modes + PLAN label) reading `controls.permissionMode` + the widened `ToolbarCapabilities` (ADR-AS-002, B.1, A.1) |
| REQ-AS-002 | `setControl('permissionMode')` → `foldControlOptions` → `queryOptions.permissionMode` (ADR-AS-002, C.6) |
| REQ-AS-004 | mode-gate `yolo` → auto-allow (ADR-AS-003 §2, A.2) |
| REQ-AS-005 | mode `plan` → the P4 exit-plan gate + the runtime setMode sync (ADR-AS-002 §3, A.4) |
| REQ-AS-006 | per-tab `controls.permissionMode`; switch reflects (ADR-AS-002, C.5) |
| REQ-AS-010..015 | the pure `ApprovalMatcher` (`getActionPattern`/`matchesRulePattern`/bash-wildcard/file-segment/other-prefix/null-guard/description) (ADR-AS-001 §3, C.4) |
| REQ-AS-016 | the `ApprovalRule` DTO (tool · pattern · decision allow\|deny · lifetime session\|persisted) (ADR-AS-001 §1, C.3) |
| REQ-AS-020/021/023 | `ApprovalManager` match → auto-allow / auto-deny / deny-wins (ADR-AS-003 §2) |
| REQ-AS-022 | no match → the UNCHANGED P4 inline block (ADR-AS-003 §5, A.2/A.6) |
| REQ-AS-024 | mode gate short-circuits the rule lookup (ADR-AS-003 §2) |
| REQ-AS-025 | cancel → deny + interrupt, no rule (ADR-AS-003 §2, A.3) |
| REQ-AS-030/031 | `*-always` → `store.addRule` (persisted); `*-once` → in-memory session rule (ADR-AS-003 §2/§3, C.6) |
| REQ-AS-032/033 | persisted rules load-or-default on reload; session rules ephemeral (ADR-AS-001, C.5) |
| REQ-AS-034 | device-local only, never `data.json`/vault (ADR-AS-001 §4, C.8) |
| REQ-AS-040..043 | `ApprovalsPanel.vue` + `ApprovalRuleRow.vue` (mode + rule list + remove + live) (B.1, A.5) |
| REQ-AS-050/051 | keyboard-operable + AT-state toggle + rule controls (A.7) |
| REQ-AS-052 | no-rules/`normal` = byte-identical P4 + no folded field (ADR-AS-003 §5, C.6) |
| REQ-AS-053 | three-bridge `ApprovalRuleStorePort` (Obsidian/Mock/LS) (ADR-AS-001 §4, C.4) |
| REQ-AS-054 | fail-safe-to-prompt on store error (ADR-AS-003 §2, C.8) |
| NFR-AS-001..016 | additivity (C.3), security/no-secret/device-local/fail-safe (C.8), ports/DDD (C.2/C.4), DOM+Result (C.9), tokens (B.2), a11y (A.7), i18n (B.3), no-dep/manifest (C.9) |

## Open clarifications for the planner (Tasks)

- **None blocking.** All five CLARs resolve (ADR-AS-001..003 accepted). Implementation notes to carry
  into `spec.md`/`tasks.md` (spec-level field detail, not architecture):
  - **Session-rule scope** — whether `ApprovalManager` holds session rules per-surface (one instance) or
    per-tab. Recommendation: per-surface (one `ApprovalManager`), since persisted rules are device-global
    and session rules are a session concern; pin in `spec.md`.
  - **`addRule` dedupe** — whether a duplicate "always allow" for the same `(toolName, actionPattern,
    decision)` is deduped or appended. Recommendation: dedupe by that triple; pin in `spec.md`.
  - **JSON-fallback pattern storage** — confirm a serialised pattern (beginning with `{`) is stored
    without an `actionPattern` (match-all for the tool), mirroring `ClaudePermissionUpdates.ts:31`; pin
    in `spec.md`.
  - **Concurrency / ordering** — a second request for the same pending action re-evaluates against the
    rules present at decision time; pin the ordering rule + whether the store write is awaited before the
    decision resolves in `spec.md`.
  - Sequence the **additive domain grow** (`PermissionMode` + `ChatRuntimeQueryOptions.permissionMode` +
    `TabControls.permissionMode` + `ApprovalDecision`'s `deny-always`) and the **pure matcher** as early
    tasks so the engine + the toggle build on frozen types; the `ApprovalRuleStorePort` + three bridges
    follow; the `ApprovalManager` use case + the UI (toggle/panel/inline option) last.
- **Found slightly under-specified (flagged, not blocking):**
  - The PRD does not pin the **`yolo` lifetime** boundary — whether yolo persists across a reload or is
    session-scoped. Design decision (parity with Claudian's session-scoped bypass + REQ-AS-004 "for the
    session"): treat the *mode* as per-tab draft state (not a persisted rule); a reload returns the tab to
    `normal`. Pin in `spec.md`.
  - The PRD lists `'deny-always'` as the deny-rule extension (CLAR-AS-004) but the P4 `ApprovalDecision`
    union is `'deny' | 'allow' | 'allow-always'`. Design resolves this by **additively** growing the
    union with `'deny-always'` (ADR-AS-003 §3) — the dev grows the P4 DTO + the option label; the block
    render is otherwise unchanged (NG4). Pin the option label + ordering in `spec.md`.
