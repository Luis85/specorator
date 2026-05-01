# Specorator — Design Brief

**Type:** Internal · Designer + PM alignment  
**Phase:** Low-fi wireframes complete · Engineering handoff in progress  
**Last updated:** May 2026

---

## Problem statement

AI coding tools have made it trivially easy to generate code. They have not made it easier to generate *good software*. Without structure, AI-assisted projects tend to accumulate code quickly but ship slowly — because the thinking that should precede the code (what are we building, what are the rules, what did we decide and why) never got written down.

The orthodox remedies exist: requirements documents, architecture decision records, gate reviews, retrospectives. They work. But they're daunting — rooted in enterprise vocabulary, designed for large teams, and carrying the cultural baggage of process-for-process's-sake.

**Specorator's job:** be a lightweight scaffold that makes the *next right action* obvious, without requiring the user to already know the discipline it's teaching. A turn-by-turn navigator for disciplined software work.

---

## The user

### Primary persona — "The Focused Builder"

| Attribute | Description |
|-----------|-------------|
| **Who** | One person, possibly with a small team (2–4), building a software product with AI assistance |
| **Role** | Designer, founder, PM, or domain expert — not necessarily an engineer |
| **Tools** | Obsidian for notes, Cursor / Claude Code / Aider for code, GitHub for version control |
| **Attitude to process** | Suspects discipline would help them, but finds orthodox practice daunting. Has been burned by "just ship it" before but also by "too much ceremony" |
| **Pain** | Starts features without finishing them. Can't remember why decisions were made. Builds things that don't match what was specced. Gets blocked and doesn't know why |
| **Aspiration** | To ship something good, with confidence — and to be able to explain every decision if asked |

### Secondary persona — "The Tech Lead"
A team lead who wants their small team (2–4 engineers) to work with shared discipline. Needs peer review to be lightweight — not Jira, not another SaaS tool. Already uses GitHub PRs. Wants Specorator to plug into existing habits.

---

## Opportunity

The overlap of three conditions makes this the right moment:

1. **AI coding tools are mainstream.** Cursor, Claude Code, and Aider have given non-engineers real leverage to build software. The bottleneck is no longer "can I write the code" — it's "did I know what to build."

2. **Obsidian has a large, enthusiastic plugin community.** Local-first, Markdown-native, with a powerful API. Our target user is likely already there.

3. **The discipline exists but the tooling is inaccessible.** P3.express, EARS requirements, ADRs — these methodologies work but are buried in enterprise tooling. There is a gap for a plugin-sized, jargon-softened version.

---

## Goals

### Product goals
1. **Reduce "I don't know what to build next"** — the cockpit always surfaces one clear recommended action.
2. **Prevent decisions from being lost** — open questions are tracked; decision notes are linked from the spec; gate reviews happen before lane changes.
3. **Make quality checkpoints feel like a friend, not a customs officer** — gates surface problems as tasks with fix-buttons, not as error walls.
4. **Teach the discipline through use** — after enough features, users should be able to explain what an EARS requirement is and when to write a decision note.

### Design goals
1. **Zero concepts requiring prior knowledge** — every term has a one-click explainer (the (?) popover system).
2. **One recommended action at a time** — the cockpit never presents a dashboard of metrics; it presents a coach saying "here's what to do next."
3. **Recoverable by default** — every mutation is undoable for 24 hours; no "are you sure?" modals.
4. **Quiet unless blocking** — no toasts, no confetti, no celebrations. The UI raises its voice only when a gate is failing or a question is stale.

---

## Competitive context

| Tool | What it does | Why it's not the answer |
|------|-------------|------------------------|
| **Jira / Linear** | Issue tracking and project management | Built for teams, not solo builders. No spec discipline. No gate reviews. SaaS with accounts. |
| **Notion / Confluence** | Wiki and docs | Free-form — no structure enforcement. Easy to start, easy to drift. |
| **GitHub Issues + PRs** | Code-centric collaboration | Great for code review. No support for the thinking *before* the code. |
| **ADR tools (adr-tools, log4brains)** | Decision record management | Single-purpose. CLI-centric. Engineer audience only. |
| **ChatGPT / Claude (as PM)** | AI-guided thinking | Stateless between sessions. No structured output. No gate enforcement. |
| **Obsidian (vanilla)** | Local Markdown editor | The platform we build on. No opinionated workflow on top. |

**Specorator's differentiation:** the only tool that combines structured feature lifecycle, gate enforcement, decision records, and open question tracking — inside a beloved local-first editor — with a UX designed for non-engineers.

---

## Design principles

These are the constraints held across every design decision. When in doubt, re-read these.

### 1. Plain English first, jargon on demand
"The rules" shown large; "requirements (EARS)" shown small underneath. A (?) next to any term opens a popover: one-line definition · one paragraph why · one link to read more. Users who want the vocabulary can grow into it; users who don't can ignore it.

