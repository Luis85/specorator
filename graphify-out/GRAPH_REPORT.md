# Graph Report - .  (2026-05-10)

## Corpus Check
- Large corpus: 246 files · ~184,052 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 891 nodes · 1387 edges · 69 communities (48 shown, 21 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 63 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Feature Use Cases & Composables|Feature Use Cases & Composables]]
- [[_COMMUNITY_Narrow Port Interfaces|Narrow Port Interfaces]]
- [[_COMMUNITY_Claude CLI Chat Sidebar|Claude CLI Chat Sidebar]]
- [[_COMMUNITY_Plugin Core & Module Bootstrap|Plugin Core & Module Bootstrap]]
- [[_COMMUNITY_Agent Orchestrator & Core Types|Agent Orchestrator & Core Types]]
- [[_COMMUNITY_Agentic Workflow Concepts|Agentic Workflow Concepts]]
- [[_COMMUNITY_Architecture Decision Records|Architecture Decision Records]]
- [[_COMMUNITY_Feature Repository & Vault IO|Feature Repository & Vault I/O]]
- [[_COMMUNITY_Architecture Components|Architecture Components]]
- [[_COMMUNITY_Module System & Settings|Module System & Settings]]
- [[_COMMUNITY_Mock Canvas Adapter|Mock Canvas Adapter]]
- [[_COMMUNITY_UI Design Artboards|UI Design Artboards]]
- [[_COMMUNITY_Mock Bridge Adapter|Mock Bridge Adapter]]
- [[_COMMUNITY_Human Authority & Governance|Human Authority & Governance]]
- [[_COMMUNITY_Obsidian Bridge Adapter|Obsidian Bridge Adapter]]
- [[_COMMUNITY_Fixtures & Site Config|Fixtures & Site Config]]
- [[_COMMUNITY_LocalStorage Bridge Adapter|LocalStorage Bridge Adapter]]
- [[_COMMUNITY_Module System Concepts|Module System Concepts]]
- [[_COMMUNITY_Design Canvas Components|Design Canvas Components]]
- [[_COMMUNITY_Mock Metadata Cache Adapter|Mock Metadata Cache Adapter]]
- [[_COMMUNITY_Obsidian MCP Server Adapter|Obsidian MCP Server Adapter]]
- [[_COMMUNITY_Product Vision & Roadmap Docs|Product Vision & Roadmap Docs]]
- [[_COMMUNITY_Test Conventions Plans|Test Conventions Plans]]
- [[_COMMUNITY_Error Logging & Notification|Error Logging & Notification]]
- [[_COMMUNITY_PRD & Product Requirements|PRD & Product Requirements]]
- [[_COMMUNITY_Vite Build Configuration|Vite Build Configuration]]
- [[_COMMUNITY_Workspace & Metadata Ports|Workspace & Metadata Ports]]
- [[_COMMUNITY_Obsidian Plugin Lifecycle|Obsidian Plugin Lifecycle]]
- [[_COMMUNITY_Release & Supply Chain|Release & Supply Chain]]
- [[_COMMUNITY_Project Kickoff & Roadmap|Project Kickoff & Roadmap]]
- [[_COMMUNITY_Overwrite Safety & Vault Schema|Overwrite Safety & Vault Schema]]
- [[_COMMUNITY_ESLint Configuration|ESLint Configuration]]
- [[_COMMUNITY_Verification Gate Hardening|Verification Gate Hardening]]
- [[_COMMUNITY_Feature Card UI Components|Feature Card UI Components]]
- [[_COMMUNITY_Version Bump Tooling|Version Bump Tooling]]
- [[_COMMUNITY_Vitest Configuration|Vitest Configuration]]
- [[_COMMUNITY_Canvas Port Interface|Canvas Port Interface]]
- [[_COMMUNITY_MCP Server Port Interface|MCP Server Port Interface]]
- [[_COMMUNITY_Notification Store|Notification Store]]
- [[_COMMUNITY_Graphify Integration Requirement|Graphify Integration Requirement]]
- [[_COMMUNITY_VaultPort Interface|VaultPort Interface]]
- [[_COMMUNITY_LoggerPort Interface|LoggerPort Interface]]
- [[_COMMUNITY_NotificationPort Interface|NotificationPort Interface]]
- [[_COMMUNITY_TranslationPort Interface|TranslationPort Interface]]
- [[_COMMUNITY_Product Page Target|Product Page Target]]
- [[_COMMUNITY_W12 Scaffold Polish|W12 Scaffold Polish]]
- [[_COMMUNITY_Security Policy|Security Policy]]
- [[_COMMUNITY_Label Taxonomy|Label Taxonomy]]
- [[_COMMUNITY_Storybook W9 Plan|Storybook W9 Plan]]
- [[_COMMUNITY_User Flow Issue Plan|User Flow Issue Plan]]

