---
id: SCOPE-<DEAL>-001
deal: <deal-slug>
client: <Client Name>
phase: scope
status: draft         # draft | complete | blocked
owner: scoping-facilitator
created: YYYY-MM-DD
updated: YYYY-MM-DD
workshop_date: YYYY-MM-DD
workshop_format: remote | in-person | async
attendees: []
---

# Scope — <deal-slug>

## Problem statement

> Write this in the client's language, not ours. One to three paragraphs. Distinguish the underlying problem from the stated request.

**Stated request** (what the client asked for):

**Underlying problem** (why they actually need it):

**Business impact of the problem** (what happens if it isn't solved):

**Measurable success criteria** (how the client will know the solution worked):

## Stakeholder map

| Name | Role | Type | Communication | Notes |
|---|---|---|---|---|
| | | User / Approver / Champion / Veto | email / Slack / call | |

- **User**: will use the delivered software day-to-day.
- **Approver**: signs off on deliverables and payment.
- **Champion**: actively promotes this engagement internally.
- **Veto**: can block or kill the project (technical, legal, procurement).

## Solution direction

One paragraph describing the solution space we are proposing to explore. Not a technical spec — a direction statement that the client agreed to during the workshop.

## In scope

> List the agreed deliverables, features, and work packages. Use the format: [Phase] — [Epic description].

### Phase 1 — [e.g., Discovery & Design]

| Epic | MoSCoW | Notes |
|---|---|---|
| | M / S / C / W | |

### Phase 2 — [e.g., Core Build]

| Epic | MoSCoW | Notes |
|---|---|---|
| | M / S / C / W | |

### Phase 3 — [e.g., Integrations & Launch]

| Epic | MoSCoW | Notes |
|---|---|---|
| | M / S / C / W | |

**MoSCoW key:** M = Must-have, S = Should-have, C = Could-have, W = Won't-have (this phase).

## Out of scope (explicit)

> This section is as important as the in-scope list. Every item listed here is protected from scope creep without a change request.

- …
- …
- …

## Grey zone (to be resolved)

> Items that came up in the workshop but weren't definitively placed in or out of scope. Each must be resolved before the proposal is sent.

| Item | Likely classification | Owner | Due date |
|---|---|---|---|
| | in / out / change request | | |

## Non-functional requirements (headline)

> These drive architecture and cost. Capture them now at a headline level; the architect will detail them in the spec.

| NFR | Requirement | Priority |
|---|---|---|
| Performance | e.g., Page load < 2s under 1000 concurrent users | H / M / L |
| Availability | e.g., 99.9% uptime, 4h RTO | H / M / L |
| Security | e.g., OWASP Top 10, penetration test required | H / M / L |
| Compliance | e.g., GDPR, HIPAA, PCI-DSS, ISO 27001 | H / M / L |
| Scalability | e.g., 10× current load within 18 months | H / M / L |
| Data residency | e.g., EU only, no data outside <region> | H / M / L |
| Accessibility | e.g., WCAG 2.1 AA | H / M / L |
| Other | | |

## Dependencies and integrations

| System / Service | Type | Direction | Owner | Known constraints |
|---|---|---|---|---|
| | existing system / third-party API / data migration / infrastructure | inbound / outbound / bidirectional | client / provider / third party | |

## Technical constraints

> Any existing technology choices the solution must respect. These become hard constraints for the architect.

- Existing tech stack: …
- Preferred / mandated languages or frameworks: …
- Deployment environment: …
- Infrastructure constraints: …
- Data migration requirements: …

## Paid discovery recommendation

> For large or technically uncertain scope, recommend a bounded paid discovery phase before the full SOW.

- **Paid discovery recommended?** `yes | no`
- **Rationale** (what unknowns prevent confident estimation?):
- **Proposed format** (duration, deliverables, price):
- **Deliverable at end of paid discovery**: architecture decision record + refined scope + updated estimate.

## Open questions

> Every unresolved question that will affect scope, estimate, or proposal. None may be left unowned.

| ID | Question | Impact if unresolved | Owner | Due date |
|---|---|---|---|---|
| OQ-001 | | | | |
| OQ-002 | | | | |

## Workshop notes

> Anything significant that came out of the workshop that doesn't fit elsewhere — decisions made, concerns raised, exact quotes that should inform the proposal tone.

---

## Quality gate

- [ ] Problem statement distinguishes underlying problem from stated request.
- [ ] Measurable success criteria stated.
- [ ] Stakeholder map complete (user, approver, champion, veto identified).
- [ ] In-scope list complete with MoSCoW classification.
- [ ] Out-of-scope list is explicit and non-empty.
- [ ] Grey-zone items listed with owners and due dates.
- [ ] NFRs captured (at least security, compliance, performance, availability).
- [ ] All dependencies and integrations listed.
- [ ] Open questions owned and dated (none left unowned).
- [ ] Paid discovery recommendation made (yes or no with rationale).
- [ ] Client sign-off on scope boundary before advancing to Estimate.
