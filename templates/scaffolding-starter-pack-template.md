---
id: PACK-<AREA>-001
title: <Project name> — Starter Pack
project: <project-slug>
phase: assemble
status: draft
owner: project-scaffolder
created: YYYY-MM-DD
updated: YYYY-MM-DD
inputs:
  - EXT-<AREA>-001
---

# Starter Pack — <Project name>

## Draft steering updates

### `docs/steering/product.md`

```md
<draft content or patch summary>
```

### `docs/steering/tech.md`

```md
<draft content or patch summary>
```

### `docs/steering/ux.md`

```md
<draft content or patch summary>
```

### `docs/steering/quality.md`

```md
<draft content or patch summary>
```

### `docs/steering/operations.md`

```md
<draft content or patch summary>
```

## Candidate downstream artifacts

### Feature idea seed

Recommended command: `/spec:start <feature-slug> [<AREA>]` then `/spec:idea`

```md
<draft idea.md sections sourced from extraction.md>
```

### Discovery seed

Recommended command: `/discovery:start <sprint-slug>`

```md
<draft frame/chosen-brief seed, if applicable>
```

### Project manager seed

Recommended command: `/project:start <project-slug>` then `/project:initiate`

```md
<draft project-description sections, if applicable>
```

## Not enough evidence

- …

---

## Quality gate

- [ ] Every proposed starter output traces back to `extraction.md`.
- [ ] Drafts are labelled as drafts and require human review before promotion.
- [ ] No EARS requirements are invented from weak evidence.
- [ ] Downstream command recommendations are explicit.
- [ ] Missing evidence is listed.