### 2. Show one next action, not ten options
The cockpit is a coach, not a dashboard. It answers "what should I do right now?" with one recommended action. Other actions are available but don't compete for attention.

### 3. The Markdown is the source of truth
The plugin never holds state the user can't see. If the plugin disappeared tomorrow, every artifact would still be a readable, editable, version-controlled Markdown file. This is non-negotiable.

### 4. Mistakes are fine; hand-offs are reversible
Every state change snapshots first. 24-hour undo on every hand-off, gate cross, and file write. This lets us make confident recommendations without making users anxious.

### 5. Quiet by default; loud when blocking
No confetti, no "Great job!" Loudness is a budget spent only on things that actually need a decision — a failing gate, a stale question, a missing safety step.

### 6. Built for the lone builder; usable by a team
The primary user is one person. The artifacts (Markdown + frontmatter) are git-friendly, so a team inherits the discipline naturally. No server, no account, no sync layer needed.

### 7. The plugin teaches the discipline; it doesn't replace it
After enough use, the user should be able to explain what they're doing and why — without the plugin. Power-user mode strips the explainers and exposes orthodox vocabulary. We are happy when users outgrow the coach.

---

## Non-negotiable constraints

| Constraint | Rationale |
|-----------|-----------|
| **Local-first — no server, no account** | Obsidian users self-select for this. Introducing an account would betray the product's premise. |
| **Inside Obsidian — not a standalone app** | The user already lives here. Building a new shell duplicates effort and forces migration. |
| **Deterministic core — AI not required** | The plugin evaluates gates by parsing frontmatter. An LLM is never in the critical path. LLM features can layer later. |
| **Open source** | Builds trust with the Obsidian community. Obsidian plugin store requires public source. |
| **Non-engineer usable** | Every concept teachable in one sentence. Every term has a popover. No assumed CS background. |

---

## Success criteria

**The plugin succeeds if, after using it on 3+ features, a user can:**

1. Explain what they're building and why, in one paragraph (vision discipline)
2. Name at least two decisions they made and why they made them (decision logging)
3. Know exactly where they are in the current feature without opening any files (cockpit context awareness)
4. Feel safe trying something uncertain — because they know they can undo it (recoverable states)

**Proxy metrics (qualitative, from user interviews):**
- "I finished more features than I usually do"
- "I stopped rebuilding things I'd already decided"
- "I didn't lose track of where I was after a week away"

---

## Scope — v1

### In scope
- 11-step feature lifecycle (Define · Build · Ship)
- Two gate reviews (Define→Build · Build→Ship)
- Cockpit view (four layout directions explored; A = default)
- Open question tracking (? prefix syntax)
- Decision note (ADR) logging
- Constitution / house rules
- 24-hour undo on all state changes
- Skip steps with mandatory reason
- Feature archival and re-open
- Team mode — shared vault conventions, PR sign-off, peer OQ resolution, conflict detection
- Settings panel in Obsidian native settings
- Full command palette coverage
- Help system (concept popovers)

### Out of scope — v1
- Code generation
- Real-time multiplayer / live cursors
- Mobile-first cockpit
- AI agent inside Specorator
- Graph-of-everything view
- Custom templating language
- Multi-vault portfolio view
- Automated test execution
- Any form of telemetry or analytics

---

## Open questions (remaining)

All major open questions have been resolved:

| OQ | Resolved | Decision |
|----|----------|----------|
| OQ-1 | Partial | Command bar vs palette: palette wins. No in-cockpit command bar for v1. |
| OQ-2 | ✓ | Cockpit defaults to last-focused feature. Dedicated empty states for all-archived and new-vault. |
| OQ-3 | ✓ | Solo: auto-pass. Team: PR merge = peer sign-off. |
| OQ-4 | ✓ | Skip any step (except 1 and 3) with mandatory one-line reason. |
| OQ-5 | ✓ | Team mode = shared vault + conventions. No server. PR sign-off + inline attribution. |

One item still deferred: **folder migration UX** — what happens when a user changes the `featuresFolder` path after features already exist. Post-MVP.

---

## Wireframe artefacts

All design exploration lives in this project. 32 artboards across 8 sections.

| Entry point | Purpose |
|-------------|---------|
| [`index.html`](index.html) | Structured walkthrough — 8 sections, act-by-act |
| [`Specorator Wireframes.html`](Specorator%20Wireframes.html) | Full pan/zoom canvas — all 32 artboards |
| [`handoff/index.html`](handoff/index.html) | Engineering spec — 5 RFC-style documents |

---

*Internal document · v0.1 · Design + PM alignment · May 2026*  
*Supersedes any earlier verbal or Notion-based brief.*
