---
title: "Specorator product page content brief"
doc_type: content-brief
status: draft
owner: product
last_updated: 2026-05-05
references:
  - docs/product-vision.md
  - docs/prd.md
  - docs/design/USE_CASES.md
  - docs/glossary.md
---

# Product Page Content Brief

**Related issues:** [#33](https://github.com/Luis85/specorator/issues/33) · [#22](https://github.com/Luis85/specorator/issues/22)  
**Implements:** GitHub Pages product page for `Luis85/specorator`  
**Source documents:** [Product Vision](./product-vision.md) · [PRD](./prd.md) · [Use Cases](./design/USE_CASES.md) · [Glossary](./glossary.md)

This brief provides all the structure, copy boundaries, and content decisions needed to implement and maintain the GitHub Pages product page. Work from this brief rather than from individual issue descriptions.

---

## 1. Purpose and Audience

### Target Audience

| Audience | Goal on the page |
|---|---|
| **Curious builder** | Understand what Specorator is, whether it fits their way of working, and how to get started — regardless of technical background |
| **Non-technical founder or PM** | See that this tool is for them, not just for engineers; understand that plain language is sufficient to work with the AI assistant |
| **Engineer or architect** | Understand the workflow discipline, the AI assistance model, and the quality guarantees at each stage |
| **Potential contributor** | Find out how to get involved, run the project locally, and understand where development is heading |
| **Evaluator / researcher** | Quickly grasp the product's purpose, scope, and relationship to upstream repos |

### Primary Message

> Specorator is a guided development companion that takes you — and your whole team — from first idea to tested code. It brings structured workflow and an AI assistant that knows your work into a single, connected environment. All your files stay plain text, owned by you.

### Secondary Message

> In v2.0, Specorator becomes a fully orchestrated agentic environment — purpose-built specialist agents covering every role from PM to QA, working in and out of your knowledge base with your explicit oversight at every step.

### Framing principle — Obsidian is the engine, not the product

Specorator is the product. Obsidian is the foundation it runs on — chosen for its powerful local knowledge graph, plugin ecosystem, and deep file-system integration. The page should reflect this hierarchy:

- **Never lead** a section by calling Specorator "an Obsidian plugin."
- **Do mention** Obsidian where relevant — in a dedicated "Powered by Obsidian" section and in install instructions — but as a substrate, not an identity.
- **Never use** "vault" as primary user-facing language; prefer "your knowledge base" or "your files" for external copy. ("Vault" is fine in install instructions where users are already inside Obsidian.)

---

## 2. Content Sections

### Section 1 — Hero

**Heading:** *From idea to tested code. Every step, guided.*

**Subheading:** Specorator is your guided development companion — structured workflow, AI assistance, and your knowledge in one place.

**Body:** 2–3 sentences. Establish what Specorator is and who it is for. Do not describe Specorator as an Obsidian plugin. Do not mention technical stack. Obsidian may appear as a subordinate clause at most.

**CTA:** Two buttons:
- Primary: "Try it in your browser" → opens live demo
- Secondary: "Get started" → links to get-started section

**Badge:** "v1 alpha · in development" — no mention of "Obsidian plugin" in the badge.

---

### Section 2 — What is Specorator?

Lead with the product value, not the implementation substrate.

**Opening:** Describe what Specorator does for the user, in one or two plain-language paragraphs.

**Three pillars:**
1. Guided workflow — 12 stages, always know where you are and what comes next
2. AI that knows your work — context-aware, stage-aware assistant; no manual prompt construction required
3. You stay in control — every AI output is a proposal; nothing is written without explicit acceptance

**Copy constraint:** Do not use "Obsidian plugin" as the first or primary descriptor. The product leads; the implementation follows.

---

### Section 3 — Who it's for

Explicitly address non-technical users. Show that this is not a developer-only tool.

**Audiences to cover:**
- Founders and PMs — plain language to spec
- Engineers and architects — traceability, quality gates, implementation to retrospective
- Designers and analysts — decisions and requirements alongside artifacts
- Anyone who wants to try it — browser demo, no setup required

**Copy constraint:** Do not frame the problem as "developers who forget to write specs." Frame it as: everyone in the room benefits from a shared, structured, connected way of working.

---

### Section 4 — The 12 stages

Show the lifecycle with plain-language stage labels, not technical slug names.

| # | Plain-language label |
|---|---|
| 1 | Exploring the idea |
| 2 | Looking into it |
| 3 | What it needs to do |
| 4 | How it should look and feel |
| 5 | The full plan |
| 6 | Breaking it into steps |
| 7 | Building it |
| 8 | How we'll check it works |
| 9 | What we found |
| 10 | Checking our work |
| 11 | Telling people about it |
| 12 | What we learned |

**Copy constraint:** Do not display raw stage slugs (`idea`, `research`, etc.) as the primary labels in user-facing copy.

---

### Section 5 — AI assistant

Explain the AI assistant as a first-class v1 feature, not a future roadmap item.

**Key points:**
- Permanent side panel, always visible
- Knows your persona, active file, current stage, and opted-in knowledge base context — before you type a word
- Suggests relevant actions per stage (not generic chat prompts)
- Every proposed change is a review card — nothing applied without acceptance

**Copy constraint:** Do not describe the AI assistant as "coming in v2.0" — it is a v1 feature. Do not use AI terminology ("prompt", "model", "context window", "LLM"). Do not describe the MCP server or technical integration details.

---

### Section 6 — Try it live

The browser demo entry point.

**Key points:**
- No account, no sign-up, nothing sent anywhere
- Data stays in local browser storage
- Full workflow experience — create a feature, walk through stages

**CTA:** "Open the live demo"

---

### Section 7 — Roadmap

Two columns: first increment (in development) and v2.0 (planned).

**First increment — in development:**
- Onboarding with persona setup
- Guided workflow template installation
- AI chat assistant in permanent side panel
- Workflow navigator
- Artifact creation
- Standalone browser demo

**v2.0 — planned:**
- Purpose-built specialist agent roles (PM, architect, engineer, QA, writer)
- Fully orchestrated sessions
- Live execution state in the panel
- All outputs remain reviewable proposals
- Powered by `agentonomous`

**Copy constraint:** Always use "first increment" or "v1" for the current scope. Always use "v2.0" for planned items — never "coming soon" without version context.

---

### Section 8 — Powered by Obsidian

Dedicated section positioning Obsidian as the engine.

**Key points:**
- Specorator runs as a plugin inside Obsidian — chosen as the foundation for its knowledge graph, plugin ecosystem, and deep file integration
- Obsidian is the engine; Specorator is the product that runs on it
- Because of this foundation, the AI assistant can reason over the full connected graph of your knowledge, not just the active file
- All files are plain Markdown — readable anywhere, version-controllable, permanently yours

**Copy constraint:** This is where Obsidian is explained — not in the hero or the "what is Specorator?" section.

---

### Section 9 — Get started

The practical entry point for installation.

**Steps:**
1. Download the latest release (`manifest.json`, `main.js`, `styles.css`) from GitHub Releases
2. Create `{vault}/.obsidian/plugins/specorator/` in your Obsidian vault
3. Copy the three files into that folder
4. Open Obsidian → Settings → Community plugins → enable Specorator
5. Specorator opens and guides you through a short setup

**Copy constraint:** Do not describe marketplace installation until the plugin is submitted. Last step should mention the onboarding experience, not raw configuration.

---

### Section 10 — Ecosystem

Brief section on the related repositories.

| Repo | Role |
|---|---|
| `Luis85/specorator` | This repository. The guided workflow and AI assistant. |
| `Luis85/agentic-workflow` | Upstream workflow methodology, templates, and quality gates. |
| `Luis85/agentonomous` | Agent implementation library. Powers the v2.0 specialist roles. |
| `Luis85/specorator-runtime` | Execution engine for v2.0 orchestrated sessions. |

---

### Section 11 — Contribute

Short section for contributors.

**Links:**
- GitHub repository
- #1 — v1 alpha planning
- #23 — v2.0 planning
- #47 — Roadmap progress tracker
- Local development guide
- Contributing guide

---

## 3. Copy Boundaries

| Rule | Rationale |
|---|---|
| Never call Specorator "an Obsidian plugin" in the hero, meta description, or section leads. | Obsidian is the engine, not the product identity. |
| Never use AI terminology with users: "prompt", "model", "context window", "LLM", "system prompt". | The product promise is plain-language interaction; technical terms undermine trust. |
| Never describe the AI assistant as a v2.0 feature. | It ships in v1. Misrepresenting this creates false low expectations. |
| Always use plain-language stage labels in user-facing copy, not technical slugs. | Non-technical users should not encounter `implementation-log` or `test-report` as primary labels. |
| Always distinguish "first increment / v1" from "v2.0" when describing roadmap items. | Users should know what they can try now vs. what is planned. |
| Always link to an issue or doc for any claim about upcoming capabilities. | Keeps the page accountable and avoids vague promises. |
| Never describe agent outputs as automatically applied. | All outputs are proposals; misrepresenting this breaks user trust. |

---

## 4. Page Structure Summary

```
1. Hero — product-centric headline, try-live and get-started CTAs
2. What is Specorator — three pillars: workflow, AI, control
3. Who it's for — non-technical users front and centre
4. The 12 stages — plain-language labels, numbered grid
5. AI assistant — permanent side panel, context-aware, proposal model
6. Try it live — browser demo CTA
7. Roadmap — first increment vs. v2.0
8. Powered by Obsidian — engine framing, knowledge graph, plain files
9. Get started — install steps with onboarding mention
10. Ecosystem — four related repositories
11. Contribute — contributor path links
12. Footer — "Powered by Obsidian · Vue 3 · TypeScript"
```

---

## 5. Hosting Notes

- Host via GitHub Pages on `Luis85/specorator` (configure in repository Settings → Pages).
- Source: `site/` directory on `demo` branch (aligns with the branching model; CI deploys on push to `demo`).
- Link the page URL from the README once live.
- Update this brief whenever the product scope or roadmap changes meaningfully.

---

## 6. Update Cadence

| Trigger | Section(s) to review |
|---|---|
| Claude CLI chat sidebar ships | Section 5 (AI assistant — mark as available) |
| Template installation ships | Section 7 (roadmap status), Section 9 (get started steps) |
| Marketplace submission | Section 9 (update from sideloading to marketplace install) |
| v2.0 planning matures | Section 7 (roadmap), Section 10 (ecosystem) |
| New contributor docs added | Section 11 (contributor path links) |
| New `agentic-workflow` release consumed | Section 9 (get started), Section 10 (ecosystem) |
