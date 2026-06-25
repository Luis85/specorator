# Security policy

## What Specorator does

Specorator embeds provider-native agent CLIs (Claude Code, Codex, Opencode,
Cursor Agent) inside Obsidian and drives them as subprocesses. Those agents can
read and write files and execute shell commands using your vault as their
working directory. Because they are the real provider CLIs, their reach is the
same as running them yourself in a terminal under your user account.

The plugin itself:

- contains **no telemetry, analytics, or auto-update** mechanism;
- sends data over the network **only** to the AI provider (or MCP server) you
  explicitly direct a turn to, and only when you trigger that turn;
- stores provider API keys, MCP auth headers, and MCP env vars in the OS
  keychain via Obsidian `SecretStorage`, never in plain-text vault files;
- passes spawned subprocesses an **allowlisted** environment rather than your
  full shell environment.

## Safety controls

- **Preview-before-apply** is the default: file edits surface a diff for your
  approval before they touch your notes.
- **YOLO mode** (opt-in) removes per-step approval and should be enabled only
  for runs you trust.
- The agent runs with the permissions of your user account; review any tools or
  MCP servers you grant it.

## Reporting a vulnerability

Please report security issues privately via [GitHub Security
Advisories](https://github.com/Luis85/specorator/security/advisories/new)
rather than opening a public issue. Include reproduction steps and the affected
version. We aim to acknowledge reports within a few days.
