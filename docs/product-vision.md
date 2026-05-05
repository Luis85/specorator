---
title: "Specorator product vision"
doc_type: vision
status: draft
owner: product
last_updated: 2026-05-05
references:
  - docs/prd.md
  - docs/roadmap-v1.md
---

# Product Vision

## Ecosystem Architecture

Specorator is one component in a four-part ecosystem. The plugin is the **user-facing layer** — the cockpit through which a user interacts with everything else.

```
┌─────────────────────────────────────────────────────────────────┐
│                      specorator-plugin                           │
│        (UI cockpit — Obsidian sidebar + standalone browser)      │
│  onboarding · chat sidebar · workflow navigator · review cards   │
└──────────────────────┬──────────────────────────────────────────┘
         commands / session triggers ↓ ↑ event stream
┌──────────────────────▼──────────────────────────────────────────┐
│              Obsidian MCP Server (v1: built in)                  │
│    obsidian:// tools · vault tools · canvas tools · bases tools  │
│    write proposals → accept / reject queue                       │
└─────────────┬─────────────────────────────┬─────────────────────┘
              │ MCP tool calls               │ MCP tool responses
┌─────────────▼─────────────┐   ┌────────────▼─────────────────────┐
│     Claude CLI subprocess  │   │         specorator-runtime        │
│  @anthropic-ai/claude-code │   │  execution engine · session model │
│  SDK · ClaudeCliPort (v1)  │   │  RuntimePort (v2.0 replacement)   │
└────────────────────────────┘   └──────────────────────────────────┘
                                                    │
                                     ┌──────────────▼──────────────┐
                                     │         agentonomous         │
                                     │  PM · architect · engineer   │
                                     │  QA · writer agent roles     │
                                     └─────────────────────────────┘
```

