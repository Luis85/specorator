---
term: "Cockpit"
aliases: ["Specorator cockpit", "navigator view"]
category: ui
status: stable
version: "v1 and v2.0"
related:
  - fleet-dashboard.md
  - workflow-navigator.md
  - chat-sidebar.md
issues:
  - "#1"
  - "#168"
last_updated: 2026-05-05
---

# Cockpit

The primary Specorator panel inside Obsidian. The cockpit is the user's single point of contact with the agentic workflow: it shows the current feature's stage, provides access to artifacts, surfaces agent activity, and presents governance decisions.

## v1

In v1, "cockpit" and "workflow navigator" are used interchangeably. The cockpit shows the active feature, its current stage (in plain language), expected next artifacts, and controls for opening or creating workflow files. The Claude CLI chat sidebar is always visible alongside the workflow state strip.

## v2.0

In v2.0, "cockpit" broadens to encompass the fleet dashboard: the full multi-feature portfolio view with the pipeline matrix, live session feed, intervention controls, artifact links, and health signals. The per-feature navigator view is retained as a drill-down within the cockpit.

The v2.0 cockpit is where the user "overwatches" their agentic workforce — seeing all active features and their pipeline state simultaneously, steering the agents that need redirection, and approving the governance gates that need their decision.

## Etymology

"Cockpit" is used deliberately rather than "dashboard" or "panel": the user is the pilot who sets direction and makes decisions; the agents are the instruments and systems that execute. The cockpit is not an observation window — it is a steering interface.
