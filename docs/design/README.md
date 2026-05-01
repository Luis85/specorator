# Specorator — Obsidian Plugin
### Wireframes & Engineering Handoff

> A plugin that scaffolds disciplined software work inside Obsidian.  
> 11 steps · 3 lanes · 2 gates · local-first · no server.

---

## What is Specorator?

Specorator is an Obsidian plugin for people building software with AI assistance. It gives structure to the thinking that happens *before* and *around* code — vision, requirements, decisions, gate reviews — without requiring the user to know orthodox software engineering vocabulary.

The core model: every feature moves through **11 steps** grouped into three lanes (Define → Build → Ship), with **two gates** that enforce quality checkpoints between lanes. Everything is stored as plain Markdown + YAML frontmatter. The plugin owns no database and requires no account.

**Who it's for:** Solo builders and small teams (2–4 people) working on software projects with AI coding tools (Cursor, Claude Code, Aider). Not optimised for large enterprise teams or real-time multiplayer.

---

## How to navigate this project

There are three entry points, each for a different purpose:

### 1. `index.html` — Structured walkthrough
**Start here** if you're new to the project or want to walk through the design in a logical order.

Eight sections, each with its own page. Long flows are broken into acts — no more 3000px horizontal scrolls. Navigate with the prev/next arrows in the top bar.

```
Suggested order:
  00 · Rationale       → why the plugin works the way it does
  01 · Product         → onboarding + 4 cockpit layout directions
  02 · Edge cases      → every state Cockpit A must handle
  03 · Core flows      → first feature · second session · hand-off
  04 · Key interactions → gate review · open questions · ADR · skip
  05 · Safety nets     → undo · revert · archival
  06 · System          → catalogues for eng hand-off (settings, keyboard, team mode)
  07 · Help system     → concept popovers
```

### 2. `Specorator Wireframes.html` — Full canvas overview
The original pan/zoom design canvas. All 32 artboards visible at once across 8 sections. Best for:
- Getting a spatial overview of the entire design
- Comparing artboards side by side
- Sharing a single link that shows everything

Use the Tweaks panel (toolbar toggle) to switch between dark/light theme and comfy/compact density.

### 3. `handoff/index.html` — Engineering specification
RFC-style technical spec for the contractor building the plugin. Five documents:

| Doc | Contents |
|-----|----------|
| [Spec 01 · Data model](handoff/spec-data-model.html) | Vault folder layout, file naming, YAML frontmatter schemas, snapshot storage |
| [Spec 02 · State machine](handoff/spec-state-machine.html) | 11 steps, gate checks, UX contracts (MUST/SHOULD language) |
| [Spec 03 · Plugin architecture](handoff/spec-plugin-arch.html) | Obsidian API, commands, settings schema (TypeScript interfaces) |
| [Spec 04 · Algorithms](handoff/spec-algorithms.html) | Gate evaluation, OQ scanning, snapshot/undo — implementation-ready pseudocode |
| [Spec 05 · Team mode](handoff/spec-team-mode.html) | Shared vault conventions, PR sign-off, peer OQ resolution, conflict handling |

---

## Design system

The wireframes use a deliberately **sketchy, lo-fi aesthetic** (Kalam handwritten font, hand-drawn borders) to signal "this is not the final design." This is intentional — it invites feedback on structure and behaviour without getting sidetracked by colour or polish.

### Colours (semantic)
| Token | Hex | Meaning |
|-------|-----|---------|
| `--lane-define` | `#4ad196` | Define lane (steps 1–4) |
| `--lane-build` | `#7fa8e0` | Build lane (steps 5–8) |
| `--lane-ship` | `#c9a227` | Ship lane (steps 9–11) |
| `--accent` | `#7f6df2` | Obsidian purple · coach · interactive |
| `--highlighter` | `rgba(255,229,107,0.5)` | Gate · attention |
| `#c66` | — | Error · fail |

### Typography
- **Kalam / Caveat** — sketchy body text and headings (wireframe aesthetic)
- **Inter** — UI labels, descriptions, settings panels
- **JetBrains Mono** — code, metadata, tags, shortcut keys

### Key components (in `wireframes.css`)
- `.sb-frame` / `.sb-strip` — storyboard frame + horizontal scroll strip
- `.sb-anno` — annotation marginalia above/below a frame
- `.coach` — the contextual guidance panel (purple border, ✶ icon)
- `.ob-window` — Obsidian window chrome (titlebar, ribbon, panes)
- `.sk-btn` — sketch button (plain + `.primary` variant)
- `.mini-window` — small in-frame file/code snippet
- `.popover` — help system popover (fixed shape across all uses)

