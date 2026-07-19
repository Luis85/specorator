<!-- .claude/skills/project-setup/scripts/README.md -->
# project-setup engine

Deterministic setup engine. Node ≥22 (the pinned fallow 3 tooling is installed
on every apply); Obsidian mode needs `^22.13.0 || >=24.0.0` (the pinned jsdom
skips the 23.x line). `apply` refuses on an unsupported host Node. Zero runtime
deps.

Dependency versions are exact pins in `pins.json` (loaded by `lib/harness.mjs`
as `PINNED`); `refresh-pins` is the only sanctioned way to bump them.

## Commands

    node setup.mjs detect                  # print project-state JSON
    node setup.mjs plan   --config a.json  # print the action plan (no mutation)
    node setup.mjs apply  --config a.json  # apply idempotently (--dry-run to preview)
    node setup.mjs report                  # write the advisory quality report
    node setup.mjs verify --config a.json  # run the enabled gates once
    node setup.mjs refresh-pins            # update pins.json to latest releases (network)

## Tests

    node --test tests/*.test.js

All tests are `node:test` specs operating on temp-dir fixtures — no network,
no global state.
