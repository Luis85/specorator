---
title: "Human-Agent Centered Design — idea to tested code for everyone"
doc_type: product-philosophy
status: draft
owner: product
last_updated: 2026-05-09
issues:
  - "#164"
references:
  - docs/product-vision.md
  - docs/glossary/h-acd.md
  - docs/glossary/workflow-encapsulation.md
  - docs/glossary/human-authority.md
  - docs/glossary/intent-first.md
  - docs/glossary/vault-as-operating-environment.md
  - docs/glossary/hitl.md
  - docs/glossary/hotl.md
---

# Human-Agent Centered Design — Idea to Tested Code for Everyone

## Purpose

This document defines the foundational product philosophy that governs every design decision in Specorator. All feature issues, UX decisions, and architecture choices should be evaluated against the principles here.

---

## The Core Idea: From Doing Work to Governing Outcomes

Traditional software delivery requires the people closest to the work to also be the ones executing it: a PM writes requirements, a developer writes code, a QA engineer runs tests. This concentrates delivery in technical specialists and largely excludes everyone else from meaningful participation in the later stages — particularly the people who understand the problem best.

Specorator's founding insight, drawn from **Human-Agent Centered Design (H-ACD)**, is that **work can be encapsulated**. When agents handle execution, the user's role shifts from doing the work to governing the outcomes: setting intent, reviewing proposals, making decisions, and maintaining authority over what gets accepted. The methodology is invisible to the user. The results are not.

This is not about replacing human judgment — it is about making human judgment the only thing the user needs to bring. The agents bring expertise, structure, and execution. The user brings intent, context, and final authority.

---

## Human-Agent Centered Design in Specorator

H-ACD defines four principles that shape every Specorator design decision:

### 1. Workflow Encapsulation

The methodology complexity is hidden inside Specorator. The user never needs to learn the `agentic-workflow` stage model, understand what an artifact is, know what "frontmatter" means, or think about how agents work. They experience the outcome of that methodology — structured, progressive, auditable work — without touching the machinery.

*In practice:* The user says "I want to figure out what to build." Specorator routes that to the right stage, prepares the right context, invokes the right agent capability, and presents the result as "here's a draft of what you described — what do you think?" The twelve-stage workflow happened; the user didn't see it.

### 2. Human Authority Over Outcomes

The user retains full authority at every transition. Agents propose; humans decide. Nothing is written, advanced, or committed without the user's approval. This is not a technical restriction — it is the product model. The user is the director; the agents are the team executing the plan.

*In practice:* When an agent generates code, the user sees a review of what was built and why, not raw files. They decide: accept it, ask for changes, or take it in a different direction. When tests run, the user sees "passed" or "here's what needs fixing" — not test output. The decision is theirs; the execution was the agent's.

### 3. Intent-First Interaction

The user expresses what they want. The system handles the how. Users never need to think about how to phrase a prompt, what context to provide, or what to include for the agent to work well. Specorator assembles and injects the right context automatically. The user's only job is to say what they want and react to what they get.

*In practice:* Opening the sidebar and typing "help me think through this" is enough. The sidebar already knows the user's role, the active note, the current workflow stage, and the expected next steps. The user brings the direction; the system brings the context.

### 4. The Vault as the Agentic Operating Environment

The Obsidian vault is not a storage location for outputs. It is the **primary workspace** where all agents operate. Agents read from the vault to understand context. They write to the vault to produce results. They navigate the knowledge graph to discover relationships. They work with Canvas as a visual thinking surface. They treat frontmatter as structured data and Bases as a live database view.

This is not a technical implementation detail — it is a product principle. Specorator is of Obsidian, not merely inside it. Every agent capability must be implemented through Obsidian's own data model. The vault, as the user has shaped it, is the agent's operating environment.

*In practice:* When an agent creates a requirements document, it does not just generate text and save a file. It creates a proper Markdown note with correct frontmatter, inserts `[[wikilinks]]` to related decisions and the active feature, and updates the feature's `workflow-state.md` to reflect the new artifact. The note enters the knowledge graph. The user's vault is richer for it — regardless of whether Specorator is installed.

**The four Obsidian data surfaces agents must work with:**

| Surface | What agents do with it |
|---|---|
| **Markdown** | Read and write the native format; use headings, callouts, tasks, embeds, and code fences natively |
| **Frontmatter** | Read and update structured YAML properties as a first-class database; field updates are non-destructive |
| **Wikilinks** | Create relationships between notes as proper `[[wikilinks]]`; navigate the knowledge graph via backlinks and resolved links |
| **Canvas** | Read visual workspaces to understand relationships; propose new cards and connections as reviewed additions to the space |
| **Bases** | Query structured views of the vault; update frontmatter properties that Bases reflects; treat Bases records as the vault's relational layer |

