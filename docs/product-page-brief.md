---
title: "Specorator product page content brief"
doc_type: content-brief
status: draft
owner: product
last_updated: 2026-05-01
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

This brief provides all the structure, copy boundaries, and content decisions needed to implement issue #22 (the GitHub Pages product page). Work from this brief rather than from individual issue descriptions.

---

## 1. Purpose and Audience

### Target Audience

| Audience | Goal on the page |
|---|---|
| **Curious user** | Understand what Specorator is, whether it helps their workflow, how to get started |
| **Obsidian user already using `agentic-workflow`** | See how the plugin automates their current manual steps and makes the methodology accessible inside Obsidian |
| **Potential contributor** | Find out how to get involved, run the project locally, and understand where development is heading |
| **Evaluator / researcher** | Quickly grasp the product's purpose, scope, and relationship to upstream repos |

### Primary Message

> Specorator is an Obsidian plugin that turns the `agentic-workflow` methodology into an approachable, guided experience inside your vault. It installs the workflow, navigates your active work, and helps you build better software with discipline — without requiring a heavy process tool.

### Secondary Message

> In v2.0, Specorator becomes a companion app powered by `agentonomous`, giving you a team of agentic coworkers that assist with drafting, reviewing, and improving your workflow outputs while you stay focused on the vault.

---

## 2. Content Sections

### Section 1 — Hero

**Heading (suggested):** *Specorator — structured software work, inside Obsidian*

**Subheading:** *Install the workflow. Navigate your active work. Build with discipline.*

**Body:** 2–3 sentences maximum. Establish what Specorator is and who it is for. Do not mention `agentonomous` here — keep the hero focused on the v1 value.

**CTA:** Two buttons:
- Primary: "Get started" → links to quick-start / local-dev section
- Secondary: "View on GitHub" → links to `Luis85/specorator`

**Copy constraint:** Do not claim agent capabilities in the hero. v1 is a workflow tool, not an AI product.

---

### Section 2 — What problem does it solve?

Speak to the target persona (the Focused Builder from the Design Brief): someone who suspects discipline would help them but finds orthodox process daunting.

**Key points to cover:**
- AI coding tools make it easy to generate code, but not easy to generate *good* software.
- Without structure, decisions get lost, specs diverge from code, and features don't finish cleanly.
- The discipline (requirements, decision records, quality gates) exists but is buried in enterprise tooling.
- Specorator is a plugin-sized, jargon-softened version: it makes the next right action obvious.

**Copy constraint:** One short paragraph or a tight 3-point list. Do not expand into methodology detail here.

---

### Section 3 — How does it work? (v1 capabilities)

Explain the three core v1 workflows with short, concrete descriptions. Use past-present tense: what the user *does*, not what the product *will do*.

**Template installation**
> Install a supported version of the `agentic-workflow` template into your vault with one command. Specorator checks for existing files and asks before overwriting anything.

**Workflow navigation**
> Open the cockpit to see your active feature, current stage, and the next artifact you need to create. Commands open workflow files directly in Obsidian — no file-system browsing required.

**Artifact creation**
> Create a new feature scaffold from the plugin UI. All outputs are plain Markdown in your vault — readable and editable with or without the plugin installed.

**Copy constraint:** Do not list v2.0 coworker capabilities in this section. Flag them clearly as "coming in v2.0" if mentioned at all.

---

### Section 4 — How does it relate to `agentic-workflow`?

Short explanation of the three-layer relationship:

| Layer | Role |
|---|---|
| `agentic-workflow` | The methodology — workflow stages, artifacts, templates, quality gates. Specorator consumes released versions. |
| Specorator | The Obsidian plugin — installs, navigates, and surfaces the methodology from inside the vault. |
| `agentonomous` | The agent orchestration engine — powers v2.0 agentic coworkers. Not used in v1. |

Link to `Luis85/agentic-workflow` repository.

**Copy constraint:** Do not imply that `agentonomous` is part of v1. Reference it only as the v2.0 direction.

---

### Section 5 — What's available now? (v1 status)

Be honest about v1 alpha status. Do not overstate stability.

**What works:**
- Plugin scaffold and build toolchain
- Isolated browser runtime for the Vue 3 UI
- Typed Obsidian-to-UI bridge API
- CI and dependency automation
- Local development documentation

**In active development:**
- Template installation service
- Workflow navigator UI
- Artifact creation commands

**Copy constraint:** Only list items that are actually built or in flight. Do not list items as "available" that are still in planning.

