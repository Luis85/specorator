---
project: <project-slug>
client: <client-name>
closure-date: YYYY-MM-DD
closure-type: completed    # completed | cancelled | suspended
closure-status: draft      # draft | accepted
---

# Project Closure — <Project Name>

> P3.Express Group F — produced by `/project:close`. Requires human sponsor sign-off.
> Append-only after `closure-status: accepted`.

---

## F01 — Handover

### Delivered

> Deliverables formally accepted by the client (D02 history). Reference `deliverables-map.md`.

| Deliverable | Accepted | Notes |
|---|---|---|
| [Deliverable name] | YYYY-MM-DD | [Reference to spec retrospective if applicable] |

### Out of scope / deferred

> Items that were in the original scope but were excluded, reduced, or deferred by approved change request.

| Item | Reason | Change ref |
|---|---|---|
| [Item] | [Reason] | [FU-NNN] |

### Known defects and follow-on work

> Issues that are not blocking closure but the client's team should be aware of.

- [Description] — owner: [client or team name]

### Archive pointer

| Asset | Location |
|---|---|
| Code repositories | [e.g., github.com/client/repo] |
| Project documents | [e.g., projects/<slug>/ in this repo] |
| Client communications | [e.g., email thread in shared inbox] |
| Signed contracts | [e.g., CRM record #NNNN] |

---

## F02 — Final stakeholder satisfaction

| Source | Score (1–5) | Key themes |
|---|---|---|
| Aggregated E01 scores | X.X / 5 | [themes from health-register.md] |
| Final satisfaction survey | TBD | [to be completed by client] |

**Final satisfaction questionnaire template** (for human to send):
> "Now that the [project name] project is complete, we'd appreciate 2 minutes to capture your feedback. On a scale of 1–5, how satisfied are you with: (a) the delivered product, (b) the delivery process, (c) the project communication? Any comments? [optional free text]"

---

## F03 — Closure peer review

> Self-check against the follow-up register and deliverables map.

| Check | Result | Notes |
|---|---|---|
| All `followup-register.md` items closed or formally carried forward | ✅ / ❌ | |
| All `deliverables-map.md` items accepted, deferred (with change ref), or removed (with change ref) | ✅ / ❌ | |
| Client risks formally transferred or documented for client team | ✅ / ❌ | |

---

## F04 — Archive

All project documents are preserved in `projects/<project-slug>/`. No files are deleted.

**Post-project evaluation scheduled:** YYYY-MM-DD (3–6 months from closure) — run `/project:post`.

---

## F05 — Celebration

The team delivered [brief summary of what was shipped]. Thank you to [names or roles].

---

## F06 — Closure focused-comms note

> Template for the closure announcement. Human to personalise and send.

Subject: [Project Name] — Project Complete

[Client name], we're pleased to confirm that the [project name] project has been formally completed as of [date]. [Two sentences on what was delivered and the key outcome.] Thank you for the opportunity to work with you on this. [Next steps or ongoing support details if applicable.]

---

## Lessons summary

> Aggregated from all `type: lesson` entries in `followup-register.md` and E02 notes in `weekly-log.md`.

### Process

- [Lesson 1]

### Technical

- [Lesson 1]

### Client communication

- [Lesson 1]

---

<!-- Post-project evaluations (Group G) are appended below by /project:post -->
