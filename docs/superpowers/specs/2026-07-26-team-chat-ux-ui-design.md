---
title: Team Chat UX/UI pass — roster rail, transcript identity, top bar, motion & density
date: 2026-07-26
status: approved
scope: features/teamChat/ui/vue, features/chat/ui/vue/transcript (surface-gated), src/style/vue/team-chat-host.css, i18n locales
---

# Team Chat UX/UI pass

## Problem

Team Chat (increment 1) shipped a deep engine and a deliberately thin UI. The
thread store, open coordinator, LRU budget, provider rotation, cross-leaf
presence, and surface gating are all thorough — but the surface a user actually
touches is scaffolding:

- **Roster rail.** A title and a flat list of rows (avatar, name, description,
  presence dot). The design spec called for `useLibraryList` + `rosterLibraryAccessors`
  search/sort/filter (§1) — it never landed. There is no last-message preview,
  no timestamp, no unread signal for a DM that answered while you were reading
  another, no keyboard navigation between rows, no per-row actions, and the rail
  is a fixed `minmax(200px, 260px)` column that can be neither collapsed nor
  resized. Rows are `role="button"` with `tabindex="0"`, so a 20-agent team is 20
  tab stops before the composer.
- **Transcript identity.** The DM reuses the sidebar transcript verbatim, so
  assistant messages are anonymous. In a surface whose entire premise is "you
  are talking to *this* agent," the agent's face appears once, in the top bar,
  and never in the conversation. This is the single biggest reason the surface
  doesn't read as a DM.
