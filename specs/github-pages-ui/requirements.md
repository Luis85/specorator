---
id: PRD-GHU-001
title: GitHub Pages dual-deployment — product page and standalone UI with localStorage persistence
stage: requirements
feature: github-pages-ui
status: accepted
owner: pm
inputs:
  - IDEA-GHU-001
created: 2026-05-01
updated: 2026-05-02
---

## Summary

The Specorator GitHub Pages deployment must serve two things from a single automated workflow: a product landing page at the root and the full standalone app at `/app/`. All app persistence (feature artifacts, settings) must use `localStorage` as the backing store so the app is fully functional without any backend or Obsidian runtime. Deployment is triggered by pushes to the `demo` branch, not `main`, in line with the branching model (#78).

## Goals

- `https://luis85.github.io/specorator/` serves a product page introducing the plugin and linking to the live app.
- `https://luis85.github.io/specorator/app/` serves the fully functional standalone Specorator UI.
- Any visitor to the app URL can create, advance, archive, and manage features with data that persists across sessions.
- Contributors can review UI changes via a live URL without installing Obsidian.
- Deployment is zero-touch: a push to `demo` automatically publishes the updated site.

## Non-goals

- Cross-device or cross-browser data synchronisation.
- Authentication or access control on the GitHub Pages instance.
- IndexedDB or other storage backends (localStorage only in this version).
- Preview deployments for feature branches or pull requests.
- Service worker / offline PWA support.

---

## Functional requirements (EARS)

### REQ-GHU-001

**Pattern:** ubiquitous
**Statement:** The repository shall include a GitHub Actions workflow that builds the dual-site (product page + standalone SPA) and deploys it to GitHub Pages on every push to `demo`.
**Acceptance:**
- The workflow file exists at `.github/workflows/pages.yml`.
- The workflow triggers on `push` to `demo` and on `workflow_dispatch`.
- The build step runs `npm run build:web` with `VITE_BASE_URL=/specorator/app/`.
- The assembled `_site/` directory contains `index.html` (product page) at the root and the SPA assets under `app/`.
- The deployed product page is accessible at `https://luis85.github.io/specorator/`.
- The deployed app is accessible at `https://luis85.github.io/specorator/app/`.
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

### REQ-GHU-007

**Pattern:** ubiquitous
**Statement:** The Pages deployment shall serve a product landing page at the root URL that introduces Specorator and links to the standalone app.
**Acceptance:**
- `site/index.html` is committed to the repository and contains the product page content.
- The workflow copies `site/index.html` to `_site/index.html` before artifact upload.
- The product page loads at `https://luis85.github.io/specorator/` without redirects.
- The product page includes a visible link to the app at `/specorator/app/`.
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

### REQ-GHU-002

**Pattern:** ubiquitous
**Statement:** The plugin shall provide a `LocalStorageBridge` that implements `IBridge` using `localStorage` for all vault file and settings operations.
**Acceptance:**
- `LocalStorageBridge` stores file content under the key `specorator:file:{path}`.
- `LocalStorageBridge` stores plugin settings under the key `specorator:settings` as a JSON string.
- `readFile`, `writeFile`, `deleteFile`, `listFiles`, `listFolders`, `fileExists`, `createFolder` all operate correctly against `localStorage` without any network call.
- Creating, advancing, archiving, and reloading a feature round-trips correctly (data survives a page refresh).
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

### REQ-GHU-003

**Pattern:** event-driven
**Statement:** When the production standalone SPA starts, it shall load `LocalStorageBridge` as the `IBridge` implementation and initialise with any previously stored data.
**Acceptance:**
- `import.meta.env.PROD` determines which bridge to use: `LocalStorageBridge` in production, `MockBridge` in development.
- On first load (empty `localStorage`), the app starts with empty feature lists and default settings (no crash or blank screen).
- On subsequent loads, all previously created features are visible in the Features view.
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

### REQ-GHU-004

**Pattern:** ubiquitous
**Statement:** The standalone UI shall display toast notifications for all `showNotice` calls so that user feedback (errors, confirmations) is visible without an Obsidian `Notice` component.
**Acceptance:**
- A `AppToast` component renders active notices in a fixed overlay above all other content.
- Notices auto-dismiss after the specified `durationMs` (default 4000 ms).
- Multiple simultaneous notices stack vertically.
- `LocalStorageBridge.showNotice()` dispatches a `sp:notice` CustomEvent; `App.vue` catches it and adds the notice to the notification store.
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

### REQ-GHU-005

**Pattern:** event-driven
**Statement:** When `openFile` is called in the standalone UI, the app shall navigate to an in-app file viewer showing the file path and content instead of opening a vault editor.
**Acceptance:**
- `LocalStorageBridge.openFile(path)` dispatches a `sp:open-file` CustomEvent with the path.
- `App.vue` catches the event and navigates to `/file/:encodedPath`.
- The `FileView` component reads the file content from the bridge and displays it with the file path and a copy-to-clipboard button.
- If the file does not exist in localStorage, a clear "file not found" message is shown.
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

### REQ-GHU-006

**Pattern:** ubiquitous
**Statement:** The standalone SPA build shall be configurable with a `VITE_BASE_URL` environment variable so it can be served from any path prefix without source changes.
**Acceptance:**
- `vite.config.ts` reads `process.env.VITE_BASE_URL` and uses it as the Vite `base` option for the standalone build.
- When `VITE_BASE_URL` is not set, the default is `/` (relative root for local development).
- All asset paths and router links resolve correctly when deployed to `/specorator/`.
**Priority:** must
**Satisfies:** IDEA-GHU-001

---

## Non-functional requirements

| ID | Category | Requirement | Target |
|---|---|---|---|
| NFR-GHU-001 | Performance | Time-to-interactive on GitHub Pages (cold load, Chromium) | < 3 s |
| NFR-GHU-002 | Storage | App remains functional up to localStorage saturation | Graceful error shown, no crash |
| NFR-GHU-003 | Accessibility | All interactive elements have accessible labels | WCAG 2.2 AA minimum |
| NFR-GHU-004 | Build size | Standalone SPA gzipped bundle | < 300 KB |
| NFR-GHU-005 | CI | Pages deployment workflow completes | < 3 min |

---

## Quality gate

- [ ] `npm run build:web` produces `dist-standalone/` without errors
- [ ] Deployed app URL loads and renders the home view
- [ ] Creating a feature, refreshing the page, and seeing the feature confirms localStorage persistence
- [ ] `showNotice` shows a visible toast that auto-dismisses
- [ ] Clicking "Open" on a feature navigates to the in-app file viewer with correct content
- [ ] `npm test` — all tests pass (including any new LocalStorageBridge tests)
- [ ] `npm run typecheck` — zero TypeScript errors
