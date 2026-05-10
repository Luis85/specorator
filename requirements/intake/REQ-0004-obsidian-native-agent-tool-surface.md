---
id: REQ-0004
status: proposed
summary: "Expose every Obsidian-aware agent capability via an in-plugin MCP server; route all vault writes through a user-reviewed accept/reject proposal flow; agents never use ad-hoc file paths or system-prompt context injection for vault operations"
owner: "Luis85"
created: 2026-05-10
last_updated: 2026-05-10
source_issue: "#165"
related_design: "#163"
tags: [requirements, intake, architecture, mcp, agent-tooling, obsidian, ports]
priority: high
risk: high
verification:
  - "Per-tool unit tests cover the 35 MCP tools listed in the tool catalogue (vault, frontmatter, links/graph, canvas, bases, workflow, metadata)"
  - "Integration test starts the MCP server, connects an MCP client, and round-trips read + write tool calls"
  - "Write-tool integration test asserts every write tool returns a proposal receipt and never mutates the vault before user acceptance"
  - "ProposalStore unit tests cover queue-on-call, accept-applies-via-port, reject-discards, request-changes-emits-feedback"
  - "ESLint port-import boundaries remain green: no Vue component imports `obsidian`; no agent path bypasses `ObsidianMcpServerPort`"
  - "Lifecycle test asserts `PluginCore` starts the MCP server on `onload` and stops it on `onunload`"
  - "ObsidianClaudeCliAdapter end-to-end test confirms the spawned `claude` subprocess is configured with the MCP connection string from `getConnectionConfig()`"
statement: "The system SHALL expose every Obsidian-aware agent capability — vault, frontmatter, links and graph, canvas, bases, workflow, and metadata — exclusively through an in-plugin Model Context Protocol (MCP) server reachable via an `ObsidianMcpServerPort`, SHALL route every vault-mutating tool call through a `ProposalStore` that requires explicit user acceptance in the chat sidebar before any write is applied, and SHALL prohibit agent code paths that read or mutate vault content via raw file paths, system-prompt context injection, or markdown parsing outside the published tool catalogue."
rationale: "Specorator's product thesis is that the vault is the agentic operating environment, not an output destination. Honouring the Obsidian Philosophy Contract — plain Markdown, first-class wikilinks, frontmatter as structured data, Canvas as a visual workspace, Bases as the structured view layer, the metadata cache as a knowledge graph — requires a single, typed, Obsidian-native tool surface. MCP is the stable, versioned contract that lets the v1 Claude CLI subprocess (#161) and v2.0 `agentonomous` agents (#23) share the same tool implementations, the same accept/reject semantics, and the same ADR-008 narrow-port boundaries. Without this requirement as the upstream contract, future agent integrations regress toward path-string heuristics and unreviewed writes that violate user trust and Obsidian conventions."
acceptance_criteria:
  - "An `ObsidianMcpServerPort` is declared in `src/domain/ports/` exposing at minimum `start(): Promise<{ port: number }>`, `stop(): Promise<void>`, and `getConnectionConfig(): McpConnectionConfig`."
  - "A concrete in-plugin MCP server implementation registers the full tool catalogue: 6 vault tools, 4 frontmatter tools, 5 links/graph tools, 6 canvas tools, 5 bases tools, 6 workflow tools, 3 metadata tools (35 total) — names exactly matching the catalogue in #165."
  - "Read tools (`vault_read_note`, `vault_search`, `vault_list_folder`, `frontmatter_get`, `frontmatter_get_field`, `links_get_outgoing`, `links_get_backlinks`, `links_resolve`, `graph_traverse`, `canvas_read`, `bases_query`, `bases_list_fields`, `bases_get_record`, `bases_find_by_field`, `workflow_get_state`, `workflow_list_features`, `workflow_get_stage_artifacts`, `workflow_get_quality_gates`, `metadata_get_file_cache`, `metadata_get_all_tags`, `metadata_get_resolved_links`) return structured results without modifying the vault."
  - "Every write tool (`vault_write_note`, `vault_append_to_note`, `vault_create_folder`, `frontmatter_set_field`, `frontmatter_set_many`, `links_add_to_note`, `canvas_add_text_node`, `canvas_add_file_node`, `canvas_add_edge`, `canvas_update_node`, `canvas_create`, `bases_update_record`, `workflow_create_artifact`, `workflow_propose_advance`) enqueues a pending proposal in `ProposalStore` and returns a proposal receipt; no vault mutation occurs prior to user acceptance."
  - "`ProposalStore` supports `queue`, `list`, `accept(id)`, `reject(id)`, and `requestChanges(id, feedback)` operations. Acceptance applies the change through the appropriate ADR-008 port (`VaultPort`, `CanvasPort`, etc.); rejection emits a rejection signal back to the calling agent session."
  - "The chat sidebar renders each pending proposal as a structured review card showing tool name, target path, change summary or diff, and accept/reject controls keyed by proposal id."
  - "`PluginCore` starts the MCP server during `onload` and stops it during `onunload`. A failed start is reported via `LoggerPort` (error level) and does not crash plugin load."
  - "`ObsidianClaudeCliAdapter` reads `ObsidianMcpServerPort.getConnectionConfig()` and passes the resulting MCP connection flag to the spawned `claude` subprocess; no other context-injection path supplies vault state to the subprocess."
  - "Vault frontmatter writes are AST-aware: `frontmatter_set_field` and `frontmatter_set_many` preserve unrelated fields, comments, and surrounding Markdown body byte-for-byte except for the modified keys."
  - "Wikilink writes via `links_add_to_note` produce `[[wikilink]]` syntax (not raw paths) and the target resolves through `metadata_get_resolved_links` after acceptance."
  - "Canvas writes conform to the JSON Canvas spec (https://github.com/obsidianmd/jsoncanvas); a round-trip `canvas_read` after acceptance returns the inserted node or edge."
  - "Bases writes via `bases_update_record` only modify frontmatter fields declared by `bases_list_fields` for the targeted base; fields outside that schema are rejected."
  - "ESLint `no-restricted-imports` boundaries remain green: no Vue component imports `obsidian`; no MCP tool implementation reaches into `app.vault` or `app.metadataCache` outside the documented port surface."
  - "`npm run verify` remains green after MCP server and ProposalStore code lands, including the global 80/70/80/80 (statements/branches/functions/lines) coverage thresholds defined in `vitest.config.ts`."
  - "A canvas or bases write tool whose review UI is not yet implemented surfaces an explicit \"coming soon\" proposal card rather than silently failing or applying."