| Component | Role |
|---|---|
| [`specorator-plugin`](https://github.com/Luis85/specorator) | UI layer. Obsidian plugin and standalone browser app. In v1: onboarding, Claude CLI chat sidebar, workflow state navigator, vault scaffolding, and quality checks. In v2.0: triggers runtime sessions, subscribes to runtime events, and presents execution state. |
| **Obsidian MCP Server** | Native in-process MCP server embedded in the plugin. Exposes Obsidian's full data model — Markdown, frontmatter, wikilinks, Canvas, Bases, MetadataCache — as tool surfaces. All write operations go through a proposal queue; nothing is applied without user acceptance. Claude CLI connects as MCP client in v1; agentonomous agents connect in v2.0. |
| [`specorator-runtime`](https://github.com/Luis85/specorator-runtime) | Execution engine (v2.0). Interprets workflow definitions, manages session lifecycle, invokes agents, emits typed events, and exposes queryable state. Replaces `ClaudeCliPort` with `RuntimePort`. |
| [`agentic-workflow`](https://github.com/Luis85/agentic-workflow) | Methodology and definitions. Stage model, templates, quality gates, and traceability conventions. Released versions are the source of truth for workflow structure. |
| [`agentonomous`](https://github.com/Luis85/agentonomous) | Agent capabilities. TypeScript autonomous-agent library. Provides PM, architect, engineering, QA, and writer agent roles. In v2.0, these connect to the same MCP server the plugin hosts. |

---

## Vision

Specorator gives individuals and teams a single, approachable cockpit inside Obsidian — or a standalone browser — to move from rough idea to tested code through a fully guided, AI-assisted workflow.

The plugin surfaces deterministic workflow tooling (validation, templates, quality gates, scaffolding) and a Claude CLI-powered chat sidebar in v1. The sidebar is context-aware: it knows the user's persona, the active file, the current workflow stage, and opted-in vault content. Agents interact with the vault through the embedded MCP server — not through system-prompt text dumps — so every operation (reading Canvas, writing a spec, updating frontmatter) uses Obsidian's native data model.

In v2.0, the plugin connects to `specorator-runtime` to run fully orchestrated agentic sessions end-to-end. The MCP server serves both: Claude CLI in v1 and agentonomous agents in v2.0.

The plugin is designed for non-technical users. No AI terminology, methodology jargon, or technical language is exposed in the interface.

---

## Product Promise

Specorator helps individuals and teams move from idea to release through visible, auditable workflow stages. The vault is the durable output — all artifacts are plain Markdown files that remain useful without the plugin. Agents propose; users decide. Nothing is applied to the vault without explicit acceptance.

---

## Human-Agent Centered Design (H-ACD)

H-ACD is the named design philosophy that governs every product and engineering decision in Specorator. It has four principles.

### 1. Workflow Encapsulation

The plugin presents the full Agentic Development Lifecycle — all 12 stages from idea to retrospective — as a unified, navigable surface. Users never need to know the underlying methodology structure. Stage transitions are guided; blockers are named in plain language.

### 2. Human Authority Over Outcomes

Every agent output arrives as a proposal. The user reviews, edits, accepts, or rejects it before any change is committed to the vault. This applies to all write operations — whether triggered from the chat sidebar or from an automated agent task.

### 3. Intent-First Interaction

Users express intent ("write this up", "what should I do next?"). The plugin assembles context silently (persona, active file, workflow state, vault graph) and translates intent into agent instructions. Users never write prompts, configure tools, or manage context manually.

### 4. The Vault as the Agentic Operating Environment

The vault is not just an output store — it is the agents' operating environment. Agents read Canvas files to understand visual plans, query Bases to work with structured data, traverse the wikilink graph for context, and write back through tool calls. All of this happens through the embedded MCP server. The vault retains full Obsidian compatibility at all times.

---

## Agentic Development Lifecycle (ADLC)

Specorator covers all 12 workflow stages with context-appropriate agent roles and a clear governance model.

| # | Stage | Plain-language label | Agent role | Who leads |
|---|---|---|---|---|
| 1 | `idea` | Exploring the idea | PM agent | User |
| 2 | `research` | Looking into it | PM agent | User |
| 3 | `requirements` | What it needs to do | PM agent | User |
| 4 | `design` | How it should look and feel | Architect agent | User |
| 5 | `spec` | The full plan | Architect agent | User |
| 6 | `tasks` | Breaking it into steps | Architect agent | User |
| 7 | `implementation-log` | Building it | Engineering agent | Agent proposes, user governs |
| 8 | `test-plan` | How we'll check it works | QA agent | Agent proposes, user governs |
| 9 | `test-report` | What we found | QA agent | Agent executes, user decides |
| 10 | `review` | Checking our work | Writer agent | User |
| 11 | `release-notes` | Telling people about it | Writer agent | User |
| 12 | `retrospective` | What we learned | PM agent | User |

**Governance model:**

- **Stages 1–6 (Planning):** User leads the conversation. Agents assist, draft, and suggest. All outputs are proposals the user accepts or refines.
- **Stages 7–8 (Execution):** Agents generate code and test plans. User reviews diffs and output proposals before anything is applied. User retains authority to accept, reject, or redirect.
- **Stage 9 (Verification):** Agent executes tests and reports results in plain language. User decides whether the results are acceptable to proceed.
- **Stages 10–12 (Closure):** User leads. Agents draft documents and summaries. User reviews and accepts.

---

## v1 Alpha — Foundation

The v1 alpha establishes the plugin foundation and delivers the first meaningful AI-assisted workflow experience:

1. **Onboarding:** Welcome the user, capture a personal introduction ("Tell us about yourself"), verify Claude CLI availability, configure the vault, and install the agentic-workflow template — all in a single guided flow.
2. **Workflow installer:** Install `agentic-workflow` template content into the active vault with overwrite protection.
3. **Claude CLI chat sidebar:** A Cursor-like always-visible side panel. Context-aware (persona, active file, workflow state, opt-in vault files). Agents interact with the vault through the embedded MCP server. Plain language throughout.
4. **Workflow navigator:** Show the current project, active stage, required artifacts, and next valid actions.
5. **Artifact creation:** Scaffold new workflow artifacts from plugin commands.
6. **Obsidian MCP server:** Embedded in-process MCP server exposing Markdown, frontmatter, wikilinks, Canvas, Bases, and MetadataCache as tool surfaces. All write operations queue a proposal for user acceptance.
7. **Vault-compatible outputs:** All artifacts are plain Markdown files that remain useful without the plugin.
8. **v2.0 extension point:** `ClaudeCliPort` and `ObsidianMcpServerPort` designed as stable seams that v2.0 satisfies with `RuntimePort` and agentonomous agents — no rewrite required.

v1 includes live AI assistance via Claude CLI. The experience is designed to work without an LLM configured — scaffolding, validation, and navigation are always available.

---

## v2.0 — Runtime-Connected Agentic Cockpit

v2.0 connects the plugin to [`specorator-runtime`](https://github.com/Luis85/specorator-runtime), turning it into a fully orchestrated agentic cockpit.

The user triggers a workflow session from the plugin. The runtime interprets the active workflow definition, resolves the task graph, and invokes agents from [`agentonomous`](https://github.com/Luis85/agentonomous) at each task. The agentonomous agents connect to the same MCP server the plugin already hosts — they use the same tool surface that the Claude CLI subprocess used in v1.

The plugin subscribes to the runtime's event stream and renders execution state in real time. All agent outputs arrive as proposals; the user reviews, edits, accepts, or rejects each one before it becomes a vault artifact.

---

## Target Users

| Role | Primary need |
|---|---|
| Solo builder | A guided path from rough idea to implemented feature |
| Product manager | Requirements, design decisions, and tasks connected and traceable |
| Non-technical founder | Express ideas and get structured output without touching code or prompts |
| Business analyst | Turn stakeholder conversations into structured requirements and specs |
| Engineering lead | Workflow discipline, code review, and release documentation without leaving the vault |
| Designer | UX brief, design decisions, and review artifacts in one place |
| Teams adopting agentic development | Workflow discipline without making an LLM the sole operator |
| Maintainers | Vault quality checks, repair paths, and traceability signals inside Obsidian |

---

## Principles

- **Workflow first.** The plugin models the full 12-stage lifecycle, not just note editing shortcuts.
- **Vault first.** The vault is the agents' operating environment. Agents read and write through MCP tools that honour the Obsidian data model — Markdown, frontmatter, wikilinks, Canvas, Bases.
- **Local first.** v1 tooling works offline. The runtime runs locally. No hosted Specorator service is required.
- **LLM optional.** v1 scaffolding, validation, and navigation are fully productive without any LLM provider configured. v2.0 degrades gracefully when no provider is available.
- **Plain language.** No AI terminology, methodology jargon, or technical language is exposed to the user. Stage names, actions, and messages are written for people, not developers.
- **Intent first.** Users express what they want. The plugin assembles context and translates intent into agent instructions silently.
- **Human-owned decisions.** The interface surfaces choices and risks, but the user remains responsible for intent, priority, and acceptance.
- **Inspectable state.** Users see the active stage, required artifacts, quality gates, blockers, and next actions — and in v2.0, live session state from the runtime.
- **Deterministic upkeep.** Validation, linting, traceability checks, scaffolders, and repair helpers are exposed as normal plugin capabilities.
- **Runtime transparency.** In v2.0, the plugin shows what the runtime is doing — which tasks are executing, which agents are active, what events have fired.
- **User-controlled agents.** Agents propose; the user decides. Context shared with agents is explicit and revocable per run.

---

## Core Experience

The first-class experience is a workflow cockpit inside Obsidian:

- **Chat sidebar (always visible):** A Cursor-like side panel showing a warm, context-aware greeter and conversation interface. Suggested actions per stage ("Write this up", "What should I do next?"). Agents operate on the vault through MCP tool calls; write operations surface as review cards the user accepts or rejects.
- **Workflow navigator:** Shows the current project, feature, workflow stage, completion state, and next valid actions.
- **Artifact creation:** Creates or updates workflow artifacts from templates via plugin commands.
- **Validation and repair:** Runs local checks and shows results with direct links to affected notes.
- **Traceability:** Tracks requirements, tasks, tests, decisions, and release artifacts.
- **v2.0:** Triggers runtime sessions and streams live execution state — task graph, agent activity, event log — directly in the panel.
- **v2.0:** Presents agent-proposed outputs in a review interface; user accepts, edits, or rejects before any vault write.

---

## Required Tooling Surface

The plugin makes these capabilities available without requiring chat-based operation:

- Onboarding and persona setup.
- Template installation and vault initialisation.
- Project and feature scaffolding.
- Stage transition checks.
- Template-driven artifact creation.
- Requirement and traceability validation.
- Vault linting and consistency checks.
- Quality gate execution and result display.
- Issue, decision, and clarification tracking.
- Repair guidance for missing or inconsistent artifacts.
- Export or handoff summaries for pull requests, releases, and reviews.
- **v2.0:** Runtime session management — start, monitor, cancel, inspect.
- **v2.0:** Agent output review — accept, edit, reject, or request refinement.

---

## Obsidian MCP Server — Tool Surface

The embedded MCP server exposes Obsidian's data model as callable tools across seven groups:

| Group | Representative tools |
|---|---|
| Vault navigation | `vault_list_files`, `vault_search`, `vault_get_metadata` |
| Markdown read | `note_read`, `note_get_frontmatter`, `note_get_links` |
| Markdown write (queued) | `note_create`, `note_update`, `note_append`, `note_delete` |
| Frontmatter (queued) | `frontmatter_set_property`, `frontmatter_bulk_update` |
| Canvas read | `canvas_read`, `canvas_list_nodes`, `canvas_find_connected` |
| Canvas write (queued) | `canvas_add_node`, `canvas_add_edge`, `canvas_update_node` |
| Bases / structured data | `bases_query`, `bases_get_property_schema`, `bases_set_property` (queued) |

All write-group tools return `{ proposalId, status: "pending" }`. The plugin renders each proposal as a review card in the chat sidebar. The vault is not modified until the user accepts.

---

## Non-Goals

- Replacing Obsidian as the editing environment.
- Requiring any specific LLM provider or any hosted Specorator service.
- Hiding workflow artifacts behind opaque plugin state.
- Automating human approval gates.
- Turning the workflow into a generic project management board detached from specs.
- Giving agents unrestricted vault access by default.
- Automatically accepting or applying agent outputs without user review.
- Implementing execution, scheduling, or session management inside the plugin beyond v1 ClaudeCliPort — `specorator-runtime` owns that in v2.0.
- Implementing agent cognition or capabilities inside the plugin — `agentonomous` owns that.

---

## Success Signals

- A new user completes onboarding, describes themselves in plain language, and starts a conversation about their idea — without reading any documentation.
- A non-technical founder can move from idea to requirements without writing a single prompt or configuring a tool.
- An agent reads a Canvas file, proposes an update, and the user accepts or rejects it from a review card — without touching JSON.
- A maintainer can run vault quality checks from the plugin and understand every reported issue.
- The same workflow artifacts remain readable and usable as Markdown files.
- LLM-disabled usage remains productive for scaffolding, validation, upkeep, and review preparation.
- **v2.0:** A user can trigger a runtime session, watch execution progress in the panel, review a proposed agent output, and accept or reject it — without leaving Obsidian or losing control of their vault.

---

## Open Questions

| # | Question |
|---|---|
| OQ-01 | Which workflow stages must be supported in the first usable v1 slice? |
| OQ-02 | Which `agentic-workflow` scripts should become plugin commands first? |
| OQ-03 | What vault health checks are mandatory before any agentic session is triggered? |
| OQ-04 | Given the MCP server runs in-process in Obsidian, what are the performance boundaries for long-running tool calls? Should heavy operations run in a worker thread? |
| OQ-05 | What is the minimum MCP tool set required for a useful v1 chat session (read-only first, or write tools from day one)? |
| OQ-06 | How should the five-layer context system degrade when some layers are unavailable (no active file, no workflow state, no persona set)? |
| OQ-07 | How should interrupted or failed MCP tool calls be surfaced and recovered from in the chat sidebar? |
| OQ-08 | How should run provenance (agent, session ID, date, MCP tool calls made) be stored in accepted vault artifacts? |
| OQ-09 | What is the minimum persona description that makes agent responses meaningfully more relevant — how do we guide users to write a useful one without making it feel like a form? |
| OQ-10 | Which `agentonomous` agents should be available in the first v2.0 session, and does the MCP server tool surface need to change to support them? |
