# Engagement Analysis — Obsidian-CLI MCP Expansion

Author: Game Designer (Discovery / Diverge)
Scope: full-CLI surface in the chat sidebar, every write proposal-gated.

## 1. Core loop (30–60 s)

`Ask -> Propose -> Inspect -> Decide -> Observe -> Refine`

1. **Input** — user types intent ("clean up orphan notes in /inbox").
2. **Action** — agent issues read calls, then emits a *proposal card* (diff, target paths, reversibility note).
3. **Feedback** — inline preview: pre/post diff, link graph delta, file count, "undo available: yes".
4. **Reward** — one-click accept fires the write; sidebar shows the realised change + a compact "what just happened" receipt.
5. **Next input** — receipt offers 1–3 suggested follow-ups ("set property `status: triaged`?", "open the 3 renamed files?").

The loop is **tight only if the proposal card is legible at a glance.** If users must open three files to understand a proposal, the loop balloons past 60 s and engagement collapses.

## 2. MDA breakdown

**Mechanics.** Tool calls (read/search), proposals (write, install, delete, restore), accept/reject, batch grouping, embedded webviewer panes, undo log.

**Dynamics that will emerge.**
- *Accept-spam* — after 20 trivial proposals users stop reading and rubber-stamp; first destructive proposal slips through.
- *Fear-of-accept* — opposite failure: users reject reflexively, agent becomes read-only oracle.
- *Agent-as-pet* — users issue tiny commands for dopamine, not value.
- *Vault-cartography* — power users learn the link graph through agent queries faster than through the UI. (Desirable.)

**Aesthetics (Hunt's 8).** Drive: **Discovery** (vault as uncharted territory), **Mastery/Challenge** (user-as-conductor), and **Expression** (vault becomes more *theirs*, not the agent's). Avoid leaning on **Submission** (autopilot) and **Sensation** (flashy animations on accept) — both feed accept-spam.

## 3. Schell's Lenses (5)

- **#35 Curiosity** — does each proposal card answer a question the user actually asked, or does it answer one the agent invented?
- **#38 Reward** — is acceptance itself the reward, or is the *visible state change* the reward? (Only the latter compounds.)
- **#41 Punishment** — what is the cost of a bad accept, and is that cost legible *before* clicking?
- **#62 Goals** — can the user state their session goal in one line, and does the agent's proposal sequence visibly converge on it?
- **#80 Surprise** — when the agent surprises the user, is it delight (found three orphans) or dread (renamed 40 files)?

## 4. Self-Determination Theory

- **Autonomy** — proposal gating *protects* it in principle; *erodes* it when proposals arrive faster than humans read. Cap concurrent open proposals (suggest: 1 destructive or 3 reversible).
- **Competence** — at risk. If the agent does everything, the user feels like a button. Surface the *why* (which CLI call, which heuristic) so the user learns the vault's machinery.
- **Relatedness** — low-stakes here; the "relationship" with the agent should feel like a competent assistant, not a companion. Resist anthropomorphic flourishes.

## 5. Anti-patterns to avoid

1. **Slot-machine accept button** — celebratory animation on every accept; trains compulsive clicking.
2. **Sunk-cost dialogue** ("we've made 12 changes, discarding now will lose progress") — coerces acceptance of a bad batch.
3. **Dark-pattern default-accept** — Enter-key accepts, Esc rejects, with destructive proposals styled identically to reversible ones. Destructive proposals must require a distinct, deliberate gesture.

## 6. Loop redesign — Competence without sacrificing Autonomy

**Replace the binary Accept/Reject with a three-button card: `Accept` / `Reject` / `Show me how`.** "Show me how" expands the exact CLI call(s), the heuristic that chose them, and a one-line "you could run this yourself as…". Over time, users recognise patterns, anticipate proposals, and graduate to issuing them directly. The agent visibly teaches itself out of a job — competence rises, autonomy is untouched.

---

File: `D:\Projects\specorator-plugin\discovery\obsidian-cli-mcp-expansion\engagement.md` (591 words)
