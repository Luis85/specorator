---
title: "Issue update draft: Astro product-page target"
doc_type: issue-draft
status: proposed
owner: product
last_updated: 2026-05-08
related_issues:
  - 22
  - 33
references:
  - docs/product-page-brief.md
  - docs/product-vision.md
  - docs/prd.md
---

# Issue update draft — Astro product-page target

## Summary

Define and lock the target scope for the product page so implementation can proceed as a durable product-information hub.

## Proposed issue title

**Product page target: Astro-based landing page with guided tour, visible roadmap, and repo-driven content hub**

## Problem

The repository has product-page direction in briefs, but the implementation target needs a single, explicit issue statement that is actionable and testable.

## Target

Build (or update) the product page as an **Astro page** that:

1. Serves as the **primary product landing page** for Specorator.
2. Includes a **tour section** that walks users through product value and the workflow journey.
3. Includes a **visible roadmap section** that clearly separates current increment/v1 from planned v2.0 work.
4. Uses **repo-driven content** as the source of truth (docs/specs/roadmap references), not ad hoc copy.
5. Is maintained as the long-term **product information hub** and updated whenever core repo content changes.

## Acceptance criteria

- [ ] Product page is implemented under the Astro site and routed as a top-level landing page.
- [ ] Page includes an explicit tour block with stepwise narrative and clear CTA(s).
- [ ] Page includes an explicit roadmap block that is visually prominent without additional clicks.
- [ ] Content references and derives from repository sources (at minimum: product vision, PRD, roadmap, and product-page brief).
- [ ] A short "content source map" is documented in-repo, linking each major page section to its source document.
- [ ] Update process is documented so the page remains the canonical product-information hub over time.

## Scope boundaries

### In scope

- Astro page structure/content for landing, tour, roadmap, and hub framing.
- Repo-content integration strategy (manual generated mapping or static data sync documented in-repo).
- Documentation updates required to keep the page maintainable.

### Out of scope

- Rebranding unrelated product docs.
- Runtime app feature implementation.
- Marketing automation integrations.

## Suggested implementation notes

- Keep terminology aligned with `docs/product-page-brief.md` copy boundaries.
- Prefer plain-language labels for workflow stages in user-facing sections.
- Preserve distinction between current increment/v1 and v2.0 roadmap items.

## Done when

This issue is complete when the Astro landing page is live in the site branch, roadmap + tour are visible on-page, and repository documentation identifies it as the long-term product information hub with an update path.
