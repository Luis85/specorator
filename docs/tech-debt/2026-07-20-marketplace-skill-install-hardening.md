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

- [ ] **5. Bound multi-file skill downloads.**
  `fetchSkillFiles` fetches every `files[]` entry (bounded only in concurrency)
  and retains all decoded bodies in memory before the first write, so a catalog
  declaring thousands of files or very large bodies could exhaust renderer
  memory / bandwidth. Fix: reject a manifest exceeding a file-count cap, and
  enforce per-file and aggregate byte limits during the fetch (abort past the
  threshold) rather than buffering unboundedly.

- [ ] **6. Encode URL-significant characters in supporting-file paths.**
  A path with a URL-significant char such as `references/C#.md` passes the path
  sanitizer (which guards traversal / Windows-illegal / control chars, not `#`),
  then `MarketplaceCatalogClient.resolve()` does `new URL(rel, base)` where `#`
  opens a fragment — so the fetch requests `references/C` and the install fails
  or writes the wrong content. Fix: encode each path segment before URL
  resolution (or reject URL-significant chars during manifest validation).
