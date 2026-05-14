# Sidepanel design — May 2026

Source: design brief + interactive MVP mockup handed in by the product owner on 2026-05-14 along with the request to add **Claude subscription** (no-API-key) support to the existing Claude CLI chat sidebar.

## Files

- `Sidepanel_Design_Brief.html` — static design brief: principles, panel anatomy, key interactions (@ mention + Attach), Settings (autonomy + folder filter), in/out scope, design decisions table, open questions, increment roadmap.
- `Sidepanel_MVP.html` — interactive React mockup that mounts the same panel beside a faux Obsidian editor.

## Status

Filed under `inputs/` per `docs/inputs-ingestion.md` — not auto-extracted; conductors consult during their scope phase.

## Related spec

`specs/claude-cli-chat-sidebar/` — feature already in implementation stage (PR-1/PR-2/PR-3 merged on develop). The design brief overlaps with shipped functionality and introduces deltas (autonomy dial, folder filter, subscription/no-key path, JSON-only output, session persistence, file-write proposals). A delta analysis is needed before further implementation work — see open question raised on the orchestration thread on 2026-05-14.
