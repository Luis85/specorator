# Brand-review checklist

> Mechanical checks the `brand-reviewer` agent runs on every PR that touches user-visible UI. Authors can self-check before requesting review.

## Tokens & values

- [ ] No literal hex outside `:root` in `sites/styles.css` — covers 3-digit (`#fff`), 4-digit (`#fff8`), 6-digit (`#17201b`), and 8-digit (`#17201bff`) hex in any case.
- [ ] No literal hex (any form above) in **any changed** (new *or* modified) CSS/JSX/HTML file in `sites/` or anywhere under `.claude/skills/specorator-design/` (not just `ui_kits/` — `slides/`, `preview/`, and other UI subfolders all qualify). Adding a literal hex to an existing file is just as blocking as adding a new file with one. Inline `style="…"` attributes in changed JSX/HTML are in scope.
- [ ] No redefinition of `--ink`, `--paper`, `--accent`, `--accent-strong`, `--highlighter`, or `--lane-*` outside `colors_and_type.css`.
- [ ] Page background is `var(--paper)`. White is reserved for cards (`--surface`).
- [ ] Font stacks are tokenized — `var(--font-sans)`, `var(--font-mono)`. No literal `Inter, ui-sans-serif, …` or `ui-monospace, SFMono-Regular, …`.

## Iconography & content

- [ ] Zero emoji.
- [ ] Zero new icon-library imports (`lucide`, `heroicons`, `phosphor`, `feather`, `react-icons`, `@iconify/*`) without an ADR.
- [ ] Headlines (`<h1>`, `<h2>`, `<h3>`) are sentence case and end with a period.
- [ ] Em-dashes (`—`) for asides; no en-dashes (`–`).
- [ ] `var(--highlighter)` only fills small surfaces (brand mark, primary CTA, step-number circle, inline code chip on dark). Never as a wash.

## Lane coding

- [ ] `data-lane="define"` → `var(--lane-define)` green.
- [ ] `data-lane="build"` → `var(--lane-build)` blue.
- [ ] `data-lane="ship"` → `var(--lane-ship)` gold.

## Components

- [ ] New `.button` rules: min-height ≥ 44px, weight ≥ 760, radius `var(--r-md)`.
- [ ] New cards: `var(--line)` borders, 2px lift on hover, border tightens to `var(--ink)`, radius `var(--r-md)` / `var(--r-lg)` / `var(--r-xl)`.
- [ ] No gradients, no textures, no photographic imagery. The only sanctioned image is `assets/specorator-workflow.svg`.

## Quick grep recipes

```bash
# Hex literals outside :root in sites/styles.css — 3/4/6/8-digit, any case.
# Strip the :root { … } block (handles nested braces) before grepping so
# custom properties declared elsewhere (e.g. `.card { --local: #fff; }`) are
# still flagged.
awk 'BEGIN{depth=0; in_root=0}
     /:root[[:space:]]*\{/ && depth==0 { in_root=1; depth=1; next }
     in_root { depth += gsub(/\{/, "{") - gsub(/\}/, "}"); if (depth<=0) { in_root=0; depth=0 } ; next }
     { print NR ":" $0 }' sites/styles.css \
  | grep -Ei "#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b"

# Emoji in changed files
git diff main...HEAD --name-only | xargs grep -P "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]" 2>/dev/null

# Untokenized font stacks
git diff main...HEAD --name-only | xargs grep -E "(Inter, ui-sans-serif|ui-monospace, SFMono-Regular)" 2>/dev/null
```
