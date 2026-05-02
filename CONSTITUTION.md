# Specorator — Repository Constitution

This document is the working agreement for everyone contributing to this repository: human collaborators and AI agents alike. It captures the values, constraints, and non-negotiables that govern how we work, decide, and ship.

---

## 1. What we are building

Specorator is an Obsidian plugin that helps users run the [agentic-workflow](https://github.com/Luis85/agentic-workflow) methodology from inside their vault. v1 delivers installation, navigation, and scaffolding. v2.0 layers in `agentonomous`-powered agent coworkers.

The plugin must feel like a capable helping hand — never a gatekeeper and never a black box.

---

## 2. User control is inviolable

- The user's vault is their property. The plugin must never silently overwrite, delete, or rename vault files.
- Agent suggestions and plugin-generated content are proposals until the user accepts them.
- Every write to the vault must go through the `IBridge` interface, never around it.
- Overwrite protection (REQ-AVS-005) is not a preference; it is a hard constraint.

---

## 3. Spec-first development gate

No Phase 4 feature implementation may begin without:

1. A `specs/{slug}/idea.md` accepted by the PM role.
2. A `specs/{slug}/workflow-state.md` at the correct stage.
3. Requirements written and accepted (or an explicit PM sign-off to proceed from idea directly).

This gate exists so the plugin itself is a live example of the methodology it supports.

---

## 4. Architecture is intentional

- **DDD layered imports:** `domain ← application ← infrastructure ← ui`. Never import upward.
- **IBridge boundary:** All Obsidian API access goes through `IBridge`. Vue components never import `obsidian` directly.
- **Result type:** Domain mutations return `Result<T,E>`, never throw. Check `.ok` before accessing `.value`.
- **Pinia stores hold DTOs only.** Domain class instances must not cross the store boundary.

Violations of these rules are bugs, not style preferences. ESLint enforces the import rules.

---

## 5. Branching model

| Branch | Purpose |
|---|---|
| `develop` | Integration branch. All feature branches cut from and merged back here. |
| `demo` | Preview branch. GitHub Pages deploys from here. |
| `main` | Stable release gate. Only merges from `develop`; triggers plugin release. |

Feature branch naming: `<type>/<description>` (e.g. `feature/workflow-nav-ui`, `fix/slug-validation-crash`). Cut from `develop`. Open PRs targeting `develop`.

To publish a preview: PR from `develop` to `demo`.
To cut a release: PR from `develop` to `main`, merge, then tag `main` HEAD with `vX.Y.Z`.

---

## 6. Decisions are documented

Significant architectural and process decisions are recorded as ADRs in `docs/adr/`. Day-to-day decisions and rationale are captured in `decisions/`. A decision that lives only in a PR comment or chat thread is not durable.

Accepted ADRs are binding unless superseded by a newer ADR.

---

## 7. Quality gate is non-negotiable

Before merging to `develop`:

```sh
npm run typecheck && npm run lint && npm run test && npm run build && npm run build:web && npm run docs:api
```

All steps must pass. CI enforces this. Do not merge a PR with a failing gate.

---

## 8. All vault files stay portable

Generated artifacts are plain Markdown with YAML frontmatter. They must be readable and useful without the plugin installed. No plugin-private binary state.

---

## 9. v2.0 extension points are preserved

v1 must not make design choices that block `agentonomous` integration in v2.0. The typed `IAgentBridge` stub and the UI placeholder are deliberate seams. Do not collapse them.

---

## 10. This document evolves

Amendments are proposed as PRs targeting `develop`. Significant changes require a supporting decision note in `decisions/`. The goal is a living agreement, not a frozen policy.
