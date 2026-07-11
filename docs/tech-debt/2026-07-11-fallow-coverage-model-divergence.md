---
type: tech-debt
title: "Fallow CRAP metrics silently switch coverage models (local vs CI divergence)"
date: 2026-07-11
status: open
priority: "2 - medium"
scope: build-ci/quality-gates
tags:
  - tech-debt
  - build-ci
  - fallow
  - quality-gates
---

# Fallow CRAP metrics silently switch coverage models

## Summary

Fallow's complexity metrics (`complexFunctions`, `criticalComplexity`) are
CRAP-based, and CRAP folds in test coverage. Fallow picks its coverage model
from the environment it happens to find:

- **`istanbul`** — used when a gitignored `coverage/` directory exists in the
  repo root (e.g. right after `npm run test:coverage`). Fallow reads the real
  Istanbul coverage report.
- **`static_estimated`** — used when no `coverage/` directory is present (a
  clean checkout, or after `rm -rf coverage`). Fallow estimates coverage
  statically.

The switch is silent — nothing in `check:quality` output announces which model
produced the numbers — so the same working tree yields **different** gated
metrics depending on incidental local state.

## Impact — the PR #483 incident

The `quality` CI job runs on a clean checkout (no `coverage/`), so it always
measures under `static_estimated`. A contributor who had just run
`npm run test:coverage` measured under `istanbul` and saw
`complexFunctions=76, criticalComplexity=0`; CI (and any cache-free local run)
measured `complexFunctions=231, criticalComplexity=1` on the same code. Pinning
the baseline to the low local numbers would have made CI fail immediately with
an apparent "regression" that is really just a model mismatch. (The baseline was
subsequently pinned to the fresh-environment measurement and later tightened to
`230/1` as the ACP runtime shed complexity.)

## Remediation

The reliable rule is: **always measure and update the baseline from a cache-free
state that matches CI.**

```bash
rm -rf coverage .fallow && npm run check:quality            # measure / gate
rm -rf coverage .fallow && npm run check:quality -- --update # lock a gain
```

Two durable options, either of which removes the footgun:

1. **Pin the coverage model in `.fallowrc.json`** so fallow always uses one
   model (`static_estimated`, to match CI) regardless of whether `coverage/`
   exists. Preferred if fallow exposes a config knob for the coverage source.
2. **Make `check:quality` ignore local coverage** — have
   `scripts/check-quality.mjs` clear or hide `coverage/` before invoking fallow
   (e.g. run fallow in a temp cwd, or delete `.fallow/` + `coverage/` first),
   so the gate is deterministic no matter what the developer ran beforehand.

Until one lands, the cache-free invocation above is the workaround, and it is
documented next to the `check:quality` gate in
[`docs/build-ci/quality-gates.md`](../build-ci/quality-gates.md).
