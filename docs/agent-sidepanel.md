---
title: Agent sidepanel — user guide
doc_type: guide
status: current
owner: product
last_updated: 2026-05-22
references:
  - specs/multi-provider-agent-sidepanel/release-notes.md
  - decisions/ADR-MPS-001-rename-claude-cli-port.md
  - decisions/ADR-MPS-002-provider-selection-discriminator.md
  - decisions/ADR-MPS-003-cursor-binary-resolver.md
---

# Agent sidepanel

The agent sidepanel is Specorator's in-vault chat surface. It talks to one or
more AI providers, keeps multiple conversations in parallel, and integrates
with the workflow stage in the active feature folder.

Open it from the ribbon icon, the command palette (**Open agent sidepanel**),
or a URI:

```
obsidian://specorator?action=open-chat
obsidian://specorator?action=open-chat&provider=cursor:cli
```

## Providers

The header drop-down picks a `(provider, mode)` selection. Switching mid-thread
is safe — any in-flight turn finishes on the original provider; the next turn
dispatches on the new selection.

| Provider | Modes | Notes |
|---|---|---|
| **Claude** | `api`, `cli` | `api` uses an Anthropic API key; `cli` shells out to your local `claude` binary and uses your existing CLI subscription / login. |
| **Cursor** | `api` (preview), `cli` | `cli` is primary — it shells out to `cursor-agent` on `PATH`. `api` is gated behind the `cursorApiPreview` feature flag because the public Cursor REST surface is not yet stable. |

The `auto` selection lets Specorator pick the first available transport. The
`degraded` selection is what you see when no provider resolved — the panel
still opens, but turns are disabled and the header explains why.

### Claude — API key

1. Open **Settings → Specorator → Providers**.
2. Paste your Anthropic API key into **Anthropic API key**.
3. The key is stored in Obsidian's first-party `app.secretStorage` (desktop
   1.11.4+). On older builds the field renders a degraded notice and falls
   back to the CLI mode.

### Claude — CLI

Install the Anthropic CLI per the upstream instructions and confirm
`claude --version` resolves on your shell `PATH`. Specorator discovers the
binary by spawning it; there is no path picker.

### Cursor — CLI (primary)

1. Install `cursor-agent` so that `cursor-agent --version` works in a fresh
   shell. The binary resolver follows ADR-MPS-003 — it consults `PATH` only.
   No custom path setting is exposed.
2. Open the agent sidepanel and pick **Cursor → CLI** from the header.
3. The first turn confirms the binary by streaming its banner.

### Cursor — API (preview, opt-in)

The Cursor REST surface is still moving. To enable:

1. Toggle **Settings → Specorator → Providers → Cursor API (preview)** on.
2. Paste your Cursor API key. Like the Anthropic key, it lives in
   `app.secretStorage`.
3. Restart the agent sidepanel.

The base URL defaults to `https://api.cursor.sh/v1` (RES-MPS-001 placeholder)
and will be revisited once CQ-MPS-01 closes upstream.

### Secret storage — mobile note

`app.secretStorage` is a desktop-only API. On mobile builds the key fields
render as read-only with a degraded notice; CLI modes are also unavailable
because they spawn processes. The panel opens in `degraded` mode and turns
are disabled.

## Multi-thread switcher

A tab strip across the agent header carries up to `chatTabCap` threads
(default 8 — adjust in **Settings → Specorator → Chat**).

- **New thread** — the `+` button. The first user message derives the default
  title.
- **Rename** — right-click a tab → **Rename**. Empty names revert.
- **Delete** — right-click → **Delete**. A confirm modal blocks accidental loss.
- **Fork** — right-click → **Fork**. Spawns a new thread seeded with the
  selected thread's history up to the current turn.
- **Keyboard nav** — `Ctrl/Cmd+Tab` cycles forwards, `Ctrl/Cmd+Shift+Tab`
  backwards. Arrow keys move focus within the strip; `Enter` activates.

## Per-message actions

Each assistant or user message exposes:

- **Copy** — copies the rendered Markdown body to the clipboard.
- **Regenerate** (assistant) — re-runs the prior user turn on the current
  provider selection. The previous response is preserved in history.
- **Edit** (user) — opens the input pre-filled. Sending replaces the original
  user turn and rewinds the thread to that point.

Actions live in a hover toolbar and are reachable via `Tab` for keyboard users.

## Input modes

The composer supports three modes, picked by prefix or shortcut:

| Mode | How to enter | Effect |
|---|---|---|
| **Plan** | `Shift+Tab` toggles | The turn asks the provider to plan before acting. Surfaces an inline approval before tool calls run. |
| **Bang** | First character `!` | Treats the rest of the line as a shell-style turn. Verbatim — no system framing added. |
| **Instruction** | First character `#` | The body after `#` becomes a one-turn system instruction. Used for short steering nudges without polluting history. |

## Status panel

The status panel sits beneath the composer and shows:

- **Todos** — persistent across turns; the provider proposes them and you tick
  them off. Cleared when you start a new thread.
- **Bash output history** — every tool-invoked shell command + its tail. Click
  an entry to expand the full output.

Toggle the panel via the eye icon in the header. The state survives reloads.

## Slash commands

Type `/` to open the command picker. Three sources contribute:

- **Built-ins** — `/clear`, `/help`, `/model`, etc. Always available.
- **Provider-supplied** — Claude and Cursor each contribute commands at
  runtime; the picker labels them with the provider badge.
- **Vault commands** — Markdown files under `.specorator/commands/` are
  exposed as `/<filename>`. The file body becomes the prompt template.

## Inline approvals

Tool calls that need explicit consent render an approval card inline. Three
buttons: **Approve once**, **Always approve**, **Deny**. **Deny** is the
default focus; `Escape` is equivalent to **Deny** (no accidental approvals
from a stray Enter).

Persistent rules live in **Settings → Specorator → Approvals**. Rules match by
glob (paths) or bash prefix (commands). Remove a rule from the same panel.

## Command palette

- `specorator:open-agent-sidepanel` — opens the panel without changing the
  current provider selection.
- `specorator:switch-provider` — cycles through the six selections (auto →
  claude:api → claude:cli → cursor:api → cursor:cli → degraded).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Panel opens in `degraded` mode | No provider resolved. | Set a key (Claude/Cursor API) or install the matching CLI binary on `PATH`. |
| Cursor CLI cell disabled | `cursor-agent` not on `PATH`. | Reinstall and reopen Obsidian so the new `PATH` is picked up. |
| Cursor API cell hidden | `cursorApiPreview` flag off. | Toggle **Settings → Providers → Cursor API (preview)**. |
| API key field is read-only | `app.secretStorage` not available (older desktop or mobile). | Upgrade Obsidian to 1.11.4+; mobile is unsupported. |
| Tab strip caps out | `chatTabCap` reached. | Increase **Settings → Chat → Max threads**, or delete an old thread. |
