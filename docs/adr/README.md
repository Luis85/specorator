# Architecture Decision Records

Index of ADRs for the Specorator plugin. **Each ADR's own frontmatter is
authoritative** for `status` / `supersedes` / `superseded-by`; this table is a
navigation aid.

ADR bodies are immutable — to change a decision, supersede it with a new ADR and
update only the predecessor's `status` + `superseded-by` pointer fields.

## P0 reboot scope (ADR-PSR-001)

The P0 reboot (`ADR-PSR-001`) **keeps the architectural skeleton** and
**supersedes the feature-facing surface**. Per ADR-PSR-001 §Decision:

- **Kept (in force):** ADR-001 (DDD layering), ADR-003 (Vue Composition API),
  ADR-004 (`Result`), ADR-009 (test conventions), ADR-010/011/012 (module system
  / EventBus / lifecycle), and ADR-008's **six core narrow ports** + the
  narrow-port principle.
- **Feature-port scope superseded:** ADR-008's `IconPort` + the chat/MCP/canvas
  ports added after the original six (the six core ports remain).
- **Feature-surface decisions superseded (regrow per phase):** the MPS
  (multi-provider selection) and AUX (agent-UX polish, incl. `IconPort`/`<SpIcon>`)
  agent-surface features, and the chat/transport/provider/MCP/onboarding/
  design-canvas/workflow decisions they rest on. Their decisions stay on record
  and regrow when their first consumer returns (ADR-008 "one port per consumer").

> No standalone `ADR-MPS-*` / `ADR-AUX-*` files exist under `docs/adr/`; those
> decisions live as the numbered/feature ADRs below (and as `ADR-MPS-*`/`ADR-AUX-*`
> references in code/specs). Per OC-PSR-3, the per-file `superseded-by` pointer is
> added to the explicitly-named **ADR-008**; the broader feature-surface
> supersession is recorded here rather than by editing each accepted ADR's
> frontmatter (their non-feature parts may survive). Flagged to the maintainer at
> the P0 checkpoint.

## Index

| ID | Decision | P0 reboot scope |
|---|---|---|
| ADR-001 | DDD layered architecture | Kept |
| ADR-002 | `IBridge` abstraction | Superseded by ADR-008 |
| ADR-003 | Vue 3 Composition API + hash router | Kept (router regrows if needed) |
| ADR-004 | `Result` discriminated union | Kept |
| ADR-005 | agentic-workflow vault structure | Feature surface — regrows per phase |
| ADR-006 | Obsidian API + vault write safety | Cross-cutting — see file |
| ADR-007 | Agent runtime boundary | Feature surface — regrows per phase |
| ADR-008 | Narrow ports supersede `IBridge` | Core ports kept; feature ports superseded by ADR-PSR-001 |
| ADR-009 | Test conventions | Kept |
| ADR-010 | Module system + `defineModule` | Kept |
| ADR-011 | Typed `EventBus` envelope | Kept |
| ADR-012 | `PluginCore` lifecycle | Kept |
| ADR-013 | Obsidian MCP server | Feature surface — regrows (P6) |
| ADR-014 | Claude CLI port as a narrow port | Feature surface — regrows (P1) |
| ADR-015 | Onboarding wizard as a router route | Feature surface — regrows |
| ADR-016 | Plugin-settings onboarding fields (additive) | Feature surface — regrows |
| ADR-017 | Build system-prompt interface contract | Feature surface — regrows (P1) |
| ADR-018 | MCP tools backed by Obsidian CLI | Feature surface — regrows (P6) |
| 0027 | Claude CLI context as a single user turn | Feature surface — regrows (P1) |
| 0028 | API-key field outside the module settings loop | Feature surface — regrows |
| 0029 | Transport split: subscription vs API key | Feature surface — regrows (P1/P5) |
| 0030 | `IFeatureService` interface for DI | Feature surface — regrows |
| 0030 | Structured JSON output via JSON schema | Feature surface — regrows |
| 0031 | Session-id persistence location | Feature surface — regrows (P2) |
| 0032 | File-write proposal envelope schema | Feature surface — regrows (P4) |
| 0033 | Workflow-state codec seam | Feature surface — regrows |
| 0034 | Stream-delta reducer | Feature surface — regrows (P1) |
| ADR-PSR-001 | Reboot the plugin shell (P0) | **Accepted** — this reboot |
| ADR-PSR-002 | Settings storage: device-local, load-or-default | **Accepted** — P0 |
| ADR-CC-001 | ChatRuntime port shape (async-generator `query` + per-phase setter growth) | **Proposed** — P1 (pending human sign-off, charter §6a) |
| ADR-RR-001 | Rich block model + render seam (typed `toolUseResult`, per-type block components, Obsidian-backed markdown, `IconPort`) | **Proposed** — P2 (pending human sign-off, charter §6a) |

> Two files share the number `0030` (`ifeatureservice-interface-for-di` and
> `structured-json-output-via-json-schema`) — a pre-existing numbering collision,
> noted here for the eventual renumber; out of P0 scope.
