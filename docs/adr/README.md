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
| ADR-RR-001 | Rich block model + render seam (typed `toolUseResult`, per-type block components, Obsidian-backed markdown, `IconPort`) | **Accepted** — P2 (§3 sync markdown backing superseded by ADR-RR-002; §1/§2/§4 in force) |
| ADR-RR-002 | Async `MarkdownRenderPort.render` backed by Obsidian's real `MarkdownRenderer`, walked to the unchanged `SafeRenderResult` DTO | **Accepted** — P2 (human-directed; supersedes ADR-RR-001 §3) |
| ADR-TS-001 | Persist conversation history to vault files behind a narrow `ProviderHistoryPort` (fork = derive-not-copy; `HomeFsPort` deferred to P9) | **Accepted** — P3 (autonomous-drive; resolves CLAR-TS-001/003) |
| ADR-TS-002 | Generalise the single-thread store to an N-tab `tabsStore`; grow `ChatRuntimePort` additively for resume/rewind/fork; router stays removed | **Accepted** — P3 (autonomous-drive; resolves CLAR-TS-002 + CLAR-TS-003 runtime half) |
| ADR-TS-003 | Generate titles via a cold-start side-query on `ChatRuntimePort.query` behind a `GenerateTitleUseCase`; `AuxModelPort` deferred to P4/P5 | **Accepted** — P3 (autonomous-drive; resolves CLAR-TS-004) |
| ADR-TS-004 | Gate conversation-rewind execution off the subprocess CLI transport (`supportsRewind: false`); true rewind-to-turn (`resumeSessionAt`) is an Agent-SDK-transport capability deferred to a later phase | **Accepted** — P3 (autonomous-drive; resolves R-TS-002) |
| ADR-CP-001 | Composer-mode state machine via `useComposerMode` (discriminated `ComposerMode` union + pure trigger-parse) over an additively-extended `ChatComposer`; P1 send path gated behind `kind === 'default'` | **Accepted** — P4 (autonomous-drive; resolves CLAR-CP-001) |
| ADR-CP-002 | Three composer-power narrow ports: `MentionDataProviderPort` (VaultPort + catalog), `ProviderCommandCatalogPort` (request-id guarded; built-ins as a pure app list), and the security-bounded `ShellExecPort` (sole shell path, S1–S5 posture, browser-unavailable degrade) | **Accepted** — P4 (autonomous-drive; resolves CLAR-CP-002) |
| ADR-CP-003 | Instruction-refine via a second cold-start side-query over `ChatRuntimePort.query` behind a `RefineInstructionUseCase` (reuse the ADR-TS-003 pattern); `AuxModelPort` deferral re-confirmed to P5 | **Accepted** — P4 (autonomous-drive; resolves CLAR-CP-003) |
| ADR-CP-004 | Route inline-block responses via three additive `ChatRuntimePort` callback-setters (`setAskUserQuestionCallback`/`setExitPlanModeCallback`/`setApprovalCallback`) + two additive `RuntimeCapabilities` flags (`supportsPlanMode`/`supportsInlineResponse`) capability-gating what `claude --print` cannot carry; approval rules/persistence stay P7 | **Accepted** — P4 (autonomous-drive; resolves CLAR-CP-004) |
| ADR-CA-001 | Attach file/image/selection context by regrowing the reserved `ChatTurnRequest` fields additively; image transport is bounded base64-inline read+encoded via an additive `VaultPort.readBinary` (no `AttachmentPort`); 8 MiB limit + image MIME allow-list, no secret, no `data.json` | **Accepted** — P5 (autonomous-drive; resolves CLAR-CA-001) |
| ADR-CA-002 | Extract a narrow `AuxModelPort` (`run(prompt, {systemPrompt?, model?, signal?}) → Result<string>`) for one-shot cold-start aux queries, delegating to the runtime's cold-start `query`; re-point `GenerateTitleUseCase` (P3) + `RefineInstructionUseCase` (P4) onto it; `InlineEditUseCase` is the third consumer | **Accepted** — P5 (autonomous-drive; resolves CLAR-CA-004 port half; realises the ADR-TS-003/CP-003 deferral) |
| ADR-CA-003 | Capture editor + canvas selection behind a `SelectionSourcePort` (union DTO) + a `SelectionHighlightPort`; ship those two sources; capability-gate the browser leg on `supportsBrowserSelection` (ADR-TS-004 honesty) — render the affordance only where available, never silently drop | **Accepted** — P5 (autonomous-drive; resolves CLAR-CA-002) |
| ADR-CA-004 | Run inline edit through an `OpenInlineEditFn` modal seam over a cold-start `AuxModelPort` query, parsed by a pure `parseInlineEditResponse`; preview via a NEW pure word-level diff (`computeWordDiff` → `DiffLine[]`) fed to the UNCHANGED `DiffView` renderer (reuse the renderer, not line-level `computeDiff`); no new dep | **Accepted** — P5 (autonomous-drive; resolves CLAR-CA-003 + CLAR-CA-004 diff half) |
| ADR-TC-001 | Mount the toolbar control strip as an additive `ChatComposer` region (mirroring the P5 context bar); control state is per-tab via an additive `TabControls` bag on `TabState`; the fold happens on submit in `buildTurnRequest` | **Accepted** — P6 (autonomous-drive; resolves CLAR-TC-003) |
| ADR-TC-002 | Thread the backed widgets via one additive `ChatRuntimeQueryOptions` field each (`mode?`, `reasoning?` as a discriminated effort/budget `ReasoningChoice`, `serviceTier?` declared-now/emitted-P9); a pure guarded `foldControlOptions` writes only non-default values so a no-interaction turn stays byte-identical (P0–P5 members unchanged) | **Accepted** — P6 (autonomous-drive; resolves CLAR-TC-001) |
| ADR-TC-003 | Gate widget visibility/enablement on capability flags (`RuntimeCapabilities` + an additive `getToolbarCapabilities` on the existing `ChatRuntimePort` seam) + catalog descriptors, never a `providerId` branch; seam widgets defer honestly (service-tier/MCP capability-hidden; permission/external/MCP-empty visible-disabled "coming later") | **Accepted** — P6 (autonomous-drive; realises REQ-TC-003 + the honest-defer counter-metric) |
| ADR-TC-004 | Source the toolbar option lists/descriptors from a NEW narrow `ToolbarCatalogPort` (`getCatalog(providerId)`, Claude static-for-now, three bridges + scriptable Mock); render the external-context control as a visible-but-disabled seam (`externalContextPaths` stays excluded, no electron in Vue, `FilePickerPort` deferred) | **Accepted** — P6 (autonomous-drive; resolves CLAR-TC-002) |
| ADR-AS-001 | Persist approval rules through a narrow `ApprovalRuleStorePort` (load/add/remove/clear, `Result`-typed) to a device-local store (`app.saveLocalStorage`, mirroring ADR-PSR-002 — never `data.json`, never a vault file, no migration); rule DTO = `{ id, toolName, actionPattern?, decision allow\|deny, lifetime session\|persisted }`; the Claudian `matchesRulePattern`/`getActionPattern`/`getActionDescription` semantics regrow as a PURE domain matcher; three-bridge backing | **Accepted** — P7 (autonomous-drive; ratifies CLAR-AS-001 + CLAR-AS-003 session/persisted half) |
| ADR-AS-002 | Thread the live three-mode permission value (`normal\|plan\|yolo`) via one additive `ChatRuntimeQueryOptions.permissionMode?` + a per-tab `TabControls.permissionMode?` folded by the P6 `foldControlOptions` (guarded — non-`normal` only, byte-identical default); widen the P6 `ToolbarCapabilities.permissionMode` to the live three-mode value; keep the SDK-string mapping (`yolo`↔`bypassPermissions`/`plan`↔`plan`/`normal`↔`default`) + the plan-exit `setMode` session sync in the Claude runtime — no `providerId` branch | **Accepted** — P7 (autonomous-drive; ratifies CLAR-AS-002 + CLAR-AS-003 per-tab-mode half) |
| ADR-AS-003 | Compose the approval decision flow as an application `ApprovalManager` use case over the narrow ports (mode gate → pure matcher over `ApprovalRuleStorePort` + in-memory session rules → auto-decide OR the UNCHANGED P4 inline prompt → `*-always` persists a rule); deny-wins + mode-gate-first (CLAR-AS-004); fail-safe-to-prompt on store error; additive `'deny-always'` on the P4 `ApprovalDecision`; `decisionReason`/`blockedPath` via the existing P4 `ApprovalRequest.context` (CLAR-AS-005); no-rules/`normal` default = byte-identical P4 | **Accepted** — P7 (autonomous-drive; ratifies CLAR-AS-004 + CLAR-AS-005) |
| ADR-MC-001 | Persist the MCP server list to the VAULT file `.claude/mcp.json` (the Claude-CLI-readable path + `_claudian` metadata sidecar) behind a narrow `McpConfigStorePort` (load/save/exists, `Result`-typed, default-pruning round-trip) with a PURE `McpConfigParser` (the four paste formats → `Result`); consciously diverges from the device-local ADR-PSR-002/ADR-AS-001 calls because the CLI must read it; no migration; no plaintext-secret duplication (`SecretStorePort` editor deferred) | **Accepted** — P8 (autonomous-drive; ratifies CLAR-MC-001 + CLAR-MC-002) |
| ADR-MC-002 | Expose the MCP transport behind a narrow `McpClientPort` (isAvailable/test/connect/listTools/callTool/disconnect, structured-result/`Result`-typed, never throws); the real stdio (bounded explicit spawn, `ShellExecPort` posture) / SSE / HTTP transports live in coverage-excluded `src/infrastructure/obsidian/**` over `@modelcontextprotocol/sdk` (a new runtime dep, bundled + externalized like `@codemirror/*`, rationale recorded per AGENTS.md §8, never reaching `build:web`); Mock scriptable + LS inert | **Accepted** — P8 (autonomous-drive; ratifies CLAR-MC-003) |
| ADR-MC-003 | Thread enabled MCP servers to a turn via an additive `ChatRuntimeQueryOptions.enabledMcpServers?` (the EXCLUDED field, folded only when non-empty so a no-servers turn is byte-identical to P7) computed by a `McpServerManager` application use case (lifecycle + pure `getActiveServers`/disallowed-tools fold, empty mention-set default); the P6 selector lists + toggles the enabled servers + count badge; an MCP tool call routes through the UNCHANGED tool-agnostic P7 `ApprovalManager` gate (not auto-trusted); no `providerId` branch | **Accepted** — P8 (autonomous-drive; ratifies CLAR-MC-005) |
| ADR-PV-001 | Route the active provider through a data-driven `ProviderRegistryPort` (list/enable/order/resolve over frozen `ProviderDescriptor`s + the frozen capability bag) and the existing `ChatRuntimePort`/`ProviderHistoryPort`/`ToolbarCatalogPort` seams parameterised by provider (the per-tab `CHAT_RUNTIME_FACTORY` widens to `(providerId) => Result<ChatRuntimePort>`); capability-flag-gated UI, NEVER a `switch(providerId)`; additive — Claude-only = byte-identical P8; routed-aux stays Claude in P9 | **Accepted** — P9 (autonomous-drive; ratifies CLAR-PV-001/005/007) |
| ADR-PV-002 | Store provider secrets in Obsidian native secret storage (`app.secretStorage`) behind a narrow `Result`-typed `SecretStorePort` (`isAvailable`/`get`/`set`/`delete`/`listKeys`), read only at the infra boundary into the subprocess env — NEVER `data.json`/device-local/notice/log/store/DTO; in-memory on Mock/LS; capability-gate when unavailable (no plain-store fallback); `minAppVersion` check escalated-not-bumped | **Accepted** — P9 (autonomous-drive; ratifies CLAR-PV-003/004/006) |
| ADR-PV-003 | Read `~/.codex`/`~/.claude` transcripts through a read-first, root-scoped, consented `HomeFsPort` (`Result`-typed, no write/delete in P9, one-time Obsidian-`Modal` consent, inert on demo bridges); history plugs into the UNCHANGED P3 `ProviderHistoryPort`; the Codex JSON-RPC + shared ACP transports live coverage-excluded behind the registry's runtime construction (timeout/abort/error-chunk, Mock scriptable), no new SDK dep (externalize like `@modelcontextprotocol/sdk` if ever needed) | **Accepted** — P9 (autonomous-drive; ratifies CLAR-PV-002 + the ACP/Codex transport note) |

> Two files share the number `0030` (`ifeatureservice-interface-for-di` and
> `structured-json-output-via-json-schema`) — a pre-existing numbering collision,
> noted here for the eventual renumber; out of P0 scope.