**The mechanism:** Specorator implements a **native Obsidian MCP server** (running inside the plugin with full API access) that exposes the complete Obsidian tool surface to all agents via the Model Context Protocol. Claude CLI connects to this MCP server as a client. `agentonomous` agents connect to the same server in v2.0. The tool surface is defined in [#165](https://github.com/Luis85/specorator/issues/165).

---

## The ADLC as a Pipeline: The Governance Mental Model

The twelve `agentic-workflow` stages are not a checklist — they are a **pipeline**. Every feature enters at `idea` and exits at `retrospective`. Each stage has an agent role, defined entry criteria, a structured output, and a **human governance gate** before the next stage begins.

This pipeline mental model has a direct consequence for how the user interacts with Specorator:

- The user is the **pipeline owner** — they decide whether work can proceed through each gate
- Agents are the **pipeline executors** — they do the work within each stage
- The **cockpit** ([#168](https://github.com/Luis85/specorator/issues/168)) is the surface from which the user sees all active pipelines simultaneously and steers them

Think of it like a CI/CD pipeline for the entire product development lifecycle. Each feature is a "build" running through stages. The user approves the gates. Agents execute the stages. The vault stores the artifacts.

### Two Oversight Modes Within the Pipeline

H-ACD governance operates in two modes depending on the stakes of the decision:

**Human-in-the-Loop (HITL)** — the agent pauses and waits for explicit approval before proceeding. This applies at every stage boundary (gate approval) and every proposed vault write. The user is never surprised by an advancement they did not approve.

**Human-on-the-Loop (HOTL)** — the agent works autonomously within a stage while the user monitors and can intervene at any time. This applies during draft generation, test execution, and implementation runs. The user sets the direction, the agent executes, and the user reviews the result.

The invariant: **HITL at gates, HOTL within stages.** No stage advances without the user's explicit decision; within a stage, the agent can work at full speed.

The Specorator UI makes these two modes visible and distinct at all times. A feature showing `↩ Waiting for you` is in HITL mode — the agent is suspended and nothing will proceed without user action. A feature showing `● Working` is in HOTL mode — the agent is executing and the user can monitor, redirect, or pause.

### The Vault as the Audit Trail

Because the vault is the operating environment, it is also the complete audit trail. Every stage artifact is a plain Markdown file. Every stage transition updates `workflow-state.md`. Every agent session produces a **session log** stored as a vault artifact (see [#169](https://github.com/Luis85/specorator/issues/169)), recording what the agent worked from, what decisions it made, and what the user accepted or redirected.

This means: for any output in the vault, you can trace backwards through the wikilink graph to the session that produced it, the stage context it emerged from, and the root idea it serves. The vault IS the traceability chain.

---

## The Full Lifecycle: Idea to Tested Code

Specorator serves the **complete product development lifecycle** — not just the planning stages. The twelve `agentic-workflow` stages map directly to a full delivery loop, and Specorator's agents have a meaningful role at every one of them:

| # | Stage | Plain label | What the agent does | What the user governs |
|---|---|---|---|---|
| 1 | `idea` | Exploring the idea | Helps articulate and stress-test the concept; surfaces questions worth answering | "Is this worth pursuing?" |
| 2 | `research` | Understanding the space | Structures research, summarises findings, identifies patterns and gaps | "What did we learn and what does it mean?" |
| 3 | `requirements` | Defining what to build | Transforms discussions into structured requirements; generates acceptance criteria; checks for completeness | "Does this describe what we actually want?" |
| 4 | `design` | Figuring out how it works | Explores design options, documents tradeoffs, proposes architecture and data models | "Is this the right approach?" |
| 5 | `spec` | Writing it all down | Synthesises all prior work into a complete, reviewable specification | "Is this ready to build?" |
| 6 | `tasks` | Planning the work | Breaks the spec into concrete tasks, estimates difficulty, surfaces dependencies and risks | "Is this plan realistic?" |
| 7 | `implementation-log` | Building it | **Writes the code** based on the spec and tasks; presents a plain-language summary of what was built and why | "Does this match what we wanted? Accept or change?" |
| 8 | `test-plan` | Making sure it works | Writes a test plan from requirements and implementation; covers unit, integration, and acceptance criteria | "Does this plan catch the right things?" |
| 9 | `test-report` | What we found | **Runs the tests**; presents a plain-language report ("7 of 8 passed; here's what needs fixing") | "Are we ready to ship?" |
| 10 | `review` | Getting a second opinion | Assists with code, design, and requirement review; flags issues; suggests improvements | "Is this good enough?" |
| 11 | `release-notes` | Telling people what changed | Generates release notes from the implementation log and test report; user edits for tone and audience | "Does this tell the right story?" |
| 12 | `retrospective` | What we learned | Structures the retrospective, identifies patterns across the project, proposes process improvements | "What do we do differently next time?" |

Non-technical users can govern every one of these stages. The governance decisions are human decisions, not technical ones.

---

## The Governance Model in Practice

The user's role shifts across the lifecycle:

```
Stages 1–6 (Thinking and planning)
  User leads — expresses intent, makes decisions, shapes direction
  Agent assists — structures, drafts, questions, enriches

Stage 7 (Building)
  Agent executes — writes code from spec; creates files in the vault via MCP tools
  User governs — reviews plain-language summary, accepts or redirects

Stages 8–9 (Verifying)
  Agent executes — writes tests, runs them, interprets results
  User governs — sees outcome in plain language, decides if ready

Stages 10–12 (Closing)
  User leads — reviews, approves, reflects
  Agent assists — surfaces issues, drafts documents, identifies patterns
```

The user is never idle and never powerless. But the proportion of technical execution they personally perform approaches zero.

---

## What This Means for the v1 / v2.0 Split

**v1 (Claude CLI + Specorator MCP server):** The full lifecycle is supported conversationally and through Obsidian-native tool use. The assistant reads from and writes to the vault via the MCP tool surface — creating properly linked notes, updating frontmatter, proposing canvas additions — with each write queued for user review. The vault grows richer as the user works through the stages. A basic workflow navigation view shows the user where each feature stands in its pipeline.

**v2.0 (specorator-runtime + agentonomous + Specorator MCP server):** Orchestrated, stateful agent sessions replace the conversational model. The same MCP server is the interface for all agent-to-Obsidian interaction. Each stage has defined entry criteria, structured output contracts, and a formal accept/reject review flow. The fleet dashboard ([#168](https://github.com/Luis85/specorator/issues/168)) shows all features across all projects on a single pipeline matrix, with live agent session indicators, HITL/HOTL mode display, inline intervention controls, and full traceability to the root issue. The vault remains the source of truth throughout; session logs ([#169](https://github.com/Luis85/specorator/issues/169)) make every agent decision inspectable.

---

## What This Means for Product Language

Every word the user sees must reflect the governance model, not the execution model:

- The user is **making decisions**, not **configuring agents**
- The assistant is **proposing** or **helping**, not **executing tasks**
- The stages are **phases of the work**, not **methodology stages**
- The results are **drafts for review**, not **generated artifacts**
- "Ready to move on?" is a human decision, not a workflow state transition
- "Waiting for you" means an agent is paused at a gate, not a system error
- "Working" means an agent is executing within a stage under HOTL oversight

See [#161](https://github.com/Luis85/specorator/issues/161) for the full vocabulary table.

---

## Design Evaluation Criteria

Any proposed feature, interaction, or piece of copy should be evaluated against:

1. **Does this respect workflow encapsulation?** Is the methodology invisible to the user?
2. **Does this maintain human authority?** Is the user making a decision, or just watching?
3. **Is this intent-first?** Does the user express what they want, or do they have to specify how?
4. **Does this work for a non-technical user?** Would someone who has never written code find this clear and useful?
5. **Is this serving governance, not execution?** Is the user in the position of director, not operator?
6. **Does this honour the vault?** Are agents working through Obsidian's own data model? Are outputs plain Markdown with proper wikilinks and frontmatter? Is the vault richer after each agent interaction?
7. **Is the oversight mode clear?** Does the user know whether the system is waiting for them (HITL) or working and observable (HOTL)?
8. **Is this traceable?** Can any output or decision be followed back to its originating intent and root issue?

---

## References and Influences

- [Human-Agent Centered Design (H-ACD)](https://hacd.lovable.app/) — the foundational framework
- [Workflow Encapsulation in H-ACD](https://www.designative.info/2025/12/16/workflow-encapsulation-in-human-agent-centered-design-from-doing-work-to-governing-outcomes/) — from doing work to governing outcomes
- [Designing for Autonomy: UX Principles for Agentic AI](https://www.uxmatters.com/mt/archives/2025/12/designing-for-autonomy-ux-principles-for-agentic-ai.php)
- [McKinsey: human-centered approach to the agentic AI future](https://www.mckinsey.com/~/media/mckinsey/email/rethink/2026/02/2026-02-25b.html)
- [Agentic Development Lifecycle (ADLC)](https://rajatpandit.com/agentic-ai/agentic-software-development-life-cycle/)
- [Human-in-the-Loop vs Human-on-the-Loop for AI Agents](https://www.waxell.ai/blog/human-in-the-loop-vs-human-on-the-loop-ai-agents)
- [Issue Trackers as AI Agent Infrastructure](https://www.mindstudio.ai/blog/issue-trackers-ai-agent-infrastructure-jira-linear)
- [GitHub Copilot Mission Control](https://github.blog/ai-and-ml/github-copilot/how-to-orchestrate-agents-using-mission-control/)
- `agentic-workflow` — the upstream methodology this plugin surfaces

---

## Related

- [#165](https://github.com/Luis85/specorator/issues/165) — Obsidian-native MCP tool surface — full technical specification
- [#168](https://github.com/Luis85/specorator/issues/168) — Workflow Fleet Dashboard — the cockpit that makes the pipeline visible across N features
- [#169](https://github.com/Luis85/specorator/issues/169) — Traceability + Session Logs — the vault as audit trail
- [#1](https://github.com/Luis85/specorator/issues/1) — v1 alpha epic
- [#23](https://github.com/Luis85/specorator/issues/23) — v2.0 epic
- [#161](https://github.com/Luis85/specorator/issues/161) — Claude CLI Chat Sidebar — primary H-ACD surface in v1
- [#162](https://github.com/Luis85/specorator/issues/162) — Onboarding
- [docs/product-vision.md](./product-vision.md)
