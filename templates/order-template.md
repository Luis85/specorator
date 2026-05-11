---
id: ORDER-<DEAL>-001
deal: <deal-slug>
client: <Client Name>
phase: order
status: draft         # draft | accepted | closed
owner: proposal-writer
created: YYYY-MM-DD
updated: YYYY-MM-DD
accepted_date: YYYY-MM-DD
proposal_version: v1.0
contract_reference: <PO number / MSA reference / signed PDF filename>
delivery_workflow: discovery | spec   # which downstream workflow to open
delivery_slug: <feature-or-sprint-slug>
---

# Order — <deal-slug>

## Acceptance record

| Field | Value |
|---|---|
| **Accepted proposal** | PROP-<DEAL>-001 v1.0 (or note the accepted version) |
| **Acceptance date** | YYYY-MM-DD |
| **Acceptance form** | email / signed PDF / digital signature / PO |
| **Contract / PO reference** | |
| **Accepted by** | Name, title |
| **Provider sign-off** | Name, title |

## Negotiated changes from proposal

> Document all changes agreed during negotiation. If none, state "None — accepted as submitted."

| Item | Original (proposal) | Agreed (order) | Reason |
|---|---|---|---|
| | | | |

## Financial summary

| Item | Amount |
|---|---|
| **Total contract value** | €X |
| **Pricing model** | fixed-price / T&M (NTE €Y) / retainer |
| **First invoice** | €X, due YYYY-MM-DD |
| **Payment schedule** | milestone / monthly / other |

---

## Project Kickoff Brief

> This section is the canonical handoff from commercial to delivery. Every agent and human joining the delivery team must read this. Write it for someone who was not in any of the sales conversations.

### 1. Client context

**Who they are:** [Company name, size, industry, location]

**Why this project matters to them now:** [Business driver — new product, competitive pressure, compliance deadline, efficiency initiative, etc.]

**Our relationship history:** [First engagement / existing client — how long, what trust has been established]

### 2. Problem statement

> Copy verbatim from `scope.md`. Do not paraphrase — the delivery team should speak the client's language.

[Insert problem statement from scope.md]

**Measurable success criteria:**
[Insert from scope.md]

### 3. Agreed scope summary

**In scope (must-haves):**
[List the Must-have epics from scope.md — the non-negotiable core]

**In scope (should-haves and could-haves):**
[List with note that these are subject to time and budget]

**Explicitly out of scope:**
[Copy the out-of-scope list from proposal.md]

**Deferred to a future phase:**
[Items that came up in scoping but were explicitly deferred]

### 4. Budget and timeline

| Item | Value |
|---|---|
| **Total budget** | €X |
| **Budget shared with client?** | yes / no / partial |
| **Required go-live date** | YYYY-MM-DD |
| **Hard deadline?** | yes / no — if yes, reason: |
| **Timeline buffer** | X weeks |
| **First payment milestone** | YYYY-MM-DD |

### 5. Key stakeholders

| Name | Role | Contact | Availability | Notes |
|---|---|---|---|---|
| | Primary contact / day-to-day | | | |
| | Economic buyer / approver | | | Prefers summary-level updates |
| | Champion | | | Advocates internally for us |
| | Technical contact | | | |
| | Veto stakeholder | | | Sceptical — needs evidence |

**Who NOT to go around:** [Any political sensitivity about bypassing certain stakeholders]

**Preferred communication style:** [Formal / informal / high-frequency / weekly summaries / etc.]

### 6. Non-negotiables

> Things the client said must not change, no matter what. Violating these will damage the relationship.

- …
- …
- …

### 7. Political considerations

> Things not in the contract but important for the team to navigate successfully. Handle with discretion.

- …
- …
- …

### 8. Assumptions inherited from the proposal

> The delivery team is responsible for validating these. Any assumption that proves false must be escalated immediately — it is a potential change-order trigger.

| ID | Assumption | Status | Owner |
|---|---|---|---|
| ASM-001 | | unvalidated | |
| ASM-002 | Client will provide system access within 5 business days | unvalidated | PM |

### 9. Open questions carried into delivery

> These were unresolved at contract close. Priority: resolve in sprint 1 / kickoff.

| ID | Question | Impact | Owner | Due |
|---|---|---|---|---|
| OQ-001 | | | | |

### 10. Red flags from pre-sales

> Signals from the sales process that the delivery team should watch for. Not for the client — internal only.

- …
- …

### 11. Downstream workflow entry point

**Entry point:** `/discovery:start <sprint-slug>` | `/spec:start <feature-slug>`

**Slug:** `<deal-slug>` or a derived feature slug

**Rationale for entry point choice:**
- Use `/discovery:start` if: the solution direction is still exploratory, the client expects the delivery team to iterate on the problem, or a design sprint is expected.
- Use `/spec:start` if: the scope is well-defined, a clear brief exists (the scope.md + order.md constitute the brief), and the team can move directly to /spec:idea.

**Pre-loaded context for the analyst / facilitator:**
The `Project Kickoff Brief` above serves as the `chosen-brief.md` for `/spec:idea` or the `frame.md` seed for `/discovery:frame`. The analyst must read this document as the primary input to Stage 1.

---

## Kickoff logistics

| Item | Value |
|---|---|
| **Welcome email sent** | YYYY-MM-DD HH:MM (target: within 1 hour of signature) |
| **Internal sales → PM handoff call** | YYYY-MM-DD (target: within 24 hours) |
| **Client kickoff meeting** | YYYY-MM-DD (target: within 3–5 business days) |
| **Full onboarding complete** | YYYY-MM-DD (target: within 7 business days) |

**Kickoff meeting agenda:**
1. Introductions (full team)
2. Project overview (PM presents their understanding — client corrects if wrong)
3. Communication and working model (tools, cadence, escalation)
4. First milestone and schedule
5. Immediate actions (client: system access, contacts; provider: environment setup)
6. Open questions resolution plan

---

## Quality gate

- [ ] Acceptance record complete (accepted proposal version, date, form, reference).
- [ ] Negotiated changes documented (even if none).
- [ ] Project Kickoff Brief complete — all 11 sections present and non-empty.
- [ ] Downstream workflow entry point stated and justified.
- [ ] Red flags documented for delivery team.
- [ ] Welcome email sent within 1 hour of signature.
- [ ] Internal PM briefing scheduled within 24 hours.
- [ ] Client kickoff scheduled within 5 business days.
- [ ] Human sign-off before `status: accepted`.
- [ ] `deal-state.md` updated to `status: ordered`, `current_phase: ordered`.
