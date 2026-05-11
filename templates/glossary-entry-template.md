---
term: <Canonical term in display case>
slug: <kebab-case-slug>
aliases: []           # avoid synonyms; old slugs after rename
status: draft         # draft | accepted | deprecated
last-updated: YYYY-MM-DD
related: []           # other glossary slugs, e.g. [spec, artifact]
tags: []              # e.g. [workflow, role, artifact, governance]
---

# <Term>

## Definition

One-sentence canonical definition, in domain language. No implementation jargon.

## Why it matters

Why a reader needs this term distinct from neighbours. Cite the article, section,
or skill that introduces it (link with relative paths into `docs/`, `.claude/`, etc.).

## Examples

Concrete usage. Prefer dialogue or short artefact excerpts over abstract prose.

> *Example sentence using the term in a real artifact or conversation.*

## Avoid

Synonyms, near-misses, and common misuses. One line each:

- *Wrong term* — why it confuses (and which canonical term to use instead).

## See also

- `related-term` — one-line rationale for the link.
- [`docs/<doc>.md`](../<doc>.md) — external reference.

---

> Refining a definition: update the body in place, bump `last-updated`, and add a
> one-line note at the bottom of the **Definition** section: `Refined <YYYY-MM-DD>
> in workflow <slug>`. To rename a term, create a new file with the new slug,
> add the old slug to its `aliases:`, and mark this file `status: deprecated`.
