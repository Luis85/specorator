---
type: prd
name: Specorator Marketplace
title: Specorator Marketplace — a curated catalog of Quick Actions, Agents, Loops, and Work-Order Templates, installable from inside the plugin
version: 0.2
status: draft
date: 2026-07-06
owner: Luis
product: "[[Specorator - Product Vision]]"
scope: features/quickActions, features/agents/roster, features/tasks/loops, features/tasks/templates, new features/marketplace, docs/product
tags:
  - prd
  - specorator
  - marketplace
  - quick-actions
  - agent-roster
  - agent-loops
  - work-order-templates
related:
  - "[[Specorator - Product Vision]]"
  - "[[Specorator Agent Harness PRD]]"
  - "[[Quick Actions]]"
  - "[[Agent Roster]]"
  - "[[Agent Loops]]"
  - "[[Agent Kanban Board]]"
---

# Specorator Marketplace PRD

## 1. Overview

Specorator already lets a user build four kinds of reusable, vault-native assets: **[Quick Actions](features/Quick%20Actions.md)** (saved prompts), **[Agent Roster](features/Agent%20Roster.md)** entries (named specialists with a brief, instructions, and tool grants), **[Agent Loops](features/Agent%20Loops.md)** (Use-when/Approach/Steps/Verify/Notes playbooks attached to work orders), and **[work-order templates](user-manuals/work-order-templates.md)** (reusable starting points — body, provider/model/priority defaults — for creating an Agent Board work order). All four are plain files the user owns — Markdown notes or JSON — and three of the four already ship a small, hand-picked starter set the user can install with one click (`PRESET_LOOPS`, curated and adapted from the [Forward-Future loop library](https://github.com/Forward-Future/loop-library); `PRESET_AGENT_SPECS`; `presetTemplates` — Bug fix, Feature, Refactor, Research spike, Documentation, Test backfill). Quick Actions has no starter set today.

This PRD proposes turning that one-off, bundled-in-code starter set into a live, browsable **Marketplace**: a curated GitHub-hosted catalog — the **`specorator-ecosystem`** GitHub Project — that the plugin can query from a dedicated **Marketplace view**, letting a user browse, preview, and install community- and Specorator-curated Quick Actions, Agents, Loops, and Work-Order Templates without ever leaving Obsidian, and without hand-authoring the file themselves.

This document captures the idea and its requirements. **No implementation is in scope for this PRD** — it exists so the shape of the feature, its open questions, and its relationship to shipped features are on record before design/build work starts.

## 2. Problem statement

- **Cold start.** A new user opens Quick Actions, Agent Roster, Loops, or the work-order template picker and sees an empty list (or, for Loops/Agents/Templates, a small bundled set they must discover a settings button or command to install). They have to invent good prompts, agent briefs, playbooks, and work-order skeletons from nothing.
- **No sharing loop.** Quick actions, agents, loops, and templates are "plain files you own" by design — good for portability, bad for discovery. There is no way today for one user's well-tuned "research analyst" agent, "ticket to PR-ready" loop, or "research spike" template to reach another user, short of copy-pasting a file over Discord or a gist.
- **The bundled-preset model doesn't scale.** `PRESET_LOOPS`, `PRESET_AGENT_SPECS`, and `presetTemplates` are arrays compiled into the plugin. Adding, fixing, or retiring an entry requires a plugin release. There's no versioning, no attribution beyond a code comment, and no way for the community to contribute without a PR against the plugin itself.
- **This was already flagged and deferred.** The [Agent Loops Library design](../superpowers/specs/2026-06-22-agent-loops-library-design.md) explicitly lists **"Online-catalog sync from `signals.forwardfuture.ai`"** as a v1 non-goal. The [Agent Harness PRD](Specorator%20Agent%20Harness%20PRD.md) (F-HARN-6, Could) names the same gap for the broader Harness Library: *"a path to community sharing without an app store."* This PRD is that path, scoped concretely to the four asset types that already have a working local storage model.

## 3. Goals & non-goals

### Goals

- **G1 — One place to browse.** A dedicated **Marketplace view** inside Specorator lists installable Quick Actions, Agents, Loops, and Work-Order Templates from a curated, versioned, externally-hosted catalog.
- **G2 — Install without hand-authoring.** Installing an item writes it into the user's existing storage for that type (the Quick Actions folder, `.specorator/agents/`, the configured Loop folder, the configured Template folder) using the same stores the app already uses for user-authored items — the Marketplace is a source of new files, not a parallel storage system.
- **G3 — Preview before install.** A user can read an item's full content (prompt, brief, playbook body, template body) and its attribution/source before committing to install it — no blind installs.
- **G4 — Safe to leave off.** The Marketplace is opt-in and network-dependent; a user who never opens it, or who has no network access, sees zero behavior change to Quick Actions, Agent Roster, Loops, or work-order templates.
- **G5 — Generalizes, doesn't replace, the bundled-preset pattern.** `PRESET_LOOPS`/`PRESET_AGENT_SPECS`/`presetTemplates` remain as the offline-safe default starter sets; the Marketplace is the richer, larger, updatable catalog layered on top.

### Non-goals (v1)

- **NG1 — Publishing/contributing from inside the plugin.** v1 is browse-and-install only. Submitting a new item to `specorator-ecosystem` is a GitHub PR against that repo, made outside Specorator, not an in-app "share" flow.
- **NG2 — Skills.** The user's ask is scoped to Quick Actions, Agents, Loops, and Work-Order Templates. Vault Skills (`$name`, `.claude/skills` et al.) already have their own discovery/aggregation model (`VaultSkillAggregator`) and are explicitly out of scope here — revisit once/if this ships and proves out.
- **NG3 — Automatic/silent updates.** If a catalog item changes after install, Specorator does not silently rewrite the user's installed copy. (Whether/how update notifications work at all is [OQ4](#7-open-questions).)
- **NG4 — Paid or gated listings.** Everything in the catalog is free and licensed for redistribution; no marketplace commerce.
- **NG5 — Self-hosted/enterprise catalog endpoints.** v1 points at one Specorator-owned catalog. A configurable/alternate catalog URL is future scope ([OQ6](#7-open-questions)).

## 4. Personas

- **Sam — the knowledge worker (primary).** Wants a good starting set of prompts, playbooks, specialists, and work-order skeletons without inventing them from scratch. Will browse a "Popular" or "Staff picks" list and install a handful.
- **Devin — the power user (secondary).** Has already built a roster of loops, agents, and templates by hand. Uses the Marketplace occasionally to fill a gap ("is there already a good code-review loop?") rather than as a primary workflow.
- **A contributor (out of scope for the in-app experience, but shapes the catalog design).** Someone who wants their well-tuned loop, agent, or template to reach other users opens a PR against `specorator-ecosystem` following its contribution guide — no in-app tooling required for v1 (NG1).

## 5. Current state (what this builds on)

| Asset type | Storage today | Existing "install a starter set" mechanism | Existing browse UI |
|---|---|---|---|
| Quick Actions | Markdown notes in a user-configured vault folder | **None** — no bundled preset exists today | Lightning-bolt picker in chat composer + `QuickActionsSettingsTab` |
| Agent Roster | JSON files under `.specorator/agents/` | `PRESET_AGENT_SPECS`, installed on demand, skips already-installed | Agent Roster library view (`renderLibraryShell`) |
| Agent Loops | Markdown notes (`type: specorator-loop`) in a user-configured folder | `PRESET_LOOPS`, curated from Forward-Future/loop-library, installed via Loop library view or Agent Board settings, skips already-present | Loop library view (`renderLibraryShell`) |
| Work-Order Templates | Markdown notes (`type: specorator-work-order-template`) in a user-configured Template folder | `presetTemplates` (Bug fix, Feature, Refactor, Research spike, Documentation, Test backfill), installed via command palette or Agent Board settings, skips filenames that already exist | `WorkOrderTemplatePickerModal` (opens on every work-order create surface) + `WorkOrderTemplateEditorModal` |

Agent Roster, Skills, and Loops already share one render shell (`renderLibraryShell` + `createLibraryCard` + `renderLibraryNav` — see the [Library Views Overhaul design](../superpowers/specs/2026-06-28-library-views-overhaul-design.md)), which is adding search/sort/tag-filter to all three. Work-order templates use a separate picker-modal pattern (`WorkOrderTemplatePickerModal`) rather than the library shell. A Marketplace view is the natural fifth surface spanning both patterns, or an "Install from Marketplace" entry point surfaced from within each of the four existing surfaces — see [OQ2](#7-open-questions).

## 6. Functional requirements

### 6.1 The catalog (`specorator-ecosystem`)

- **F-CAT-1 [M] One curated, versioned catalog.** The `specorator-ecosystem` GitHub Project hosts a manifest (index) plus the actual item files (or a manifest that points at per-item files within the same repo/org). Format — single repo with `quick-actions/`, `agents/`, `loops/`, `templates/` folders plus a generated index, vs. a lightweight package-per-repo model — is [OQ1](#7-open-questions).
- **F-CAT-2 [M] Each item is self-describing.** An item carries at minimum: name, description, type, tags/category, the payload itself (prompt text / agent JSON fields / loop sections / template body + frontmatter defaults), an author/attribution line, and a license. This mirrors the frontmatter-driven schema Loops, Agents, and Templates already use, so an installed item is indistinguishable from a hand-authored one once it lands in the vault.
- **F-CAT-3 [M] Fetched over plain HTTPS, no auth required for read.** Use Obsidian's `requestUrl` (not `fetch`, per platform convention) against the GitHub raw-content or API endpoint. Unauthenticated GitHub API calls are rate-limited (60 requests/hour per IP) — the manifest fetch must collapse to one or two calls per refresh, not one call per item ([OQ7](#7-open-questions) covers caching).
- **F-CAT-4 [S] Cached locally, refreshed on demand.** The plugin caches the last-fetched catalog (e.g. under `.specorator/`) so the Marketplace view is usable offline (read-only, last-known list) and doesn't refetch on every open.

### 6.2 The Marketplace view

- **F-VIEW-1 [M] A dedicated Marketplace view/tab**, following the existing library-shell pattern, listing catalog items with name, short description, type badge (Quick Action / Agent / Loop / Work-Order Template), and tags.
- **F-VIEW-2 [M] Search, filter by type, and filter by tag** — reusing the shared list/search/filter engine the Library Views Overhaul is introducing (`LibraryListController`) rather than building a parallel one.
- **F-VIEW-3 [M] A detail/preview pane** showing the full payload (the prompt text; the agent's brief, instructions, and tool grants; the loop's Use when/Approach/Steps/Verify/Notes; the template's body and provider/model/priority defaults) plus attribution and license, before the user commits to installing.
- **F-VIEW-4 [M] One-click Install**, routed through each type's existing store (the Quick Actions note writer, `AgentRosterStore.save`, `LoopNoteStore.save`, `TemplateNoteStore.save`) — the exact mechanism `PRESET_LOOPS`/`PRESET_AGENT_SPECS`/`presetTemplates` already use, so an installed item is a normal user-owned file from that point on.
- **F-VIEW-5 [S] Already-installed indicator.** If an item with the same catalog id is already installed, show "Installed" instead of "Install" (mirrors the preset-loop / preset-template dedup behavior).
- **F-VIEW-6 [C] Update available indicator.** If an installed item's catalog version has moved on, surface that — without auto-applying it (NG3). Depends on [OQ4](#7-open-questions).

### 6.3 Settings & opt-in

- **F-SET-1 [M] Marketplace is off by default or clearly gated behind an explicit "Browse Marketplace" action** — it must not fetch network content the user hasn't asked for. This is consistent with the plugin's existing default-off posture on network tools (see the Agent Harness PRD's security model, §9).
- **F-SET-2 [S] A visible source/attribution line** in the Marketplace view itself ("Catalog: github.com/specorator-ecosystem/…") so a user always knows where installed content came from — required disclosure for a plugin that fetches remote content, per Obsidian community-plugin review norms.

### 6.4 Security & trust

Installed items become part of what an agent reads and acts on — a Quick Action is a prompt sent verbatim, an Agent's brief/instructions lead a conversation, a Loop's Approach/Steps/Verify get injected into a task prompt, a Template's body becomes a work order's Objective/Acceptance Criteria/Context/Constraints. A malicious or poorly-reviewed catalog entry is a **prompt-injection/social-engineering risk**, not a code-execution risk (nothing in the catalog format executes code or grants tools by itself — an installed agent still only gets the tools the user explicitly grants it in the Agent Roster editor, and an installed template only ever prefills a work order the user still scopes and approves, per each feature's existing model).

- **F-SEC-1 [M] Curation, not open self-service, for v1.** Every catalog entry ships through a review step (a PR against `specorator-ecosystem`, reviewed before merge) — not an unmoderated user-upload feed. This matches how the existing Forward-Future attribution/adaptation was handled (curated and adapted, not blindly imported).
- **F-SEC-2 [M] Preview is mandatory, not optional.** The Install action is only reachable from the detail/preview pane (F-VIEW-3) — no install-from-the-list-row shortcut that skips reading the payload.
- **F-SEC-3 [S] Installed items carry their source.** Store the catalog id/source URL alongside the installed file (e.g. a frontmatter field on the loop/template note, a field on the agent JSON) so a user can later trace "where did this come from" and so update-detection (F-VIEW-6) has something to key on.

## 7. Open questions

1. **What exactly is `specorator-ecosystem`?** A single GitHub repo (folders per type + generated index), a GitHub organization with one repo per item, or an actual GitHub Projects (v2) board used as a curation/triage tool in front of one of the above? The name and "GitHub Project" phrasing need to resolve to a concrete repo layout before any implementation spec.
2. **Where does the Marketplace entry point live?** A new top-level view, or an "Install from Marketplace" affordance added to each of the four existing surfaces (Quick Actions picker, Agent Roster view, Loop library view, work-order template picker)? The latter avoids a fifth navigation destination but fragments the browsing experience, and it has to bridge two different UI patterns (the shared library shell vs. the template picker modal).
3. **Packaging granularity.** Is a "Quick Action" catalog entry one prompt, or can an entry bundle a small set (e.g. a "code review starter pack" of a template, a loop, and a couple of related quick actions/agents installed together)?
4. **Update semantics.** If we do want update-available signaling (F-VIEW-6), how is a catalog item versioned (content hash? semver? last-modified date), and how do we diff a modified-by-the-user installed copy against a catalog update without clobbering local edits?
5. **Contribution/moderation process.** What's the actual review bar for a community-submitted PR to `specorator-ecosystem` — style guide, test/example requirement, license requirement, a maintainer sign-off? This needs to exist before the catalog can safely grow past a small in-house-curated set.
6. **Configurable catalog source.** Should Settings ever expose an alternate catalog URL (self-hosted/private team catalogs), or is `specorator-ecosystem` the only source for the foreseeable future (NG5)?
7. **Caching & rate limits at scale.** Unauthenticated GitHub API calls are capped at 60/hour/IP. Is a manifest-file-over-raw-content fetch (a single `raw.githubusercontent.com` GET) sufficient, or does browsing many items' full payloads risk hitting that ceiling for an active user?
8. **Mobile.** Unlike the CLI-dependent parts of the Harness roadmap, a Marketplace read/install flow has no Node dependency — it's `requestUrl` + vault writes. Is there a reason this couldn't work on mobile, where Quick Actions/Agents/Loops/Templates themselves are usable?
9. **Templates' provider/model defaults across a shared catalog.** A template can pin a `provider`/`model` in its frontmatter ([work-order-templates](user-manuals/work-order-templates.md)). A catalog-sourced template pinning a provider the installing user doesn't have enabled already falls back gracefully today (documented "Prefill rules" behavior) — confirm that's sufficient, or whether the Marketplace preview should warn about this before install.

## 8. Success metrics

- A first-run user can find and install at least one Quick Action, one Agent, one Loop, and one Work-Order Template without leaving Obsidian or reading external documentation.
- The bundled-in-code preset arrays (`PRESET_LOOPS`, `PRESET_AGENT_SPECS`, `presetTemplates`) are either superseded by or reconciled with the live catalog, with no duplicate/conflicting "starter set" install paths left for the user to be confused by.
- Installed items are indistinguishable from hand-authored ones in every existing view (library shell, chat composer picker, template picker) — no special-cased "marketplace item" rendering path required downstream.

## 9. Scope & constraints

### Included in this PRD's scope

- The product idea, problem statement, and requirements captured above.
- Identification of the existing storage/UI seams (`AgentRosterStore`, `LoopNoteStore`, `TemplateNoteStore`, the Quick Actions folder, the shared library shell, the template picker modal) the Marketplace should build on rather than duplicate.

### Explicitly out of scope for this PRD

- Any implementation: no new view, store, fetch client, or catalog repo is created by this document.
- Resolving the open questions in §7 — those are inputs to a follow-up design spec, not decisions this PRD makes.

## 10. Related documents

- [Specorator - Product Vision](Specorator%20-%20Product%20Vision.md)
- [Specorator Agent Harness PRD](Specorator%20Agent%20Harness%20PRD.md) — §8.9 Harness Library, F-HARN-6 ("Share & import") names the same gap at the broader skills/tools/rules level
- [Quick Actions](features/Quick%20Actions.md)
- [Agent Roster](features/Agent%20Roster.md)
- [Agent Loops](features/Agent%20Loops.md)
- [Agent Kanban Board — Work-Order Templates](user-manuals/work-order-templates.md)
- [Agent Loops Library design](../superpowers/specs/2026-06-22-agent-loops-library-design.md) — the explicit prior non-goal this PRD picks up, and (per its own "mirroring the template subsystem" note) the design precedent the templates subsystem set for loops
- [Library Views Overhaul design](../superpowers/specs/2026-06-28-library-views-overhaul-design.md) — the shared list/search/filter engine a Marketplace view should reuse
- [Specorator quick-actions marketplace](../ideas/Specorator%20quick-actions%20marketplace.md) — the original idea note this PRD formalizes and expands to Agents, Loops, and Work-Order Templates

## 11. Notes

- This PRD deliberately does not pick a repo layout, manifest schema, or fetch client — those are follow-up design-spec work once the idea is validated.
- The existing attribution convention (`PRESET_LOOPS`' code comment crediting Forward-Future) should carry forward as a first-class, user-visible field on every catalog entry, not just a source-code comment.
- Work-order templates were added to this PRD's scope after the initial draft, at the user's request — the templates subsystem (`src/features/tasks/templates/`) was the original model the Agent Loops Library design copied ("mirroring the template subsystem"), so folding templates back into the same Marketplace closes that circle rather than bolting on an unrelated fourth type.
