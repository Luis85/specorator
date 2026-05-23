---
feature: "Obsidian CLI-backed MCP server"
area: OCM
slug: obsidian-cli-mcp-server
stage: idea
status: accepted
date: 2026-05-23
---

# Idea — Obsidian CLI-backed MCP server

## One-liner

Provide a fully integrated MCP server whose tool surface is **built upon the official
Obsidian CLI**, and which the user can manage from the Specorator plugin's settings tab.

## Problem

Specorator already runs an in-process MCP server (ADR-013) that exposes the vault to
local agents through the plugin's narrow ports (vault, workflow, metadata, links,
canvas, bases). That surface is limited to what those ports re-implement against
Obsidian's in-process API.

Obsidian now ships an **official command-line interface** (since 1.12, Feb 2026) that
remote-controls a running vault and exposes 100+ first-party operations — search with
context, daily notes, properties, tags, tasks, bookmarks, templates, bases — with
machine-readable `format=json` output. Re-implementing each of those against the plugin
API is wasteful when the CLI already does it correctly and is maintained by Obsidian.

Users also have no real *management* surface for the MCP server: the settings tab only
shows a static "running/stopped" line. There is nowhere to point the server at the CLI
binary or confirm the connection details.

## Proposed solution

1. Add a narrow `ObsidianCliPort` that wraps invocation of the official `obsidian`
   binary (`obsidian <command> key=value … format=json`).
2. Register a **CLI-backed tool group** on the existing MCP server. Reads are
   allow-listed and call the CLI directly; writes go through the existing
   `ProposalStore` review boundary (ADR-007/013) — agents propose, humans accept.
3. Surface management in the settings tab: an "Obsidian CLI path" field with
   autodetect + test (mirroring the existing "Claude CLI path" field), and a status
   readout that shows whether the CLI is configured and the loopback URL when running.

## Why now

- The official CLI is the missing piece that makes a broad, first-party tool surface
  cheap and correct.
- The MCP server, proposal queue, binary-resolver pattern, and settings-field pattern
  all already exist — this is an additive composition, not new infrastructure.

## Non-goals

- Replacing the in-process tool groups from ADR-013. This is additive.
- Exposing the CLI's arbitrary-JS `eval` command or destructive commands
  (`delete`, `move`, plugin/theme management) as agent tools. Out of scope on
  security grounds.
- A standalone stdio MCP process. The CLI tool group rides the existing loopback
  HTTP transport.

## Success criteria

- With the CLI path configured and the MCP server enabled, a connected MCP client can
  search the vault, read a note, and read note properties via CLI-backed tools.
- A CLI-backed write surfaces as a pending proposal, never an immediate mutation.
- When no CLI is configured/available, the server still starts and the in-process
  tools work; the CLI group is simply absent.
