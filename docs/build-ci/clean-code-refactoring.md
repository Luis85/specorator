---
title: "Clean code & refactoring guidelines"
date: 2026-06-28
status: active
scope: build-ci
---

# Clean code & refactoring guidelines

How we keep this codebase readable, navigable, and safe to change — for humans
and for agents. These are the practices the quality campaign (see the history in
[`quality-gates.md`](quality-gates.md)) has been applying run after run, written
down so they stop being tribal knowledge.

This guide is the **how**; [`quality-gates.md`](quality-gates.md) is the **what**
(which gate catches which regression). The starter "Clean code refactor" loop,
the refined **Refactorer** agent, and the clean-code work-order template all
point back here.

## The one rule everything else serves

**A refactor must not change observable behavior.** Inputs, outputs, side
effects, public contracts, and the test suite's green state are invariant. If a
change alters behavior, it is a feature or a fix — split it into its own commit
with its own tests. Never smuggle a behavior change inside a refactor; a reviewer
reading "refactor" will not look for one.

## Work in small, reversible steps

- One cohesive change per step. Extract one module, collapse one clone family,
  decompose one function — then verify, then commit. A 30-file "big bang" is
  unreviewable and unbisectable.
- Prefer **extract and consolidate** over **rewrite**. Moving code to a better
  home preserves its history and its hard-won edge cases; rewriting loses them.
- Run the gates after each meaningful step, not just at the end:

  ```bash
  npm run lint && npm run typecheck && npm run test && npm run build
  npm run check:loc && npm run check:quality
  ```

- Commit each verified checkpoint. The commit message says what moved and what
  the metrics did (e.g. `cloneGroups 40 -> 32`).

## Tests are the safety net — check it before the trapeze

- Before refactoring code whose tests are thin, **add characterization tests
  first**: tests that pin the current behavior so the refactor can't drift it.
- A behavior-preserving extraction should leave existing tests untouched and
  passing. If a test has to change, that is a signal the behavior moved — stop
  and confirm it was intentional.
- New pure modules extracted from a hotspot get a focused unit spec (this is how
  the campaign has treated every extraction — see `codexSessionPathMapping`,
  `AgentSubprocess`, `JsonRpcStdioClient`). Extraction turns previously
  hard-to-reach private logic into directly testable functions; take the win.

## Choosing what to extract

The gates surface candidates; judgment decides which to act on.

- **`npm run quality:health`** ranks complexity hotspots and refactor targets.
- **`npm run quality:dupes`** lists clone families.
- **`npm run check:loc`** flags oversized files; `scripts/loc-baseline.json`
  records each hotspot's planned split in its `reason`.

Good extraction seams are **self-contained**: they touch few instance fields, so
they become pure free functions taking parameters (the cleanest outcome) or a
small focused helper. Prefer, in order:

1. **Pure free functions** in a sibling module — no `this`, trivially testable.
   (e.g. the host⇆target path mapping pulled out of `CodexChatRuntime`.)
2. **A small coordinator/helper class** fed live callbacks by the parent, which
   keeps thin delegators — used when the logic owns real state but shouldn't
   bloat the parent. The parent passes accessors so there is **no import cycle**
   (see `TabProviderCommandCoordinator`, `InlinePromptController`).
3. **A private method**, when the block is irreducibly coupled to many instance
   fields and threading them all out would be worse than leaving it in place.

## When NOT to extract

Deduplication is not always an improvement. Leave a clone or a long function
alone when:

- The two copies are **superficially similar but semantically divergent** and a
  shared abstraction would need several config flags/hooks to paper over the
  differences (e.g. the BangBash vs Instruction mode managers — different
  empty-handling and error-handling on purpose). The abstraction would be harder
  to read than the duplication.
- The clone spans **zone boundaries** whose only shared home would be an awkward
  `core/`/`shared/` module that couples otherwise-independent providers. The
  fallow boundary zones (`.fallowrc.json`) exist to keep providers from importing
  each other; do not defeat them to save a few lines. Such clones are
  deliberately grandfathered in `scripts/quality-baseline.json`.
- Extracting would force many instance fields through free-function parameters,
  trading a readable method for an unreadable signature.

Record the rationale when you leave debt in place — a one-line `reason` in the
baseline, or a note in the PR. Silent debt reads as an oversight.

## Naming and comments

- Names describe intent at the call site. A function named for *what it
  accomplishes* (`syncToolTogglesToDisabledSet`) beats one named for *how*
  (`loopTools`).
- **Comment why, not what.** The code already says what it does. Comments earn
  their place by explaining a non-obvious decision, a wire-format quirk, or a
  boundary the next reader would otherwise trip over. Avoid narration and
  redundant JSDoc (root `CLAUDE.md`, Development Notes).
- Match the surrounding code — its naming, structure, comment density, and
  idioms. A refactor that introduces a new style is two changes wearing one hat.

## Respect the architecture seams

- Provider code talks to features only through `ChatRuntime` /
  `ProviderRegistry` / `ProviderWorkspaceRegistry`. Features never import
  provider internals. The fallow boundary zones enforce this at 0 violations.
- `core` / `shared` / `utils` / `i18n` stay leaf-ward — no imports from
  `features`, `providers`, or `app`.
- When an extraction would create an import cycle (a real risk when a parent and
  its new helper reference each other), break it by relocating the shared
  primitive into the leaf module, or by feeding the parent's state to the helper
  as callbacks rather than importing the parent.

## Ratchet discipline

The gates are a ratchet, not a freeze: every metric may improve freely but may
not regress past `scripts/quality-baseline.json` / `scripts/loc-baseline.json`.

- When a refactor improves a metric, **lock the gain in the same PR**:

  ```bash
  npm run check:quality -- --update      # rewrite quality baseline
  npm run check:loc -- --update          # rewrite LOC baseline (preserves reasons)
  ```

  Commit the baseline diff alongside the code so the gain can't silently
  regress. Run these with no `coverage/` directory present (it flips fallow into
  coverage-weighted mode and spikes the critical-complexity count) — see the
  run-9 note in `quality-gates.md`.
- The structural counters (`circularDependencies`, `reExportCycles`,
  `boundaryViolations`) and `criticalComplexity` are **0 and stay 0**. Treat any
  bump as an architecture decision (ADR territory), not a metric trade-off.
- A deliberate, reviewed regression (rare) bumps the baseline the same way, with
  the justification in the PR.

## A refactor checklist

Before opening the PR:

- [ ] Observable behavior is unchanged; no feature/fix smuggled in.
- [ ] Each step is a separate verified commit.
- [ ] Existing tests pass untouched; new pure modules have a focused spec.
- [ ] Extracted code lives in the right zone; no new boundary violation or cycle.
- [ ] Improved metrics are locked into the baselines in the same PR.
- [ ] Any debt left in place has a recorded reason.
- [ ] Names say intent; comments say why; style matches the surroundings.
