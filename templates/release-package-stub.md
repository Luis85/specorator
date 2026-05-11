---
title: <Document title — same as the codebase form>
folder: docs
description: <One-sentence description — same as the codebase form>
entry_point: false
---

# <Document title>

<!-- TODO: One short paragraph (1–3 sentences) that names this document's purpose for the consumer. Replace built-up content from the codebase form with this stub paragraph. -->

## <Section heading from the codebase form>

<!-- TODO: <what consumer fills in here> -->

## <Next section heading from the codebase form>

<!-- TODO: <what consumer fills in here> -->

---

## How to use this stub

This file shipped in the released Specorator template package as a **stub** — a structural placeholder, not finished content. The codebase form (in the Specorator template repository) carries built-up examples and version-specific commentary that are intentionally omitted from the released package per the fresh-surface contract documented in [`docs/release-package-contents.md`](../docs/release-package-contents.md). (The ADR that records the policy ships in the codebase only — the released `docs/adr/` folder ships with a stub `README.md` explaining how the consumer files their own ADRs starting at `ADR-0001`.)

To fill it in:

1. Read the document title and frontmatter to confirm the document's purpose for your project.
2. Replace each `<!-- TODO: ... -->` marker with content that fits your product, your domain, and your team.
3. Keep the section structure unless your product genuinely needs different sections — the structure is what makes the cross-references in the rest of the template work.
4. Remove this "How to use this stub" trailer once the stub has been filled in.

If you find a section heading that does not fit your product, replace it. If you find one that you do not yet have an answer for, leave the `<!-- TODO: ... -->` marker — Specorator agents and skills will surface the gap rather than fail.

The reference shape for stubs is this file. The methodology page that documents how content is stubified for the released package is [`docs/release-package-contents.md`](../docs/release-package-contents.md). (Maintainers reading the codebase can also see the full policy record in `docs/adr/` — that ADR ships in the codebase only and is excluded from the released package by the very policy it records.)