---

## The 11 steps

```
DEFINE (steps 1–4)
  01 · Vision          "What are we building and why?" (≤1 paragraph)
  02 · Questions       Open questions — tracked with ? prefix, resolved with !
  03 · Rules (EARS)    Testable requirements: WHEN/IF/WHILE/WHERE syntax
  04 · How it works    Technical approach + link to a decision note
  ── GATE A: Define → Build ──────────────────────────────────────────
BUILD (steps 5–8)
  05 · Check design    Does the design match the rules?
  06 · Check rules     Are the rules still valid after implementation?
  07 · Check code      Does the implementation match the spec?
  08 · Check security  Any new attack surface?
  ── GATE B: Build → Ship ───────────────────────────────────────────
SHIP (steps 9–11)
  09 · Release notes   What changed, written for humans
  10 · Deployment log  What ran, where, when
  11 · Retrospective   What would we do differently?
```

Steps 1 and 3 are **required**. All others can be skipped with a mandatory one-line reason. Skipped steps show as ◇ (diamond) in the rail, never ✓ (check).

---

## Key design decisions

| ID | Decision | Short rationale |
|----|----------|-----------------|
| DR-001 | Build as Obsidian plugin | Users already live there. Local-first, strong API, no shell to build. |
| DR-002 | Cockpit follows active note | Context inference matches Obsidian's behaviour. Manual pin available. |
| DR-003 | Plain-English aliases as primary labels | Non-engineers are the target user. Jargon secondary, always with a (?) popover. |
| DR-004 | Markdown + frontmatter is the only state | No database. Human-readable, git-friendly, survives plugin removal. |
| DR-005 | 24-hour undo on every state change | Snapshot before every mutation. Safety without confirmation modals. |
| DR-006 | No telemetry, no account, no server | Local-first contract. Non-negotiable for v1. |
| DR-007 | Sketchy lo-fi wireframes for design phase | Fast iteration, signals incompleteness, invites structural feedback. |

---

## Resolved open questions

| OQ | Question | Resolution |
|----|----------|------------|
| OQ-2 | What does the cockpit show when no feature is in focus? | Last-focused feature restored by default. All-archived and new-vault have dedicated empty states. |
| OQ-3 | Do gates auto-pass or require explicit sign-off? | Solo: auto-pass when all checks green + explicit button click. Team: PR merge = peer sign-off. |
| OQ-4 | How do we handle features that don't need every step? | Any step (except 1 and 3) is skippable with a mandatory one-line reason. Logged in _meta.md. |
| OQ-5 | What does team mode mean without a server? | Shared vault + conventions: committer handles, PR sign-off ceremony, inline `<!-- @handle -->` attribution. |

---

## Vault file structure

```
vault-root/
├── CONSTITUTION.md          ← house rules (vault-level)
├── features/
│   └── {feature-slug}/
│       ├── _meta.md         ← plugin-managed: gate history, snapshots, status
│       ├── 01-vision.md
│       ├── 02-questions.md
│       ├── 03-rules.md
│       ├── 04-how-it-works.md
│       ├── 05-check-design.md
│       ├── 06-check-rules.md
│       ├── 07-check-code.md
│       ├── 08-check-security.md
│       ├── 09-release-notes.md
│       ├── 10-deployment-log.md
│       └── 11-retrospective.md
├── archive/
│   └── {feature-slug}/      ← identical structure, read-only by default
└── decisions/
    └── *.md                 ← decision notes (ADRs)
```

The plugin only scans files matching `features/*/[0-9][0-9]-*.md` or `features/*/_meta.md`. All other vault files are invisible to Specorator.

---

## Non-goals (say no to these)

- **Code generation** — Specorator scaffolds thinking, not files of code
- **Graph-of-everything view** — Obsidian already has this
- **Custom templating language** — Markdown + frontmatter is enough
- **Mobile app** — Obsidian Mobile exists; cockpit is for desktop
- **AI agent inside Specorator** — core flow is deterministic; LLM features can layer later
- **Real-time multiplayer** — team mode is shared vault + conventions, no CRDT or server

---

## Project file map