traceability:
  upstream:
    - "Issue #165 — Obsidian-native agent tool surface (this requirement)"
    - "Issue #164 — Product Philosophy: vault as agentic operating environment"
    - "Issue #85 — Architecture hardening (W13 prerequisite)"
    - "ADR-008 — narrow ports"
    - "ADR-009 — testing conventions"
    - "CONSTITUTION.md §3 — Spec-First Gate"
  downstream:
    - "Issue #163 — W13 epic delivering the port and MCP server infrastructure (closed; 35 tools shipped)"
    - "Issue #161 — Claude CLI Chat Sidebar (primary v1 consumer)"
    - "Issue #23 — v2.0 agentonomous agents (secondary consumer; same MCP surface)"
    - "Issue #203 — Obsidian CLI evaluation (verifies against this contract)"
    - "TBD — design / implementation tasks for canvas-write and bases-write review UI"
---

## Notes

- **Why this is a "living" requirement.** The W13 epic (#163) delivered the initial 35-tool catalogue and the MCP server infrastructure. This REQ does not re-litigate that work; it captures the durable contract that future tool additions, future agent surfaces (v2.0 `agentonomous`), and adjacent integrations (#203 Obsidian CLI evaluation) check back against. Promoting `status:proposed` → `accepted` lets the spec-first gate in `CONSTITUTION.md §3` reference this REQ instead of the open issue body.
- **Out of scope (this requirement).**
  - Authentication or authorisation between the MCP client and server beyond loopback transport. The server binds to localhost only; multi-user / remote-agent auth is a separate v2 requirement.
  - Tool-call telemetry or usage analytics. Logging via `LoggerPort` is in scope; analytics export is not.
  - Batch proposal review across a multi-tool agent session. Listed in #165 as a v2 extension; this REQ covers single-proposal review only.
  - Live subscription to vault file-change events for cache invalidation. Cache freshness is delegated to Obsidian's metadata cache; reactive cache invalidation is a future requirement if needed.
- **Open questions for triage / design.**
  - Should the MCP transport be HTTP/SSE (matches reference implementations) or stdio (lower surface area, no port collisions)? Decide before W13 hardening.
  - Where does the proposal review card live in the sidebar component tree — inline in the chat transcript, or a separate "pending changes" pane? UX decision; design intake recommended.
  - Diff rendering strategy for `vault_write_note` proposals: full file diff, hunk-level diff, or summary-only? Performance vs clarity tradeoff for large notes.
  - "Coming soon" proposal cards for canvas/bases writes — should they queue and replay once the review UI ships, or reject immediately and let the agent retry later?
- **Risk: high.** This requirement is system-wide and architecturally load-bearing. Every future agent capability either passes through this surface or violates it. Mitigations: the W13 work has already proved the port shape and tool catalogue; ADR-008 narrow ports keep the impact bounded; the accept/reject flow keeps user trust in writes from day one.
