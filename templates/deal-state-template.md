---
deal: <deal-slug>
client: <Client Name>
contact: <Primary contact name — email>
source: inbound | referral | outbound | rfp
current_phase: qualifying   # qualifying | scoping | estimating | proposing | negotiating | ordered | no-go | on-hold
status: active              # active | on-hold | ordered | closed
last_updated: YYYY-MM-DD
last_agent: <role>
artifacts:
  qualification.md: pending   # pending | in-progress | complete | skipped | blocked
  scope.md: pending
  estimation.md: pending
  proposal.md: pending
  order.md: pending
---

# Deal state — <deal-slug>

## Phase progress

| Phase | Artifact | Status |
|---|---|---|
| 1. Qualify | `qualification.md` | pending |
| 2. Scope | `scope.md` | pending |
| 3. Estimate | `estimation.md` | pending |
| 4. Propose | `proposal.md` | pending |
| 5. Order | `order.md` | pending |

> **Statuses:** `pending` | `in-progress` | `complete` | `skipped` | `blocked`. Section semantics + status enums: see [`_shared/state-file-sections.md`](./_shared/state-file-sections.md).

## Skips

- e.g., `scope.md` — RFP included a detailed requirements document; scoping workshop not required.

## Blocks

- e.g., `qualification.md blocked — awaiting budget confirmation from <name>`

## Hand-off notes

```
YYYY-MM-DD (sales-qualifier): Qualification complete. Win probability 72%. Strong champion in <name>.
                               Proceed to scoping — but note: CTO sceptical of timeline.
YYYY-MM-DD (scoping-facilitator): Workshop held. Scope bounded. 3 open questions remain.
```

## Open clarifications

- [ ] CLAR-001 — …
- [x] CLAR-002 — … *(resolved YYYY-MM-DD: …)*
