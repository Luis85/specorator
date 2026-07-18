---
name: project-setup
description: Use when setting up a new project, bootstrapping a new Obsidian plugin, or writing a product vision / PRD to start a project. Opens with a simple product-vision questionnaire that seeds docs/prds/ (prd-000 vision + optional feature PRDs), then installs a quality harness (fallow ratchet, ESLint severity-staging, LOC guard, coverage floors, CI) with docs scaffolding — and, in Obsidian mode, a complete new-plugin workspace (Vitest, Vue 3 + Pinia + vue-router, esbuild, obsidianmd lint, Prettier, CSS ratchet, release flow) with a mobile-or-desktop choice. Deterministic bundled Node engine; local-first; re-apply is idempotent; GitHub integration is opt-in.
---

# project-setup

Thin orchestration over the deterministic engine in `scripts/setup.mjs`. The
engine owns every mutation; you detect, interview, then invoke it.

## Flow

1. **Detect:** `node scripts/setup.mjs detect` (run from the target repo root via
   the absolute path to this skill's `setup.mjs`). Read the JSON to tailor the
   interview and skip redundant work (detected package manager, test framework,
   existing configs). Obsidian mode scaffolds a **new** plugin, so run it in a
   fresh repo or empty directory.
2. **Refresh pins (optional, network):** when the user wants the latest
   dependencies, run `node .../setup.mjs refresh-pins` first and commit the
   `scripts/pins.json` diff to this skill. It resolves every pin to its latest
   release (TypeScript capped by typescript-eslint's declared peer range —
   newer TS majors break the lint stack). After a refresh, re-run the E2E smoke
   in `references/obsidian-plugin.md` § Verification before relying on it.
3. **Product vision (PRDs) — offer this first.** Before the technical interview,
   ask: "Want to start with a short product vision?" If yes, guide the user
   through a **simple** questionnaire (one plain question at a time) to document
   the idea:
   - What are you building? (a name/one-liner → `title`)
   - What problem does it solve? (`problem`)
   - What's your vision for the solution? (`vision`)
   - The top 2–4 goals/outcomes? (`goals`)
   Assemble a `prd-000` **Product Vision** entry, then loop: **"Add another PRD
   (e.g. a feature), or proceed to scaffolding?"** — number extras from `prd-001`.
   Collect them into the `prds` array of `answers.json` (each: `id`, `title`,
   `status: "draft"`, `created` = today's date, `problem`, `vision`, `goals[]`,
   optional `notes`). On apply the engine renders `docs/prds/<id>-<slug>.md`
   (frontmatter + markdown) plus an index README — never clobbering edits on
   re-apply. Shape in `references/quality-harness.md`. Skip cleanly if the user
   just wants the harness (leave `prds` empty).
4. **Interview** (one question at a time):
   - **Obsidian plugin?** Obsidian mode scaffolds a **new** plugin, so use it
     only for a fresh repo / empty directory. If `detect` already found a
     `manifest.json` (an existing plugin), do NOT enable Obsidian mode — point the
     user at a fresh repo, or run the generic quality-harness (leave `obsidian`
     null) to add just the gates to their existing plugin. For a new plugin,
     collect: plugin id, display name, description, author
     (+ optional authorUrl); then **ALWAYS ask: mobile-ready, or desktop-only?**
     (`obsidian.mobile` — flips manifest `isDesktopOnly`, esbuild externals,
     and the Node/Electron import ban); then the Vue island (`obsidian.vue`,
     default yes: Vue 3 + Pinia + vue-router view); `minAppVersion` defaults
     to 1.7.2. Full shape + generated-file map: `references/obsidian-plugin.md`.
   - Guardrail toggles (default all on; `cssGuard` is Obsidian-only).
   - **Test framework — Jest or Vitest** (default the detected one; Obsidian
     mode is always Vitest, don't ask).
   - **Opt-in hooks (Obsidian; default ALL OFF — ask which, if any):**
     `hooks.sessionStart` (Claude Code web installs deps on session start),
     `hooks.qualityGate` (Claude runs typecheck+lint on Stop, self-correcting),
     `hooks.preCommit` (simple-git-hooks + nano-staged runs eslint+prettier on
     staged files). Nothing installs a hook unless asked. The Claude slash
     commands, publishing guide, `manifest-beta.json`, and Dependabot (with
     GitHub on) always ship — they are inert until used.
   - Docs scaffold + optional grill; the GitHub decision (see
     `references/github-integration.md`).
   Write the answers to `answers.json` (shape in `references/quality-harness.md`).
5. **Preview:** `node .../setup.mjs plan --config answers.json` (dry-run; mutates
   nothing). Show the user the deduped change list and the deps that will be
   installed before applying.
6. **Apply:** `node .../setup.mjs apply --config answers.json`. This installs
   deps, writes/merges configs, and baselines every ratchet from the **current**
   state (green CI on day one). Relay the output: a **Notice** flags something
   worth a human decision (e.g. an opt-in hook's install step) — surface these.
   **Next steps** (e.g. commit the lockfile) are routine. Re-applying is
   idempotent: user-editable files are kept, engine scripts/configs refresh from
   the templates (backup kept), and a converged re-apply prints no warnings.
7. **Optional grill:** if requested, run the interview in `references/grill.md`
   to fill `CONTEXT.md`, seed ADRs, and a first requirements doc.
8. **Verify + report:** `node .../setup.mjs verify --config answers.json` then
   `node .../setup.mjs report`. Then close with a concrete summary:
   - the gate commands with the detected package-manager prefix (e.g. `pnpm
     lint`, `pnpm check:loc`, `pnpm check:quality`, `pnpm test`);
   - `docs/quality-integration-guide.md` as the kept reference;
   - the top items from `quality-report.md`;
   - any Notices from step 6 that still need attention;
   - that the harness is re-runnable (re-apply any time; it won't clobber edits);
   - **Obsidian mode:** the dev loop (`.env.local` → `OBSIDIAN_VAULT`,
     `npm run dev`, community Hot Reload plugin) and the release flow
     (`npm version patch` → `git push --follow-tags`) — details in
     `references/obsidian-plugin.md`.

## Rules

- Never hand-write harness files — only the engine mutates. If something is
  missing, add a template + sub-planner, don't patch the target directly.
- The engine is idempotent and non-destructive (merge + backup). Re-running is
  safe; a converged re-apply prints no warnings.
- Requires Node ≥20; **Obsidian mode requires Node ≥22** (fallow 3 and the
  generated CI/engines pin it).
- Dependency versions come from `scripts/pins.json` (exact pins for
  reproducibility). Update them only via `refresh-pins` (step 2), never by
  hand-editing to a guess.
- If CI was generated, commit the **lockfile** (`package-lock.json` / `pnpm-lock.yaml`
  / `yarn.lock`) with the changes — the generated CI's strict install + dependency
  cache require a committed lockfile (a fresh `apply` creates one but won't commit it).
- Apply on a clean git tree (`git status`) so the change is easy to review; the
  engine backs up any file it must overwrite.
- Run `check:quality` with `./coverage` absent (see `references/quality-harness.md`).