- **Top bar.** Avatar, name, voice line, provider chip, edited files. No presence
  (the roster knows the agent is busy; the pane you're looking at does not), no
  model, and no actions at all — editing the agent you're talking to means
  leaving for the Library.
- **Empty states.** The no-DM-selected pane is one icon and one line of text. A
  freshly-opened DM with no history is a bare composer. Neither tells a
  first-time user what this surface is for.
- **Motion & density.** DM switches teleport. Hydration shows nothing until
  messages appear. The two-pane grid has no narrow-pane behavior, so in a split
  or a phone-width popout the roster eats the conversation.

## Decisions (user-approved)

| Question | Decision |
|----------|----------|
| Scope | All four areas in one pass. |
| Sequencing | Spec + build together, reviewed as one PR. |
| Group rooms | Still out (increment 2). Nothing here reserves group affordances. |
| Engine changes | None. Every change is presentational or a read-model projection. |
| Sidebar chat | Must stay byte-identical. Transcript identity is surface-gated behind an optional callback. |

## Non-goals

- Any change to `TabManager`, the runtime seam, the thread store's persistence,
  the LRU budget, or provider rotation.
- Multi-thread-per-agent, group rooms, or agent-to-agent messaging.
- A message-level read-receipt model. "Unread" here is a local per-leaf
  activity signal, not persisted state (see §1.3).
- Replacing the composer. It stays the reused chat island.

## 1. Roster rail

### 1.1 Search & sort

Wire the rail to `useLibraryList<RosterAgent>(() => store.agents, rosterLibraryAccessors)`
— the same engine the Library's `AgentsPanel` uses, so search semantics
(case-insensitive substring over name + description, OR-tag filter) are shared,
not re-derived.

The rail renders a **compact** toolbar, not the full `LibraryToolbar`: a search
input plus a sort control, and no tag filter chips. Rationale — the rail is
260px at its widest; the Library's chip row would wrap to three lines on a
10-tag roster. `useLibraryList` still exposes `allTags`/`toggleFilter`; the rail
simply doesn't render them, which keeps a future "filter by role" affordance a
template change rather than a rewiring.

Sort gains a third option beyond the shared `LibrarySort` union's `name` /
`updated`: **`recent`** — most-recent DM activity first, which is what a DM list
sorts by everywhere else. Because `LibrarySort` is a shared type consumed by the
Library, Team Chat does NOT widen it. Instead the rail owns a local
`TeamRosterSort = LibrarySort | 'recent'`, passes `name`/`updated` through to
`useLibraryList` unchanged, and applies the `recent` ordering itself over
`list.rows` using the thread projection (§1.2). Default is `recent`, falling back
to name order for agents with no thread yet — a first-run roster with no DMs
reads alphabetically, exactly as it does today.

The search box is skipped entirely when the roster has fewer than
`ROSTER_SEARCH_MIN_AGENTS` (6) agents: a search field over four rows is noise.

### 1.2 Row content

Each row grows from `avatar + name + description + dot` to:

```
┌────────────────────────────────────────────┐
│ (avatar)  Name                      12m    │  ← timestamp, right-aligned
│           Last message preview…      ●     │  ← preview + unread/presence
└────────────────────────────────────────────┘
```

- **Preview** replaces the static `description` when the agent has a DM with
  history, falling back to `description` (then `—`) when it doesn't. A DM you
  have talked to shows what was said; one you haven't shows what the agent is
  for.
- **Timestamp** is a relative, coarse label (`now`, `12m`, `3h`, `2d`,
  then a locale date) computed from the thread's `updatedAt`. Rendered in a
  `<time :datetime>` element with the absolute time as `title`.
- **Presence dot** stays, but is now one of three states rather than two:
  `busy` (streaming — unchanged pulse), `unread` (§1.3), `idle`. Only one
  renders; `busy` outranks `unread`.

Preview text is **plain-text flattened and clamped** to a single line via
`text-overflow: ellipsis`. It comes from `ConversationMeta.preview`, which is
already computed for the history dropdown — no new derivation.

### 1.3 Unread

Unread is a **per-leaf, in-memory activity signal**, not persisted state. The
view keeps `lastSeenByAgent: Map<agentId, timestamp>`, stamped whenever that
agent's DM becomes the active tab. An agent is unread when its thread's
`updatedAt` is newer than its last-seen stamp AND its DM is not the active tab.

This is deliberately weaker than a read model:

- It resets when the leaf closes. Losing an unread badge across a restart is
  strictly better than persisting a wrong one, and it needs no new file.
- It cannot mark a message unread that the user actually read in another leaf,
  because "active tab" is checked per leaf and a DM is single-mounted across
  leaves by the open coordinator.

The badge is a dot, not a count. A count would imply per-message tracking we
explicitly do not do.

### 1.4 Keyboard access

Replace the "every row is a tab stop" model with a **roving tabindex** list:

- The rail's rows form a `role="listbox"` with `role="option"` rows and
  `aria-selected`, which is the correct role pair for "pick one of N, the pane
  shows the pick" — and what makes the selected row announce as selected rather
  than as a pressed button.
- Exactly one row carries `tabindex="0"` (the selected row, else the first);
  every other carries `tabindex="-1"`. The list is one tab stop.
- `ArrowUp`/`ArrowDown` move the roving focus (not the selection), `Home`/`End`
  jump to the ends, `Enter`/`Space` open the focused agent's DM. This is
  browse-then-commit, so arrowing through a 20-agent roster does not spawn 20
  DMs against the LRU budget.
- Arrow keys `preventDefault` so the rail doesn't scroll the pane underneath.

### 1.5 Per-row context menu

A right-click (and a keyboard-reachable `⋯` button revealed on hover/focus)
opens an Obsidian `Menu` with:

| Item | Action |
|------|--------|
| Open chat | Same as a row click (present so the menu is self-sufficient). |
| Edit agent… | Opens the Library on the Agents tab, deep-linked to this agent. |
| Close chat | Closes the DM tab if open, freeing an LRU slot. Never deletes the thread mapping — reselecting reopens the same transcript. |

"Close chat" is gated off while that DM is streaming, matching
`pickLruDmEviction`'s refusal to force-close a live turn: the two must not
disagree about whether truncating a running response is acceptable.

### 1.6 Collapse & resize

- The rail collapses to a 56px **icon rail** (avatars + presence only, name in
  `title`/`aria-label`) via a header toggle. Collapsed state persists in the
  leaf's view state alongside the DM layout, so it is per-leaf like everything
  else Team Chat persists.
- The rail is resizable by dragging its trailing edge, clamped to
  `[200px, 420px]`, with the width persisted per leaf. The drag handle is a
  `role="separator"` with `aria-orientation="vertical"` and
  `ArrowLeft`/`ArrowRight` keyboard resizing, so resize is not mouse-only.
- Below `--sp-team-chat-narrow` (720px of leaf width) the rail auto-collapses to
  the icon rail regardless of the stored preference, and the stored preference is
  left untouched so widening restores it (§4.3).

## 2. Transcript agent identity

The goal: an assistant message in a Team Chat DM reads as *from that agent*.

### 2.1 The seam

`TranscriptCallbacks` gains ONE optional member:

```ts
/** Identity to attribute assistant messages to, or null for an anonymous
 *  transcript. Only Team Chat DM tabs supply it; absent on every other
 *  surface, which therefore renders byte-identically to before. */
getMessageIdentity?: () => TranscriptIdentity | null;
```

`TranscriptIdentity` is `{ name: string; persona: AgentPersona }` — the already-
shared persona shape `renderAgentAvatar` consumes, so the transcript does not
learn about `RosterAgent`.

`buildTranscriptCallbacks` supplies it **only** when
`isTeamChatSurfaceConversation(plugin, tab.conversationId)` — reusing the existing
surface predicate rather than adding a second definition, exactly as `isForkEligible`
already does. It resolves the bound agent through the roster store synchronously
and returns null when the agent has left the roster (the DM is read-only then;
attributing messages to a deleted agent would be worse than anonymity).

Optionality is load-bearing in two ways: existing unit fixtures and callback
builders that predate this member keep compiling, and the sidebar path never even
evaluates the identity.

### 2.2 Rendering

`MessageBubble` renders an identity header above an assistant message's content
**only** when `getMessageIdentity()` returns non-null:

```
(avatar) Agent name
         …message content…
```

Consecutive assistant messages **group**: the header renders only on the first
message of a run, matching every DM client and avoiding an avatar wall on a
tool-heavy turn. Grouping is computed from the message's position in the
projected list, not from timestamps.

### 2.3 DOM contract

The header is **additive**: a new `.specorator-message-identity` element inside
the existing message shell. Every class `domContract.test.ts` asserts —
`.specorator-message`, `.specorator-message-user`, `.specorator-messages` —
keeps its exact role and nesting, because the four imperative consumers
(`NavigationController` scans `.specorator-message-user` + `offsetTop`, the three
selection controllers, `ChatDropController`, `StreamController` auto-scroll) query
those and nothing about the header changes their layout position. The contract test
gets a new case asserting the header is absent without the callback, so a future
change can't leak identity into the sidebar unnoticed.

## 3. Top bar & empty states

### 3.1 Top bar

Composition becomes:

```
(avatar+presence)  Name                     [model] [provider]  (files)  (⋯)
                   voice line
```

- **Presence** rides the avatar as a corner dot (the standard DM-client
  placement) rather than a separate element, reusing `PresenceDot` so the roster
  and the top bar can never disagree about what "busy" looks like.
- **Model chip** sits beside the provider chip, projected as `activeModelId`
  through the snapshot. It is the display name where the provider catalog knows
  it, else the raw id — the same guarded-lookup shape the provider chip already
  uses. Hidden when unknown rather than showing a placeholder.
- **Overflow menu** (`⋯`, an Obsidian `Menu`): *Edit agent…* (Library deep-link)
  and *Close chat* (same gating as §1.5). Notably absent: anything that would
  mint a conversation — fork, new session, `/clear` are surface-gated off for
  good reasons and must not reappear as a top-bar affordance.

The bar collapses gracefully: the voice line drops first, then the model chip,
then the provider chip (§4.3).

### 3.2 Empty states

Two distinct states, currently one:

- **No DM selected.** Icon + headline + one line of guidance, plus — when the
  roster is non-empty — up to three **agent quick-picks** (avatar + name chips)
  that open that agent's DM. A roster with agents should never present a dead
  pane whose only instruction is "select an agent" while the list sits two
  inches away.
- **DM open, no history.** A greeting card in the transcript area naming the
  agent, its voice line, and **conversation starters** — up to three prompts
  drawn from the agent's own definition where it has them, falling back to three
  generic openers. Clicking one fills the composer (it does **not** send; a
  one-click send from a starter is how you accidentally spend a turn).

Both are `pointer-events: none` at the container level with the interactive
children opting back in, so neither can swallow a click meant for the transcript
underneath.

## 4. Motion, density, responsive

### 4.1 Motion

- **DM switch**: a 120ms opacity/translate fade-in on the content host keyed to
  the active conversation id. Short enough not to feel laggy on rapid roster
  arrowing, and it makes a switch legible rather than instantaneous-and-confusing.
- **Row hover/selection**: transition `background-color` rather than snapping.
- **Unread dot**: appears with a small scale-in; no pulse (only `busy` pulses, so
  the two states stay distinguishable at a glance).
- Every animation is disabled under `prefers-reduced-motion: reduce`, keeping the
  color/position signal and dropping only the movement — the parity rule
  `PresenceDot` already follows.

### 4.2 Density

- The roster row gains a second text line, so its vertical rhythm is re-struck on
  the `--sp-space-*` scale rather than by ad-hoc padding: 2xs internal, s between
  avatar and text, with a fixed two-line height so rows don't jitter as previews
  arrive.
- The top bar tightens to match the roster header's baseline so the two panes
  read as one horizontal band.
- New tokens are added to `src/style/vue/tokens.css` where a value is needed in
  more than one component — per the baseline rule that components consume
  `--sp-*` only and any new Obsidian variable is mapped there first.

### 4.3 Responsive

The two-pane grid gets container-driven breakpoints on the leaf width:

| Width | Behavior |
|-------|----------|
| ≥ 720px | Full rail (stored width), full top bar. |
| 480–720px | Rail auto-collapses to the 56px icon rail; stored preference untouched. |
| < 480px | Icon rail; top bar drops the voice line, then the model chip, then the provider chip. |

The transcript's `max-width: 56rem` reading measure is retained.

## Testing

Vue lane (`tests/vue/teamChat/`):

- **Roster**: search filters rows; `recent` sort orders by thread activity with a
  name fallback; preview falls back to description then `—`; relative timestamps
  bucket correctly; unread dot shows only for a non-active DM with newer activity;
  arrow/Home/End move focus without opening a DM while Enter opens one; exactly
  one row is tabbable; the context menu gates "Close chat" while streaming.
- **Collapse/resize**: toggle collapses to the icon rail and persists; the
  separator clamps to `[200, 420]`; narrow width auto-collapses without
  clobbering the stored preference.
- **Top bar**: presence rides the avatar; the model chip hides when unknown; the
  overflow menu offers exactly the two non-conversation-minting actions.
- **Empty states**: quick-picks appear only with a non-empty roster and open the
  right DM; a starter fills the composer and does not send.

Transcript lane (`tests/vue/chat/transcript/`):

- Identity header renders for an assistant message when `getMessageIdentity`
  returns a persona, groups across consecutive assistant messages, and is
  **absent** when the callback is undefined (the sidebar-parity assertion).
- `domContract.test.ts` gains the absent-header case and otherwise passes
  unchanged.

Unit lane (`tests/unit/features/teamChat/`):

- The thread-metadata projection: preview/updatedAt per agent, unread derivation
  against the last-seen map, and that a missing/unloaded conversation projects
  absent rather than throwing.

## Risks

- **Roster preview requires conversation metadata for DMs that aren't open.**
  Projected from the thread store's mapping plus the conversation store's metas;
  an unresolved or unloaded conversation projects no preview rather than blocking
  the row. The rail must never await vault I/O in a computed.
- **`role="listbox"` changes announced semantics** from the current
  `role="button"` rows. This is a correction, not a regression, but it does change
  what a screen reader says — called out here so review sees it as intentional.
- **Identity grouping interacts with the render window.** Grouping is derived from
  the projected message list, which is windowed; a group boundary at the window
  edge can render one extra header after a "load earlier". Cosmetic and
  self-correcting on the next projection; not worth threading pre-window state
  through for.
