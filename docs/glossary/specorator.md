---
term: "Specorator"
aliases: []
category: core
status: stable
version: "v1 and v2.0"
related:
  - companion-app.md
  - agentic-workflow.md
  - cockpit.md
issues:
  - "#1"
  - "#164"
last_updated: 2026-05-05
---

# Specorator

The Obsidian plugin described in this repository. Specorator surfaces the `agentic-workflow` methodology inside Obsidian, providing workflow navigation, artifact creation, and AI-assisted collaboration through every stage of the product development lifecycle — from idea to tested, shipped code.

The name is a portmanteau of *spec* and *decorator*: Specorator layers workflow structure and AI assistance onto a vault without owning the underlying content. Everything it produces is plain Markdown that remains useful without the plugin installed.

## v1

In v1, Specorator installs the `agentic-workflow` template into a vault and provides a workflow navigator and a Claude CLI chat sidebar. The user governs their work through a conversational interface; the plugin handles context assembly, stage tracking, and artifact creation.

## v2.0

In v2.0, Specorator becomes a fully orchestrated companion: `specorator-runtime` coordinates specialised `agentonomous` agents through each workflow stage, the fleet dashboard shows all active features and their pipeline state simultaneously, and the user steers the agentic workforce from a single cockpit inside Obsidian.

## What does not change between versions

The vault remains the source of truth. All outputs are plain Markdown. The user's authority over every stage transition is unconditional. The UI vocabulary never exposes technical internals to the user.
