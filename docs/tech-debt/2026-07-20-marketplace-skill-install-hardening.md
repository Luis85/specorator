---
type: tech-debt
title: "Marketplace multi-file skill install — untrusted-source hardening"
date: 2026-07-20
updated: 2026-07-20
status: resolved
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
  threshold) rather than buffering unboundedly. (Follow-up: the file-count cap
  also runs at parse time in `sanitizeSkillFiles`, so a huge `files[]` is dropped
  at catalog load and can't drive item 8's O(n²) collision scan into a renderer
  freeze before an install is ever attempted.)

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

## Residuals / follow-ups (bounded to a non-default custom source)

- **Dropping un-installable slug entries at parse — considered, declined.** A custom
  skill whose `name` normalizes to a provider-invalid slug (a YAML-reserved word like
  `null`, a >64-char slug, or a Windows device name like `con`) displays in the catalog
  but can never install — `assertSkillFolderName` rejects the device name and item 12's
  `validateSlugName` rejects the reserved/overlong marker, both with a clear error. The
  install path already fails SAFELY (no corruption, no false "Installed" badge), so
  dropping such entries at parse time is a display-only nicety; doing it would bake
  provider-slug + device-name rules into the neutral catalog parser. Left as-is —
  reconsider only if un-installable custom entries showing in the grid becomes a real
  annoyance, or add the check to the marketplace validator at the source instead.

- **Per-destination install serialization — DONE.** The store now queues skill
  installs by DESTINATION folder (`provider + scope + normalizeInstallSlug(name)`, the
  real write-collision boundary — NOT `item.id`, which a catalog refresh can reuse for
  changed content or decouple from a name that maps to the same slug). Installs to one
  folder chain instead of racing, and each runs its own install (a later one hits the
  "already installed" preflight skip), so two writers never touch or roll back one
  directory concurrently and no request rides another's outcome. The committed source
  is snapshotted at ENQUEUE (not read after the queued wait), so a catalog switch during
  the wait can't pair a queued install's reviewed marker with supporting files from a new
  source. A fully atomic guarantee would still stage each install in a uniquely-owned dir
  before an atomic publish, but the queue closes the concurrent-writer race.
- **Dangling-symlink rollback (user scope).** `HomeFileAdapter.exists()` uses `fs.access`,
  which FOLLOWS symlinks — so a pre-existing DANGLING symlink at the user-scope skill dir
  reads as absent, the pre-existing-folder guard misses it, the write fails through the
  broken link, and item 9's rollback then removes the user's (already-broken) symlink.
  Narrow and low-harm (an already-dangling link), but the clean fix is a symlink-aware
  (`lstat`) existence check threaded through both adapters + the installer, or the atomic
  uniquely-staged-dir approach above — deferred as disproportionate to the risk.
- **Pre-buffer streaming size limit.** The per-file size cap runs after
  `requestUrl().text` has already materialized the whole body — `requestUrl` is a
  high-level API with no socket/stream hooks, so a truly pre-buffer bound needs a
  streaming transport (same limitation as the documented DNS-rebinding / redirect
  SSRF residuals). The cap still refuses to WRITE an oversized body.
- **Full revision pinning (item 10 residual).** The plugin now re-fetches `SKILL.md`
  at install and refuses to install if it no longer matches the reviewed body (see
  item 10 below), which catches a catalog bump that touches the marker. It does NOT
  catch a bump that rewrites a supporting file while leaving `SKILL.md` byte-identical
  — there the reviewed marker is still accurate but a script moved. Closing that narrow
  residual needs per-file content hashes carried in the reviewed index, or pinning all
  of an item's fetches to an immutable revision (both cross-repo, touching the
  marketplace index format).

---

