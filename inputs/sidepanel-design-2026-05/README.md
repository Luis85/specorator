# Sidepanel design — May 2026

Source: design brief + interactive MVP mockup handed in by the product owner on 2026-05-14 along with the request to add **Claude subscription** (no-API-key) support to the existing Claude CLI chat sidebar.

## Files

- `Sidepanel_Design_Brief.html` — static design brief: principles, panel anatomy, key interactions (@ mention + Attach), Settings (autonomy + folder filter), in/out scope, design decisions table, open questions, increment roadmap. Self-contained; opens in any browser. Pairs with `tokens.css` (see below) for the warm paper-and-ink visual system.
- `tokens.css` — 28-token companion stylesheet referenced by `Sidepanel_Design_Brief.html`. Defines colors, type scale, and layout custom properties. Values match the brief's visual style; replace if/when an authoritative `tokens.css` ships from the design tool.
- `Sidepanel_MVP.html` — interactive design-intent mockup. Open in any browser to see the panel running against a faux Obsidian editor backdrop. Pairs with the three JSX files below; Babel-standalone (loaded from unpkg) transpiles the JSX at load time — no build step required. Local-only artifact: tweak knobs, simulated agent responses, and a hardcoded mini-vault demonstrate the intended behaviour for Increment 1.
- `tweaks-panel.jsx` — reusable Tweaks shell + form-control helpers (sliders, segmented radios, toggles, color picker). Owns the `__activate_edit_mode` / `__edit_mode_set_keys` host protocol; floating panel anchored bottom-right.
- `sidepanel-components.jsx` — design tokens, theme context, and all visual primitives (`SPHeader`, `SPContextStrip`, `SPTabBar`, `SPUserMsg`, `SPAgentMsg`, `SPTypingDots`, `SPFileCard`, `SPHintCard`, `SPAtMention`, `SPFilePicker`, `SPContextPanel`, `SPSettingsPanel`). Inline-styled; no external CSS dependency.
- `sidepanel-app.jsx` — vault fixture (`SP_VAULT`), simulated response synthesiser (`buildResponse`), and the top-level `SPApp` component that wires the chat + context tabs together. Includes the streaming-typewriter simulation and the @-mention / Attach picker keyboard handling. Persists `sp-vault-folders` and `sp-autonomy` to `localStorage`.

## Status

Filed under `inputs/` per `docs/inputs-ingestion.md` — not auto-extracted; conductors consult during their scope phase.

## Related spec

`specs/claude-cli-chat-sidebar/` — feature already in implementation stage (PR-1/PR-2/PR-3 merged on develop). The design brief overlaps with shipped functionality and introduces deltas (autonomy dial, folder filter, subscription/no-key path, JSON-only output, session persistence, file-write proposals). A delta analysis is needed before further implementation work — see open question raised on the orchestration thread on 2026-05-14.
