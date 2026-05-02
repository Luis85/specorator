---
id: IDEA-GHU-001
title: "Publish product page and standalone UI to GitHub Pages with dual-deployment"
stage: idea
feature: github-pages-ui
status: accepted
owner: analyst
created: 2026-05-01
updated: 2026-05-02
---

## Problem statement

The Specorator UI runs in Obsidian only. Potential users, contributors, and reviewers cannot see or use the interface without installing the plugin into a live Obsidian vault. This raises the barrier to evaluation, complicates UI review in pull requests, and makes it impossible to demonstrate the workflow on a phone or shared computer. There is also no product page to link to from documentation, README, or external references — only the raw GitHub repository.

## Primary users

- **Evaluators** who want to try Specorator before installing the plugin.
- **Contributors** who want to review or test UI changes without a local Obsidian setup.
- **Users on mobile or shared devices** who cannot install Obsidian plugins but want to explore the workflow.
- **The CI pipeline** which needs a verifiable artifact URL to link from PR checks.
- **Visitors arriving from search or social links** who need a polished landing page before diving into the app.

## Success criteria

- `https://luis85.github.io/specorator/` serves a product page (`site/index.html`) that describes the plugin and links to the live app.
- `https://luis85.github.io/specorator/app/` serves a fully functional instance of the Specorator UI.
- All features accessible in the Obsidian plugin — creating features, advancing steps, archiving, settings — work identically in the web app.
- Data entered in the web app persists across page refreshes (using `localStorage`).
- The deployment is automated on every push to `demo` via GitHub Actions (not `main`).

## Constraints

- Must not require a backend server; the deployment must be purely static (GitHub Pages serves only static files).
- `localStorage` scope is limited to the browser origin; no cross-device sync is in scope.
- The web app must be built with the same source as the Obsidian plugin (no parallel codebase).
- The `IBridge` interface must not be changed; the `LocalStorageBridge` must be a drop-in replacement.
- `localStorage` has a 5 MB limit per origin; file content must be stored as plain strings with no binary data.
- Pages deployment must trigger from `demo` branch only (not `main`), per the branching model (#78).

## Research questions

- What Vite base URL is required for GitHub Pages project pages (`/specorator/app/`)?
- How should `openFile` behave in the web context where no vault editor is available?
- Should the GitHub Pages build use the same `vite build` as the standalone dev build, or a separate mode?

## Preliminary scope

**In scope:** `LocalStorageBridge` implementing all `IBridge` operations; toast notification component replacing `Notice`; in-app file viewer for `openFile`; GitHub Actions workflow deploying to GitHub Pages on push to `demo`; `VITE_BASE_URL=/specorator/app/` env var for base path; product page at root; standalone app at `/app/`; automated deployment.

**Out of scope:** Cross-device sync, authentication, IndexedDB for larger storage, service worker / offline mode, preview deployments for PRs.