## God Nodes (most connected - your core abstractions)
1. `MockBridge` - 28 edges
2. `err()` - 27 edges
3. `Feature` - 26 edges
4. `ObsidianBridge` - 26 edges
5. `LocalStorageBridge` - 22 edges
6. `Specorator Glossary Index` - 21 edges
7. `tryAsync()` - 17 edges
8. `Result` - 14 edges
9. `H-ACD Product Philosophy` - 14 edges
10. `trySync()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `Astro site config (specorator GitHub Pages)` --conceptually_related_to--> `Workflow Adoption Guide (8-step project kickoff)`  [AMBIGUOUS]
  sites/specorator/astro.config.mjs → docs/workflow-adoption-guide.md
- `Spec-First Gate (Phase 4: idea.md + workflow-state.md + requirements before implementation)` --semantically_similar_to--> `Gate Review (quality checkpoint between workflow stages, configurable strictness)`  [INFERRED] [semantically similar]
  CONSTITUTION.md → docs/glossary.md
- `Requirements Traceability Index` --references--> `Spec: Agent Interaction Placeholder — Idea`  [INFERRED]
  docs/traceability.md → specs/agent-interaction-placeholder/idea.md
- `Malformed workflow-state fixture — invalid frontmatter for error path testing` --conceptually_related_to--> `workflow-state.md YAML frontmatter schema (agentic-workflow compatible)`  [INFERRED]
  src/infrastructure/workflow-state/__fixtures__/malformed-workflow-state.md → specs/agentic-workflow-vault-structure/design.md
- `Mirror layout convention — tests/ mirrors src/ path-for-path with .test.ts extension` --conceptually_related_to--> `Valid workflow-state fixture — dark-mode feature at research stage`  [INFERRED]
  specs/w10-test-conventions/design.md → src/infrastructure/workflow-state/__fixtures__/valid-workflow-state.md

## Hyperedges (group relationships)
- **Vault Write Safety Triad: narrow ports + VaultPath + overwrite protection together enforce safe vault mutation** —  [INFERRED 0.85]
- **Spec-First Development Flow: spec-first gate + vault structure + agentic-workflow methodology together govern Phase 4 feature development** —  [EXTRACTED 1.00]
- **Runtime-Ports Triad: bridge implementations + narrow ports + DDD layered architecture together decouple Obsidian from domain and UI** —  [INFERRED 0.95]
- **hyperedge_h_acd_governance_triad** — glossary_h_acd, glossary_hitl, glossary_hotl, glossary_human_authority [EXTRACTED 1.00]
- **hyperedge_adlc_pipeline_fleet** — glossary_adlc, glossary_gate, glossary_fleet_dashboard [EXTRACTED 1.00]
- **hyperedge_mcp_accept_reject_flow** — glossary_mcp_server, glossary_accepted_output, glossary_chat_sidebar [EXTRACTED 1.00]
- **H-ACD Four Principles** — glossary_workflow_encapsulation, concept_human_authority, concept_intent_first, glossary_vault_as_operating_environment [EXTRACTED 1.00]
- **Narrow Port Implementations** — concept_obsidian_bridge, concept_mock_bridge, concept_local_storage_bridge [EXTRACTED 1.00]
- **Session Log + Traceability Audit Chain** — glossary_session_log, glossary_traceability_chain, concept_workflow_state_md [EXTRACTED 1.00]
- **v1 Alpha Delivery Gate — PRD + Roadmap + Phases converge on feature delivery** —  [INFERRED 0.90]
- **Supply-chain hardening — three automated controls form a unified gate** —  [EXTRACTED 1.00]
- **Error handling ecosystem — NotificationPort + FeedbackService + ErrorBoundary form a unified surface** —  [INFERRED 0.95]
- **AVS spec pipeline (idea → requirements → design → spec → tasks)** —  [EXTRACTED 1.00]
- **Narrow ports family (MetadataCachePort, CanvasPort, WorkspacePort extensions all share Unsubscriber)** —  [EXTRACTED 1.00]
- **SAO depends on ClaudeCliPort (from claude-cli-chat-sidebar) + WorktreePort + OrchestratorPort** —  [EXTRACTED 1.00]
- **Narrow ports (SettingsPort, VaultPort, WorkspacePort, NotificationPort, LoggerPort) implemented by ObsidianBridge, MockBridge, and LocalStorageBridge** — arch_c3_port_layer, arch_c4_bridge_adapters, w1_adr008 [EXTRACTED 1.00]
- **SAO requires ClaudeCliPort (from CCS) and WorktreePort for isolated agent dispatch** — sao_design, ccs_claude_cli_port, sao_worktree_port [EXTRACTED 1.00]
- **Onboarding wizard integrates ClaudeCliPort availability check and template installation service** — pob_idea, ccs_claude_cli_port, tis_idea [EXTRACTED 1.00]
- **Narrow ports implemented by all three runtime adapters** —  [EXTRACTED 1.00]
- **fakeModulePorts factory bridges W10 test conventions with W1 narrow ports via MockBridge** —  [EXTRACTED 1.00]
- **Valid and malformed workflow-state fixtures test parsing of ADR-005 schema** —  [INFERRED 0.85]

## Communities (69 total, 21 thin omitted)

### Community 0 - "Feature Use Cases & Composables"
Cohesion: 0.05
Nodes (32): useFeatures(), useVaultPort(), ActivateFeatureInput, ActivateFeatureUseCase, AdvanceFeatureStageInput, AdvanceFeatureStageUseCase, ArchiveFeatureInput, ArchiveFeatureUseCase (+24 more)

### Community 1 - "Narrow Port Interfaces"
Cohesion: 0.05
Nodes (40): CANVAS_PORT, LOGGER_PORT, METADATA_CACHE_PORT, NOTIFICATION_PORT, SETTINGS_PORT, VAULT_PORT, WORKSPACE_PORT, useNotificationPort() (+32 more)

### Community 2 - "Claude CLI Chat Sidebar"
Cohesion: 0.05
Nodes (58): C3 — Port layer capability, ClaudeCliPort, Five-layer context assembly (buildSystemPrompt), Claude CLI Chat Sidebar — Idea, Write-operation proposal review card, Claude CLI Chat Sidebar — Workflow State, Plugin Onboarding Flow — Idea (IDEA-POB-001), onboardingComplete PluginSettings flag (+50 more)

### Community 3 - "Plugin Core & Module Bootstrap"
Cohesion: 0.06
Nodes (33): applyModuleMessages(), bootstrapModules(), BootstrappedModules, runDestroy(), EventMap, CorePorts, migrateSettings(), PluginCore (+25 more)

### Community 4 - "Agent Orchestrator & Core Types"
Cohesion: 0.07
Nodes (39): AgentOrchestrator, bootstrapModules() provisional helper, CanvasPort, ClaudeAgentRunner, Core EventMap (core:module-degraded, core:init-complete, core:destroy-complete), CorePorts, defineModule() factory, ESLint cross-module import ban (+31 more)

### Community 5 - "Agentic Workflow Concepts"
Cohesion: 0.1
Nodes (38): ADR-006 — Centralize Obsidian API and Vault Write Safety, ADR-007 — Defer Live Agent Runtime Behind a Review Boundary, ADLC (Agentic Development Lifecycle), Agent Review Boundary (v1 defers live agent runtime; proposed outputs require user acceptance), agentic-workflow methodology, agentonomous — Agent Orchestration Engine (v2.0, Luis85/agentonomous), Fleet Dashboard, H-ACD (Human-Agent Centered Design) (+30 more)

### Community 6 - "Architecture Decision Records"
Cohesion: 0.11
Nodes (37): ADR-001 — DDD Layered Architecture with Enforced Import Direction, ADR-002 — IBridge Abstraction (superseded by ADR-008), ADR-003 — Vue 3 Composition API (script setup) and Hash-Mode Router, ADR-004 — Result<T,E> Discriminated Union for Explicit Error Handling, ADR-005 — Align Vault Structure with agentic-workflow Conventions, ADR-008 — Narrow Ports Replace IBridge Aggregate, ADR-009 — Test Conventions (Mirror Layout, Fake-Ports, PageObject), AGENTS.md — Specorator Agent Operating Manual (+29 more)

### Community 7 - "Feature Repository & Vault I/O"
Cohesion: 0.11
Nodes (18): buildStageStub(), FeatureRepository, FEATURE_STATUSES, FeatureStatus, isFeatureStatus(), FEATURE_STEPS, FeatureStepMeta, FeatureStepSlug (+10 more)

### Community 8 - "Architecture Components"
Cohesion: 0.07
Nodes (33): C1 — Repository baseline capability, C2 — Toolchain and build capability, C4 — Bridge adapters capability, C5 — Error and logger system capability, C6 — Test harness capability, C7 — Quality gate (npm run verify), C8 — Quality metrics pipeline, Plugin Architecture — Design (pre-feature harness spec) (+25 more)

### Community 9 - "Module System & Settings"
Cohesion: 0.1
Nodes (17): coreSettingsModule, VALID_GATE_STRICTNESS, VALID_LOG_LEVELS, EventMap, helloModule, HelloSettings, ALL_MODULES, defineModule() (+9 more)

### Community 10 - "Mock Canvas Adapter"
Cohesion: 0.06
Nodes (4): MockCanvasAdapter, MockObsidianMcpServerAdapter, ObsidianCanvasAdapter, ObsidianMetadataCacheAdapter

### Community 11 - "UI Design Artboards"
Cohesion: 0.07
Nodes (13): ALL_SECTIONS, App(), root, SEC_CORE_FLOWS, SEC_HELP, SEC_INTERACTIONS, SEC_PRODUCT, SEC_RATIONALE (+5 more)

### Community 13 - "Human Authority & Governance"
Cohesion: 0.22
Nodes (26): Acceptance as governance event, ClaudeCliPort v2 upgrade seam rationale, H-ACD four principles, MCP server native (in-process) rationale, Accepted output, Agentic Development Lifecycle (ADLC), Agentic coworker, agentic-workflow methodology (+18 more)

### Community 15 - "Fixtures & Site Config"
Cohesion: 0.11
Nodes (24): agentic-workflow template (external reference), Astro site config (specorator GitHub Pages), Malformed workflow-state fixture — invalid frontmatter for error path testing, Valid workflow-state fixture — dark-mode feature at research stage, obsidian-theme.css (light/dark token sets), Spec: Artifact Creation Scaffolding — Idea, Spec: Artifact Creation Scaffolding — Workflow State, Spec: Agentic-Workflow Vault Structure — Design (DESIGN-AVS-001) (+16 more)

### Community 17 - "Module System Concepts"
Cohesion: 0.13
Nodes (19): ADR-008 Narrow Ports, ClaudeCliPort, defineModule, EventBus, GitHub Pages Deployment, LocalStorageBridge, LoggerPort, MockBridge (+11 more)

### Community 18 - "Design Canvas Components"
Cohesion: 0.17
Nodes (3): DC, DCCtx, s

### Community 21 - "Product Vision & Roadmap Docs"
Cohesion: 0.18
Nodes (12): Fix agentonomous role from orchestration engine to agent capabilities provider, Ecosystem Product Vision Refinement Implementation Plan (2026-05-04), MetadataCachePort and CanvasPort new narrow ports, W13-D1 Narrow Ports Implementation Plan (2026-05-09), 12 workflow stages with plain-language labels for product page, Specorator Product Vision, Agentic Development Lifecycle (ADLC) — 12 stages with agent roles, ClaudeCliPort — v1 Claude CLI subprocess integration (+4 more)

### Community 22 - "Test Conventions Plans"
Cohesion: 0.22
Nodes (10): Coverage thresholds 80/70/80/80 enforced in verify gate, tests/__fakes__/fake-ports.ts — fakeModulePorts() factory, PageObject pattern with data-testid-only queries, W10 Test Conventions Implementation Plan (2026-05-03), bootstrapModules() helper — sequential init, reverse teardown, defineModule() factory and ModuleDescriptor type contract, hello-module demo wired end-to-end, W2 Module System Implementation Plan (2026-05-04) (+2 more)

### Community 23 - "Error Logging & Notification"
Cohesion: 0.22
Nodes (10): Frontend Implementation Review 2026-05-02, ErrorBoundary.vue — wraps RouterView, logs + notifies on component errors, Error Handling, Logging & Notification System Implementation Plan (2026-05-04), FeedbackService — application-layer side-effect emitter, NotificationPort severity-typed methods (showError/showWarning/showSuccess/showInfo), CreateFeatureForm clears input on failure (Finding 4), Global box-sizing reset leaks into Obsidian (Finding 6), Stage advancement missing from frontend (Finding 3) (+2 more)

### Community 24 - "PRD & Product Requirements"
Cohesion: 0.22
Nodes (9): Agent output proposal model — no silent vault writes, agentonomous as v2.0 orchestration dependency, Specorator Product Requirements Document, v2.0 PRD — Companion App with Agentic Coworkers, Specorator Product Page Content Brief, 4-component ecosystem table for product page (specorator-plugin, specorator-runtime, agentic-workflow, agentonomous), Obsidian as engine not product identity framing principle, REQ-XXXX intake file frontmatter convention (+1 more)

### Community 25 - "Vite Build Configuration"
Cohesion: 0.25
Nodes (3): alias, ALL_EXTERNALS, OBSIDIAN_EXTERNALS

### Community 26 - "Workspace & Metadata Ports"
Cohesion: 0.32
Nodes (5): FileMetadataSnapshot, MetadataCachePort, Unsubscriber, ActiveFileSnapshot, WorkspacePort

### Community 28 - "Release & Supply Chain"
Cohesion: 0.25
Nodes (8): Specorator Release Process Runbook, Semver discipline and minAppVersion policy, Release tag must be on main HEAD enforcement, versions.json contract and validate-manifest.js enforcement, Dependency review action on PRs (GPL license block + high advisory block), OpenSSF Scorecard weekly observability, Supply-chain hardening policy, GitHub Actions SHA pinning policy

### Community 29 - "Project Kickoff & Roadmap"
Cohesion: 0.29
Nodes (8): Phase 0–7 gate dependency chain, Pre-PR verification gate (npm run verify), Project Kickoff Guide, Phase 0 — Project Initiation, Phase 1 — Repository Foundation, Phase 2 — Product Setup Baseline, Phase 3 — Plugin Shell, Specorator v1 Alpha Delivery Roadmap

### Community 30 - "Overwrite Safety & Vault Schema"
Cohesion: 0.25
Nodes (8): v2 agent integration boundary ADR requirement, Vault path and overwrite safety centralization, WorkflowStateSchema versioned boundary recommendation, agentic-workflow template as v1 hard dependency, Overwrite protection requirement (V1-FR-012 to V1-FR-014), v1 Alpha PRD — Plugin Foundation, Pre-feature Architecture Readiness Review, Phase 4 — v1 Alpha Feature Delivery

### Community 31 - "ESLint Configuration"
Cohesion: 0.29
Nodes (6): DOMAIN_FORBIDDEN_IMPORTS, DOMAIN_FORBIDDEN_PATTERNS, MAX_LINES_OPTIONS, PORTS_BAN_PATTERN, tsconfigRootDir, UI_FORBIDDEN_PATTERNS

### Community 32 - "Verification Gate Hardening"
Cohesion: 0.4
Nodes (5): scripts/build-pages.js — cross-platform Pages build, .githooks/pre-push hook (typecheck + lint + validate:manifest), Verification Gate Hardening Implementation Plan (2026-05-03), scripts/verify-workflows.js — Node SHA-pin check, Verification Gate Hardening Design Spec (2026-05-03)

### Community 33 - "Feature Card UI Components"
Cohesion: 0.5
Nodes (3): completedSteps, isComplete, showProgress

### Community 39 - "Graphify Integration Requirement"
Cohesion: 0.67
Nodes (3): graphify upstream skill (safishamsi/graphify), REQ-0001 Graphify Integration Requirement, REQ-0000 Requirement Intake Template

## Ambiguous Edges - Review These
- `Workflow Adoption Guide (8-step project kickoff)` → `Astro site config (specorator GitHub Pages)`  [AMBIGUOUS]
  sites/specorator/astro.config.mjs · relation: conceptually_related_to

## Knowledge Gaps
- **202 isolated node(s):** `manifest`, `versions`, `OBSIDIAN_EXTERNALS`, `ALL_EXTERNALS`, `alias` (+197 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Workflow Adoption Guide (8-step project kickoff)` and `Astro site config (specorator GitHub Pages)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `MockBridge` connect `Mock Bridge Adapter` to `Narrow Port Interfaces`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `ObsidianBridge` connect `Obsidian Bridge Adapter` to `Narrow Port Interfaces`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `LocalStorageBridge` connect `LocalStorage Bridge Adapter` to `Narrow Port Interfaces`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `manifest`, `versions`, `OBSIDIAN_EXTERNALS` to the rest of the system?**
  _202 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Feature Use Cases & Composables` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Narrow Port Interfaces` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._