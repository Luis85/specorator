---
project: <project-slug>
last-updated: YYYY-MM-DD
---

# Follow-Up Register — <Project Name>

> P3.Express Document 3 — the single register for **all uncertain items**: risks, issues, change requests, and lessons.
> Updated every `/project:weekly` run (D01). Entries are never deleted; status is updated in-place.
>
> **Types:** `risk` | `issue` | `change-request` | `lesson`
> **Impact:** `H` (17–25) | `M` (9–16) | `L` (1–8)
> **Status:** `open` | `in-progress` | `closed`

---

## Active items

<!--
Each entry follows this structure:

### FU-NNN — [Short title]

| Field | Value |
|---|---|
| **Type** | risk / issue / change-request / lesson |
| **Description** | What it is |
| **Cause** | Root cause or trigger |
| **Consequence** | What happens if unmanaged |
| **Impact** | H / M / L |
| **Response** | Planned action (for risks: avoid/mitigate/transfer/accept; for issues: fix/escalate/defer/accept; for changes: see /project:change) |
| **Custodian** | Name or role |
| **Status** | open / in-progress / closed |
| **Raised** | YYYY-MM-DD |
| **Target** | YYYY-MM-DD (response deadline) |
| **Resolved** | YYYY-MM-DD (when closed) |

-->

### FU-001 — [Example risk: Client API access not provisioned]

| Field | Value |
|---|---|
| **Type** | risk |
| **Description** | Client has not yet granted API access to their legacy system, which is required before spec/auth work can begin |
| **Cause** | Client internal IT approval process |
| **Consequence** | Spec Stage 3 for authentication feature blocked; M1 milestone at risk |
| **Impact** | H |
| **Response** | Mitigate: escalate to sponsor; request access provisioning by YYYY-MM-DD |
| **Custodian** | [sponsor name] |
| **Status** | open |
| **Raised** | YYYY-MM-DD |
| **Target** | YYYY-MM-DD |
| **Resolved** | — |

---

## Closed items

<!-- Move items here when status: closed, to keep the Active section scannable -->

---

## Register summary

| Count | Type | Open | In progress | Closed |
|---|---|---|---|---|
| Risks | — | — | — | — |
| Issues | — | — | — | — |
| Change requests | — | — | — | — |
| Lessons | — | — | — | — |

> Updated automatically each `/project:weekly` run.