- [x] **9. Clean up a partial skill directory after a write failure.** (Rollback now
  guards against deleting a concurrent peer's completed install — see residuals above.)
  If a supporting-file write succeeds and a later one fails (transient I/O, disk
  full), the new skill folder is left without `SKILL.md`, and every retry then hits
  the installer's pre-existing-folder refusal — so the user can't reinstall through
  Marketplace even after the cause is resolved. Fix: on a write failure, remove the
  skill folder we just created (recursively) so a retry starts clean.

- [x] **10. Pin skill supporting-file fetches to the reviewed catalog revision.**
  (Plugin-only re-verify — narrows the window; full pinning stays a residual above.)
  Supporting files are fetched at install time from the mutable source (GitHub
  `main`), while the reviewed `SKILL.md` is from preview time — so a catalog update
  in that window can yield a hybrid skill (marker and scripts from different
  revisions). Fix: after fetching a multi-file skill's supporting files, re-fetch its
  `SKILL.md` and require it still equals the reviewed body; a mismatch aborts the
  install with a "catalog changed — re-review" error so the reviewed marker is never
  paired with newer supporting files. The reviewed body is still what's written (the
  re-fetch is a guard, not the source of truth), and a marker-only skill skips the
  re-fetch entirely (no supporting files, no hybrid). Full immutable-revision or
  content-hash pinning (cross-repo) remains the residual noted above.

- [x] **11. Stop peer fetch workers after the first failure.**
  `fetchWithConcurrency` used `Promise.all`, which rejects the instant one worker
  throws while the other workers keep taking cursor entries and issuing requests —
  so the UI reports failure and re-enables Install while the rejected batch is still
  downloading, and a retry can overlap it. Fix: stop pulling new work on the first
  error and await all workers' in-flight requests before rejecting.

- [x] **12. Validate the SKILL.md marker name with the strict provider slug rule.**
  `assertInstallableSkillBody` matched the frontmatter `name` to the install slug via
  the LOSSY `normalizeInstallSlug`, so `Foo_Bar`/`Foo Bar` (both → `foo-bar`), an
  overlong name, or a quoted YAML-reserved word (`"null"`) all passed and were written
  into the folder and marked "Installed" — even though the provider authoring rule
  (`validateSlugName`: exact `[a-z0-9-]`, ≤64 chars, no reserved words) rejects them,
  so no provider could load the skill. Fix: also require `validateSlugName(fmName)` to
  pass before the (still lossy) slug match, refusing a marker no provider accepts.
  (Plugin-side defense-in-depth for a custom source; the first-party catalog authors
  valid slugs. The marketplace validator enforcing the same rule at the source is a
  possible cross-repo follow-up.)

- [x] **13. Reject case- AND Unicode-insensitive file collisions in a skill's `files[]`.**
  `sanitizeSkillFiles`'s dedup + prefix-collision scan compared paths CASE-SENSITIVELY,
  so `scripts/Foo.md` and `scripts/foo.md`, or a supporting `skill.md` vs the injected
  `SKILL.md`, are distinct on Linux but the SAME file on Windows / default macOS — one
  silently overwrites the other (the marker write runs last, so it clobbers a colliding
  supporting file) yet the skill still reports installed. Fix: normalize each path to
  NFC (macOS filesystems are normalization-insensitive — `café.md` NFC vs NFD are one
  file) AND fold to lowercase before the duplicate + prefix-collision check, rejecting
  the whole skill (fail loud) on all platforms so the catalog parse stays deterministic
  and portable. Case- and normalization-insensitive completion of item 8.

- [x] **14. Don't treat our own partial marker write as a peer's completion.**
  Item 9's rollback suppressed cleanup whenever a `SKILL.md` was PRESENT at cleanup time,
  to avoid deleting a concurrent peer's finished install. But our own final marker write
  can create-then-truncate on a mid-write failure (disk full), and an exists-only check
  misreads that partial `SKILL.md` as a peer's completion — leaving a broken marker the
  preflight later reports as installed and skips reinstalling. Fix: compare the existing
  marker's CONTENT to the full body we meant to write; only a byte-identical marker counts
  as a completed (peer or self) install worth keeping — a truncated/different one is rolled
  back. Avoids the atomic-rename dependency (no cross-adapter move capability needed).

- [x] **15. Re-check the user-scope install capability at write time.**
  The detail selector blocks NEW user-scope picks when a provider loses that capability
  (`ProviderRegistry.installsUserScopeSkills` → false: Codex switching to WSL, Claude's
  `loadUserSettings` disabled), but a target CAPTURED while it was supported still wrote to
  host home even if settings changed during the queued wait / download — a silent
  "installed" the runtime (which now resolves a different home, e.g. the WSL distro's) never
  discovers. `runSkillInstall` re-checked only the network gate. Fix: re-evaluate
  `installsUserScopeSkills` against LIVE settings immediately before `installSkillItem` and
  abort an obsolete user target (project scope is never gated) — the write-time parallel of
  the existing network re-check.
