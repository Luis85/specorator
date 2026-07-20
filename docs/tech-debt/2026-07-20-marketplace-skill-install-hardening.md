---
type: tech-debt
title: "Marketplace multi-file skill install — untrusted-source hardening"
date: 2026-07-20
updated: 2026-07-20
status: in-progress
priority: "2 - medium"
severity: medium
scope: src/features/marketplace
---

# Marketplace multi-file skill install — untrusted-source hardening

Two hardening gaps in the multi-file skill fetch path (`marketplaceStore.ts`),
surfaced in review of PR #497 and now being worked one by one. Both are reachable
only through a **non-default, user-configured** `marketplaceSourceUrl` — the
shipped catalog is first-party and network access is opt-in — so they are
custom-source hardening, the same tier as the documented `requestUrl` SSRF
residuals. Each fix lands with a unit test under
`tests/unit/features/marketplace/`.

- [x] **5. Bound multi-file skill downloads.**
  `fetchSkillFiles` fetches every `files[]` entry (bounded only in concurrency)
  and retains all decoded bodies in memory before the first write, so a catalog
  declaring thousands of files or very large bodies could exhaust renderer
  memory / bandwidth. Fix: reject a manifest exceeding a file-count cap, and
  enforce per-file and aggregate byte limits during the fetch (abort past the
  threshold) rather than buffering unboundedly.

- [x] **6. Encode URL-significant characters in supporting-file paths.**
  A path with a URL-significant char such as `references/C#.md` passes the path
  sanitizer (which guards traversal / Windows-illegal / control chars, not `#`),
  then `MarketplaceCatalogClient.resolve()` does `new URL(rel, base)` where `#`
  opens a fragment — so the fetch requests `references/C` and the install fails
  or writes the wrong content. Fix: encode each path segment before URL
  resolution (or reject URL-significant chars during manifest validation).

- [x] **7. Reject superscript Windows device-name variants.**
  `RESERVED_DEVICE_NAME` in `skillInstallTargets.ts` rejects `CON`/`COM1`–`COM9`
  etc. but not the superscript forms `COM¹`–`COM³` / `LPT¹`–`LPT³`, which Windows
  also treats as reserved. A skill file at `scripts/COM¹.txt` passes both preflight
  guards and then fails at the filesystem write, potentially after partial writes.
  Fix: include the superscript-digit variants in the device-name predicate.

- [x] **8. Reject file/directory path collisions in a skill's `files[]`.**
  `isSafeSkillFilePath` (`catalogTypes.ts`) validates each path in isolation, so a
  manifest declaring both `skills/foo/SKILL.md` and `skills/foo/SKILL.md/readme.txt`
  is accepted; the installer then creates `SKILL.md` as a directory and later fails
  writing the `SKILL.md` marker file, leaving a partial skill dir that blocks retry.
  Fix: reject a `files[]` set where any path is an ancestor of another (a declared
  file used as a directory prefix), including descendants of the `SKILL.md` marker.

- [ ] **9. Clean up a partial skill directory after a write failure.**
  If a supporting-file write succeeds and a later one fails (transient I/O, disk
  full), the new skill folder is left without `SKILL.md`, and every retry then hits
  the installer's pre-existing-folder refusal — so the user can't reinstall through
  Marketplace even after the cause is resolved. Fix: on a write failure, remove the
  skill folder we just created (recursively) so a retry starts clean.

- [ ] **10. Pin skill supporting-file fetches to the reviewed catalog revision.**
  Supporting files are fetched at install time from the mutable source (GitHub
  `main`), while the reviewed `SKILL.md` is from preview time — so a catalog update
  in that window can yield a hybrid skill (marker and scripts from different
  revisions). Fix: pin all of an item's requests to an immutable revision, or
  validate fetched content against hashes carried in the reviewed index.

- [x] **11. Stop peer fetch workers after the first failure.**
  `fetchWithConcurrency` used `Promise.all`, which rejects the instant one worker
  throws while the other workers keep taking cursor entries and issuing requests —
  so the UI reports failure and re-enables Install while the rejected batch is still
  downloading, and a retry can overlap it. Fix: stop pulling new work on the first
  error and await all workers' in-flight requests before rejecting.
