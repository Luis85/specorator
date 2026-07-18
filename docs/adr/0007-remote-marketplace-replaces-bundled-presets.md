---
title: A remote Marketplace replaces bundled starter presets
date: 2026-07-18
status: accepted
scope: src/features/marketplace, src/features/library, src/features/tasks (roster/loops/templates), src/features/quickActions, src/core/security/urlSafety, src/features/settings/registry/fields/marketplace
supersedes: none
relates-to: docs/product/Specorator Marketplace PRD.md, docs/adr/0003-retire-legacy-library-views.md
method: product decision (owner call, 2026-07-18) implementing the Specorator Marketplace PRD
---

# ADR 0007 — A remote Marketplace replaces bundled starter presets

## Status

**Accepted** (2026-07-18, owner decision, implementing the Marketplace PRD).

## Context

Specorator shipped a fixed set of *starter presets* compiled into the plugin
bundle: `presetLoops`, `presetTemplates`, and `presetAgents`, seeded into the
vault by `installPresetLoops` / `installPresetTemplates` / `installPresetNotes`
and surfaced through "install common …" affordances in the Agent Board and
Library. That model has three structural limits:

1. **The catalog ships with the plugin.** Adding or fixing a starter loop,
   agent, or template requires a plugin release; users on an older version
   never see it.
2. **It is not curatable by anyone but the plugin.** There is no path for a
   growing, community-visible catalog — the PRD's goal.
3. **The presets duplicate content the Library already manages.** Once a user
   has a populated Library, the bundled sets are dead weight in the bundle and
   noise in the UI.

The `Luis85/specorator-marketplace` repo (ADR-adjacent, seeded in a prior step)
now hosts that catalog as versioned Markdown items plus a generated
`index.json` manifest, gated by its own CI. This ADR covers the *plugin* side:
how the plugin consumes that catalog and what it stops shipping itself.

## Decision

**Introduce a dedicated remote Marketplace surface and delete the bundled
starter presets.** Concretely:

- A standalone **Marketplace view** (`VIEW_TYPE_MARKETPLACE`, `store` ribbon,
  `open-marketplace` command) — a Vue 3 + Pinia island reusing the Library's
  list/toolbar components — lets the user browse the remote catalog and install
  items into their vault Library.
- The catalog is fetched over HTTP with Obsidian's **`requestUrl`** (the
  platform's CORS-bypassing request API — the plugin had no prior HTTP client),
  never `fetch`. Every request URL passes the existing SSRF guard
  `assertSafeRemoteUrl` before it leaves the process.
- **Network access is opt-in.** A settings toggle (`marketplaceNetworkEnabled`,
  default off) gates all outbound calls; a one-time in-app notice explains the
  first time the view is opened without it. The catalog base URL is
  overridable (`marketplaceSourceUrl`) for forks/mirrors, defaulting to the
  published `specorator-marketplace` `main` branch.
- The fetched manifest is **cached** at
  `.specorator/cache/marketplace-index.json`; when a later fetch fails the view
  renders the last-known catalog and flags itself offline, so a populated
  Marketplace still works without network.
- Installing an item writes it into the same vault stores the Library already
  owns: loops → loop folder, work-order templates → template folder,
  quick-actions → quick-actions folder (each written **verbatim** to preserve
  provenance frontmatter), and agents → `AgentRosterStore` via parsed
  frontmatter. Install is idempotent (an already-present item is shown as
  installed, not re-created).
- **Skills are deferred.** The four installable types this iteration ships are
  loops, agents, work-order templates, and quick-actions
  (`INSTALLABLE_ITEM_TYPES` excludes `skill`); skill install rides a later pass
  because Skill authoring/ownership differs per provider.
- **The bundled presets are removed**: `presetLoops`, `presetTemplates`,
  `presetAgents`, the `installPreset*` helpers, and their "install common …"
  entry points (plus the `create-work-order-template` preset command) are
  deleted. The template/loop/agent/quick-action *subsystems themselves are
  untouched* — only the shipped starter content and its install UI go away.

## Consequences

- **The catalog evolves without a plugin release.** New and fixed items land in
  the marketplace repo and reach every user with network access on next fetch.
- **A fresh vault starts empty.** New users populate their Library from the
  Marketplace instead of receiving auto-seeded presets. This is the intended
  trade: an empty, opt-in start over an opinionated bundled one. Existing vaults
  keep whatever presets they had already installed — removal is bundle-only and
  touches no vault content.
- **The plugin now makes outbound network requests** where it previously made
  none. That capability is strictly opt-in, single-origin by default,
  SSRF-guarded, and cache-backed; no telemetry or write-back to the remote.
- **`INSTALLABLE_ITEM_TYPES` is the seam for the deferred Skills work** — adding
  `skill` there (plus an installer branch) is the whole extension point, so the
  deferral does not ossify.
- The Marketplace is a view-level surface and therefore a legitimate new Vue
  island under ADR 0006 ("new view-level product surfaces may still choose the
  island pattern"); it reuses the Library's components rather than growing a
  parallel UI stack.
