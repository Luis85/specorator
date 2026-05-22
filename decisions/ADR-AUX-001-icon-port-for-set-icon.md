---
id: ADR-AUX-001
title: Introduce a narrow IconPort for obsidian.setIcon
status: proposed
date: 2026-05-22
deciders:
  - architect
consulted:
  - ui-designer
  - ux-designer
informed:
  - planner
  - dev
supersedes: []
superseded-by: []
tags: [ui, ports, obsidian]
---

# ADR-AUX-001 — Introduce a narrow IconPort for `obsidian.setIcon`

## Status

Proposed.

## Context

The Agent Sidepanel UX Parity work (`specs/agent-ux-parity/`) standardises every interactive affordance on a Lucide icon delivered via Obsidian's `setIcon(el, name)` helper. Lucide is bundled with Obsidian, so reaching for it does not add a dependency — but `setIcon` is exported from the `obsidian` module and Vue components under `src/ui/` are forbidden from importing `obsidian` directly (CLAUDE.md "Vue components must never import `obsidian`", enforced by ESLint `no-restricted-imports`).

The new icon wrapper component (`<SpIcon>`, `specs/agent-ux-parity/design.md` §C.2.3) is mounted dozens of times across the agent surface. Every call site needs `setIcon`, but none of them is allowed to import it. We need a seam that:

1. Lives in the inward-only architecture (domain → application → infrastructure → UI).
2. Has a production implementation (Obsidian-backed) and at least two non-Obsidian implementations (mock for unit tests, localstorage for the GitHub Pages demo).
3. Matches the precedent already set by `ConfirmModalPort` and `MarkdownRenderPort` — narrow ports that exist *only* to give the UI safe access to an Obsidian-only API.

## Decision

We introduce a seventh narrow port, `IconPort`, in `src/domain/ports/IconPort.ts`:

```ts
export interface IconPort {
  setIcon(el: HTMLElement, name: string): void;
}
```

The port is implemented by all three runtime bridges:

- `ObsidianBridge.setIcon` delegates to `obsidian.setIcon(el, name)`.
- `MockBridge.setIcon` writes an `<svg><title>{name}</title></svg>` placeholder so component tests can assert on the icon name without booting Obsidian.
- `LocalStorageBridge.setIcon` uses the same placeholder so the GitHub Pages demo renders deterministically.

We add a single InjectionKey `ICON_PORT` in `src/infrastructure/bridge/ports.ts` and a composable `useIconPort()` in `src/ui/composables/useIconPort.ts`. `<SpIcon>` is the only call site that consumes the composable; every other component renders icons via `<SpIcon name="..." aria-label="..."/>`.

## Considered options

### Option A — `IconPort` (chosen)

- Pros: matches existing narrow-port precedent; no ESLint exception; testable; deterministic standalone-mode rendering; one seam for any future swap (e.g. shipping a local Lucide SVG bundle if we ever drop the Obsidian-bundled set).
- Cons: one more port to wire through three bridges; one more InjectionKey; one more composable.

### Option B — ESLint exception for `setIcon` inside `<SpIcon>`

- Pros: zero new infrastructure.
- Cons: opens a precedent for ad-hoc allowlist entries; breaks the standalone-mode demo (no Obsidian runtime to call); makes tests fragile (need real Obsidian DOM behaviour or a global stub).

### Option C — Inject a setter function via Vue `provide/inject` without a port

- Pros: lightweight.
- Cons: type-checking is weaker (no interface), no symmetry with the other ports, three bridges still need to define and provide the function, and we end up with effectively the same surface as a port without the contract benefits.

## Consequences

### Positive

- `src/ui/components/primitives/SpIcon.vue` consumes `useIconPort()` and stays Obsidian-free at the import level.
- Tests stub the port via `tests/__fakes__/fake-ports.ts` (extended to expose `iconPort`) and assert on `<title>` text without booting Obsidian.
- GitHub Pages demo renders meaningful icon placeholders even though `obsidian.setIcon` is unavailable.
- Missing-icon fallback (Part C §C.6 of the design) lives in `<SpIcon>` and works uniformly across all three bridges.

### Negative

- One more port surface to maintain (six → seven). Mitigated by the trivial signature (one method).
- Touches three bridge files; verify gate must run all three.

### Neutral

- Composable naming (`useIconPort`) matches the established `use{Port}Port` convention.

## Compliance

- ESLint `no-restricted-imports` continues to forbid `obsidian` under `src/ui/**`. The CI run catches any regression.
- A unit test under `tests/ui/components/primitives/SpIcon.test.ts` mounts `<SpIcon>` against the fake port and asserts that `setIcon` was called with the expected name; a second test asserts the missing-icon fallback renders `ariaLabel` text.
- The verify gate (`npm run verify`) covers typecheck + lint + tests + build, so any port wiring break is caught at PR time.

## References

- `specs/agent-ux-parity/idea.md` §B (Lucide via `setIcon`)
- `specs/agent-ux-parity/requirements.md` REQ-AUX-001, NFR-AUX-005
- `specs/agent-ux-parity/design.md` §C.2.1, §C.2.3
- `specs/agent-ux-parity/design-part-b-ui.md` §B.3, §B.8 Q5
- Precedent ports: `ConfirmModalPort`, `MarkdownRenderPort`
- CLAUDE.md — "Vue components must never import `obsidian` directly"

---

> **ADR bodies are immutable.** To change a decision, supersede it with a new ADR; only the predecessor's `status` and `superseded-by` pointer fields may be updated.