```
/
├── index.html                     ← structured walkthrough (8 sections)
├── Specorator Wireframes.html     ← full pan/zoom canvas (32 artboards)
├── README.md                      ← this file
│
├── wireframes.css                 ← shared wireframe design system
├── tokens.css                     ← colour tokens
├── app.jsx                        ← canvas wiring (artboard registry)
├── design-canvas.jsx              ← DCSection / DCArtboard component
├── tweaks-panel.jsx               ← TweaksPanel component
│
├── artboards/                     ← 28 HTML artboard files
│   ├── onboarding.html
│   ├── cockpit-A.html             ← three-pane (v1 default)
│   ├── cockpit-B.html             ← vertical rail
│   ├── cockpit-C.html             ← stages-as-board
│   ├── cockpit-D.html             ← feed view
│   ├── walkthrough.html           ← first-feature spotlight tour
│   ├── state-*.html               ← 6 Cockpit A edge-case states
│   ├── help-popovers.html
│   ├── rationale.html
│   └── flow-*.html                ← 14 user flow storyboards
│
├── sections/                      ← structured walkthrough pages
│   ├── nav.css
│   ├── 00-rationale.html
│   ├── 01-product.html
│   ├── 02-states.html
│   ├── 03-core-flows.html
│   ├── 04-interactions.html
│   ├── 05-safety.html
│   ├── 06-system.html
│   ├── 07-help.html
│   └── flows/                     ← individual act pages (27 files)
│       ├── gate-main.html + gate-edge.html
│       ├── oq-writing + oq-collecting + oq-resolving
│       ├── recovery-undo + recovery-revert + recovery-lost
│       ├── completion-shipping + completion-archive + completion-edge
│       ├── constitution-writing + constitution-editing + constitution-edge
│       ├── feedback-tiers + feedback-errors + feedback-confirmations
│       ├── settings-workflow + settings-gates
│       ├── keyboard-nav + keyboard-gate
│       ├── session2-flow + session2-risks
│       └── team-setup + team-gate + team-oq + team-conflicts
│
└── handoff/                       ← engineering specification
    ├── index.html                 ← overview + decision table + non-goals
    ├── spec.css
    ├── spec-data-model.html       ← vault layout, schemas, cache
    ├── spec-state-machine.html    ← steps, gates, UX contracts
    ├── spec-plugin-arch.html      ← Obsidian API, commands, settings
    ├── spec-algorithms.html       ← gate eval, OQ scanner, undo pseudocode
    └── spec-team-mode.html        ← shared vault conventions, PR sign-off
```

---

## Canvas sections at a glance

| # | Section | Artboards | Key content |
|---|---------|-----------|-------------|
| 00 | Design rationale | 1 | Principles, DR-001–007, trade-offs, OQs, non-goals |
| 01 | The product | 6 | Onboarding, Cockpit A/B/C/D, Walkthrough |
| 02 | Cockpit A · states | 6 | New vault, empty, gate fail/pass, stale, just handed off |
| 03 | Core user flows | 3 | First feature, second session, hand-off |
| 04 | Key interactions | 5 | Gate review, open question, OQ-2 resolved, ADR, skip steps |
| 05 | Safety nets | 2 | Recovery (undo/revert/lost), completion & archival |
| 06 | System catalogues | 5 | Constitution, errors/feedback, settings, keyboard, team mode |
| 07 | Help system | 1 | Concept popovers |

**Total: 32 artboards**

---

## Status

| Area | Status |
|------|--------|
| Design rationale | ✓ Complete |
| Cockpit layout directions (A/B/C/D) | ✓ Complete |
| Cockpit A edge cases | ✓ Complete |
| Core user flows | ✓ Complete |
| Gate review flow | ✓ Complete |
| Open question flow | ✓ Complete |
| Decision note (ADR) flow | ✓ Complete |
| Skip steps flow (OQ-4) | ✓ Complete |
| Recovery flow | ✓ Complete |
| Feature completion & archival | ✓ Complete |
| Constitution & house rules | ✓ Complete |
| Errors, feedback & notifications | ✓ Complete |
| Settings catalogue | ✓ Complete |
| Keyboard & command palette | ✓ Complete |
| Second session flow | ✓ Complete |
| Team mode (OQ-5) | ✓ Complete |
| Help system (popovers) | ✓ Complete |
| Engineering handoff spec | ✓ Complete |
| Multi-feature portfolio view | ○ Not started |
| Mobile / Obsidian Mobile | ○ Out of scope v1 |

---

*Living document · v0.1 · Low-fi wireframe phase · May 2026*
