---
id: PROP-<DEAL>-001
deal: <deal-slug>
client: <Client Name>
version: v1.0
phase: propose
status: draft         # draft | internal-review | sent | accepted | rejected | superseded
owner: proposal-writer
created: YYYY-MM-DD
updated: YYYY-MM-DD
valid_until: YYYY-MM-DD
pricing_model: fixed-price | t-and-m | retainer | phased
total_price: TBD
---

# Proposal — <deal-slug>

> **Version history:** v1.0 YYYY-MM-DD — initial draft.
>
> Subsequent versions move to `revisions/proposal-v2.md`, etc. This file always contains the current accepted version.

---

## Cover page

**Proposal for:** [Client Name]  
**Prepared by:** [Provider Name]  
**Date:** YYYY-MM-DD  
**Valid until:** YYYY-MM-DD  
**Reference:** PROP-<DEAL>-001 v1.0  
**Contact:** [Name, email, phone]

---

## 1. Executive summary

> ≤ 1 page. Readable by a non-technical stakeholder in under 5 minutes. Leads with the client's problem, not our capabilities.

**The problem you are solving:**
[Restate the problem statement from `scope.md` in the client's language.]

**Our proposed solution:**
[One paragraph: what we will build, what approach we will take, what outcome the client will see.]

**Why [Provider]:**
[Two to three differentiating points specific to this engagement — not a generic agency pitch.]

**Investment:**
[Headline price or range and timeline — one line.]

---

## 2. Our understanding of your situation

> Demonstrate that we listened. Restate the client's context, the underlying problem, the success criteria they defined, and the constraints. Any significant misalignment surfaces here before it becomes a contract dispute.

### Business context
[Who the client is, the business they are in, the strategic pressure driving this project.]

### The problem
[Problem statement from `scope.md`, verbatim or lightly paraphrased.]

### What success looks like
[The measurable success criteria from `scope.md`.]

### Constraints we are working within
[Budget range, timeline, technical constraints, compliance requirements, integration dependencies.]

---

## 3. Proposed solution

### Solution overview
[What we are building. Architecture direction, platform choice, key design decisions — at a level appropriate for the audience. If a technical section follows, this stays non-technical.]

### Approach and methodology
[Agile / Scrum / Kanban / phased waterfall — describe how the team will work. Sprint cadence, ceremony set (if agile), review gates, escalation protocol.]

### Team
[Roles, named leads where possible, relevant experience in this domain. Include a paragraph on why this specific team is the right fit.]

### Communication and reporting
[Meeting cadence, status report format, primary communication channel, escalation path, what we expect from the client in return (response SLA).]

---

## 4. Scope of work

### In-scope deliverables

> Itemised list with acceptance criteria per deliverable. Vague deliverables ("a working application") are not acceptable — each item should be specific enough to be testable.

| # | Deliverable | Acceptance criteria | Phase |
|---|---|---|---|
| D-001 | | | |
| D-002 | | | |

### Phased timeline

| Phase | Description | Duration | Key milestone | Client action required |
|---|---|---|---|---|
| 1 | Discovery & design | | | |
| 2 | Core development | | | |
| 3 | Integration & testing | | | |
| 4 | Deployment & launch | | | |
| 5 | Stabilisation | | | |

**Important dates:**
- Project start: YYYY-MM-DD (conditional on contract signature by YYYY-MM-DD)
- UAT start: YYYY-MM-DD
- Go-live: YYYY-MM-DD

### Explicit exclusions

> This list is as important as the in-scope list. Everything here requires a change request.

- …
- …
- …

---

## 5. Technical approach

> Include only if the audience includes technical or procurement reviewers. Remove or collapse for purely business-audience proposals.

### Architecture overview
[High-level architecture diagram or description: components, data flows, integration points.]

### Technology stack
[Languages, frameworks, cloud provider, CI/CD toolchain. Rationale for each key choice.]

### Non-functional requirements approach
[How we address the NFRs from `scope.md`: performance strategy, security posture, compliance controls, availability design.]

### Integration approach
[How each third-party or legacy system integration will be handled: approach, risk, assumption.]

---

## 6. Pricing and payment

### Pricing model: [Fixed price / T&M / Retainer / Phased]

[Rationale for chosen model in 2–3 sentences.]

**For fixed price:**

| Phase | Description | Price |
|---|---|---|
| 1 | Discovery & design | €X |
| 2 | Core development | €Y |
| 3 | Integration & testing | €Z |
| 4 | Deployment & launch | €W |
| **Total** | | **€TOTAL** |

**Payment schedule:**

| Milestone | % | Amount | Due date |
|---|---|---|---|
| Contract signature | 30% | €X | YYYY-MM-DD |
| End of design (milestone 1 accepted) | 40% | €Y | YYYY-MM-DD |
| Go-live (final acceptance) | 30% | €Z | YYYY-MM-DD |

> Payment is due within [14 / 30] days of invoice. Late payment incurs [N]% per month.

**For T&M / phased:** *(replace the fixed-price table above)*

| Role | Day rate | Estimated days (range) | Estimated cost (range) |
|---|---|---|---|
| Senior Developer | €X | | |
| | | | |
| **NTE cap** | | | **€NTE** |

---

## 7. Assumptions and exclusions

> **These are contractual.** If any assumption is invalidated, [Provider] will issue a change request. The client accepting this proposal accepts these assumptions.

| ID | Assumption | Risk if wrong |
|---|---|---|
| ASM-001 | | |
| ASM-002 | The client will provide access to all required systems within 5 business days of project start | Timeline impact |
| ASM-003 | Decisions on deliverable sign-off will be made within 5 business days of presentation | Timeline impact |
| ASM-004 | The existing [system] API is documented and stable | Cost and timeline impact |

---

## 8. Change control

Any work not listed in the scope of work requires a change request.

**Process:**
1. Change requested (client or provider) in writing.
2. [Provider] assesses impact on scope, timeline, and cost within [5] business days.
3. Client approves or declines the change order in writing.
4. Approved changes are incorporated into the next sprint / phase.

**Pricing:** change requests are priced at agreed day rates plus [10%] project management overhead.

---

## 9. Our working model

**What we need from you:**

- A named primary contact with authority to approve deliverables.
- Feedback on deliverables within [5] business days of presentation.
- Access to required systems, data, and stakeholders within [5] business days of project start.
- Timely decisions when design or technical choices require your input.

**What you can expect from us:**

- Weekly written status update.
- Dedicated [Slack / Teams / email] channel for day-to-day communication.
- Escalation response within [4] business hours.
- No surprises: if we foresee a risk to timeline or budget, we tell you in advance.

---

## 10. Next steps

When you are ready to proceed:

1. Review and sign the attached Statement of Work (or reply to this email with acceptance).
2. We will issue the first invoice (30% of total / first month's retainer) upon signature.
3. A project kickoff meeting will be scheduled within [3] business days of signature.
4. We will onboard the delivery team and send a welcome pack within [5] business days.

---

## 11. About [Provider]

[2–3 paragraphs: company background, relevant capabilities, team size, relevant client list if permitted.]

### Relevant case studies

**[Client / Project name]**
[Industry, problem, solution, outcome — 3–5 sentences.]

**[Client / Project name]**
[Industry, problem, solution, outcome — 3–5 sentences.]

---

## 12. Terms and conditions

[Reference to Master Services Agreement, or include standard terms as an appendix. Minimum required clauses: IP ownership, confidentiality, liability cap, governing law, dispute resolution.]

---

## Internal review checklist (remove before sending)

- [ ] All assumptions validated against `scope.md` and `estimation.md`.
- [ ] Price matches `estimation.md` figures (including contingency).
- [ ] Out-of-scope list is non-empty and explicit.
- [ ] Change-control process defined.
- [ ] Payment schedule includes a late-payment clause.
- [ ] Validity period set.
- [ ] Executive summary is ≤ 1 page and leads with the client's problem.
- [ ] No internal cost breakdown, rate cards, or margin data visible in the client-facing version.
- [ ] Legal / risk review completed if deal is ≥ €50K.
- [ ] Reviewed by the PM or tech lead who will work on the project (not sales alone).
- [ ] Red-flag items from qualification noted for PM awareness.

---

## Quality gate

- [ ] All 12 proposal sections present.
- [ ] Executive summary ≤ 1 page.
- [ ] Assumptions section non-empty with risk column.
- [ ] Explicit exclusions list non-empty.
- [ ] Change-control process defined.
- [ ] Pricing matches `estimation.md`.
- [ ] Validity period stated.
- [ ] Internal review checklist complete.
- [ ] Human decision to send (not automated).