---

### Section 6 — v2.0 direction (companion app)

One short section on the v2.0 vision. Frame it as a roadmap direction, not a current feature.

**Heading:** *Where we're going: agentic coworkers in your vault*

**Body:** 2–3 sentences. In v2.0, Specorator becomes a companion app powered by `agentonomous`. Users get a team of purpose-built agentic coworkers — Spec Writer, Design Reviewer, Decision Recorder, Task Planner — that assist with producing workflow outputs while the user retains full control over what gets accepted and written to the vault.

**CTA:** "Follow v2.0 planning →" → links to [issue #23](https://github.com/Luis85/specorator/issues/23)

**Copy constraint:** Use "v2.0" or "coming in v2.0" consistently. Do not use "coming soon" without version context.

---

### Section 7 — Quick start / get started

The practical entry point for users who want to try the plugin.

**Steps (draft — update when installation is available):**

1. Clone the repository: `git clone https://github.com/Luis85/specorator`
2. Install dependencies: `npm install`
3. Run in browser mode: `npm run dev` → opens at `http://localhost:5173`
4. Build for Obsidian sideloading: `npm run build`
5. Copy `main.js` and `manifest.json` to `.obsidian/plugins/specorator/` in your vault

**Note:** Link to [local development docs](./local-development.md) for the full setup guide.

**Copy constraint:** Do not describe marketplace installation until the plugin is submitted. Use "sideloading" and link to the local-dev docs.

---

### Section 8 — Contributor path

For developers who want to work on the plugin.

**What to link:**
- [Local development documentation](./local-development.md)
- [Obsidian marketplace readiness checklist](./marketplace-readiness.md)
- [Roadmap](./roadmap-v1.md)
- [Open issues](https://github.com/Luis85/specorator/issues)
- [CONTRIBUTING guide] (create when issue #4 is fully resolved)

**Short paragraph:** Specorator is an open development project. Contributions to the plugin shell, bridge API, UI, and documentation are welcome. Read the local development guide to set up the test vault and run the CI checks locally.

---

### Section 9 — Footer / links

| Link | Target |
|---|---|
| GitHub repository | `https://github.com/Luis85/specorator` |
| `agentic-workflow` | `https://github.com/Luis85/agentic-workflow` |
| `agentonomous` | `https://github.com/Luis85/agentonomous` |
| v1 alpha planning | Issue #1 |
| v2.0 planning | Issue #23 |
| Roadmap | `docs/roadmap-v1.md` |

---

## 3. Copy Boundaries

These rules prevent the page from overpromising capabilities that are not yet built.

| Rule | Rationale |
|---|---|
| Never describe coworkers, agent runs, or proposed outputs as current features. | These are v2.0 capabilities. Claiming them in v1 creates false expectations. |
| Never use "AI" to describe v1 without qualification. | v1 has no live AI integration. The coach text is static guidance, not generated content. |
| Always distinguish "v1" from "v2.0" when describing roadmap items. | Users should know what they can try now vs. what is planned. |
| Always link to an issue or doc for any claim about upcoming capabilities. | Keeps the page accountable and avoids vague promises. |
| Do not describe sideloading as "installing from the Obsidian marketplace" until submission. | The plugin has not been submitted. Sideloading is a manual process. |

---

## 4. Page Structure Summary

```
1. Hero — what it is, primary CTA
2. Problem — why structured workflow matters
3. How it works — three v1 capabilities
4. Ecosystem — relationship to agentic-workflow and agentonomous
5. Current status — what's built vs. in progress
6. v2.0 direction — companion app roadmap
7. Get started — quick-start steps
8. Contribute — contributor path
9. Footer links
```

---

## 5. Hosting Notes

- Host via GitHub Pages on `Luis85/specorator` (configure in repository Settings → Pages).
- Source: `docs/` directory on `main` branch, or a dedicated `gh-pages` branch — decide before implementation.
- Link the page URL from the README `<p>` tag / shields row once live.
- Update this brief alongside meaningful product or status changes; do not let it drift from the actual plugin state.

---

## 6. Update Cadence

| Trigger | Section(s) to review |
|---|---|
| Template installation shipped | Section 5 (current status), Section 7 (quick start steps) |
| Marketplace submission | Section 7 (update from sideloading to marketplace install) |
| v2.0 integration begins | Section 6, Section 4 (ecosystem table) |
| New contributor docs added | Section 8 (contributor path links) |
| New `agentic-workflow` release consumed | Section 3, Section 7 |
