---
id: QUAL-<DEAL>-001
deal: <deal-slug>
client: <Client Name>
phase: qualify
status: draft         # draft | complete | no-go
verdict: pending      # pursue | no-go | more-info
owner: sales-qualifier
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Qualification — <deal-slug>

## Lead summary

One paragraph: who reached out, via what channel, what they said they need, and the first impression of fit.

## BANT assessment

**Budget**

- Is there an allocated or indicative budget? `yes | no | unknown`
- Amount or range (if disclosed): …
- Budget owner confirmed? `yes | no | unknown`
- Notes: …

**Authority**

- Are we talking to a decision-maker? `yes | no | unknown`
- Who is the Economic Buyer (the person who can sign)? Name + title:
- Who is our Champion (internal advocate)? Name + title:
- Is the Champion the same as the Economic Buyer? `yes | no`
- Notes: …

**Need**

- Is the problem real and documented? `yes | no | unclear`
- Problem statement (in the client's own words):
- Urgency: `critical | high | medium | low`
- What happens if the problem is not solved?
- Notes: …

**Timeline**

- Does the client have a target start date? `yes | no`
- Start date: …
- Target completion / go-live date: …
- Can we staff this when needed? `yes | no | uncertain`
- Notes: …

## MEDDIC scoring (for complex / high-value deals)

| Dimension | Score (0–2) | Evidence | Gap |
|---|---|---|---|
| **M** Metrics — measurable success criteria defined | | | |
| **E** Economic Buyer — identified and engaged | | | |
| **D** Decision Criteria — explicit criteria documented | | | |
| **D** Decision Process — steps and timeline known | | | |
| **I** Identified Pain — pain is quantified and acknowledged | | | |
| **C** Champion — internal advocate identified and active | | | |
| **TOTAL** | /12 | | |

Score guide: 0 = absent, 1 = partial, 2 = confirmed.

**MEDDIC notes:**

- Economic Buyer access: …
- Decision criteria source: …
- Champion engagement level: …

## Five conversational domains audit

Quick yes/no/partial check — ensures we have enough information to scope:

| Domain | Status | Key gaps |
|---|---|---|
| **Business** — goals, stakeholders, org structure | yes / partial / no | |
| **Application** — existing software, integrations, ecosystem | yes / partial / no | |
| **Data** — flows, storage, compliance (GDPR/HIPAA/PCI) | yes / partial / no | |
| **Technology** — infrastructure, CI/CD, deployment constraints | yes / partial / no | |
| **Delivery** — process preferences, communication, QA expectations | yes / partial / no | |

## Competitive landscape

- Are there other providers being evaluated? `yes | no | unknown`
- Known competitors: …
- Our differentiators in this context: …
- Client's primary selection criterion: `price | expertise | speed | relationship | other`

## Strategic fit

- Does this deal align with our target client profile? `yes | partial | no`
- Is the technology stack within our core competency? `yes | partial | no`
- Does this deal open a new market, vertical, or reference case? `yes | no`
- Margin potential: `high | medium | low`

## Win-probability score

| Factor | Weight | Score (1–5) | Weighted |
|---|---|---|---|
| Budget confirmed | 20% | | |
| Champion quality | 25% | | |
| Need urgency | 20% | | |
| Technical fit | 15% | | |
| Relationship strength | 10% | | |
| Competitive advantage | 10% | | |
| **Total** | 100% | | **/5.0** |

Convert to 0–100: multiply by 20. Threshold: ≥ 40 → pursue; < 40 → no-go (unless strategic override).

**Win probability:** ____ / 100

## Red flags

List any signals that suggest risk to delivery, relationship, or margin:

- e.g., Decision-maker not present in discovery call — all contact through an intermediary.
- e.g., Client has already had two previous agency relationships fail on the same project.

## Verdict

**Decision:** `pursue` | `no-go` | `more-info`

**Rationale:** One paragraph justifying the decision.

**If more-info:** Next steps:

| Question | Owner | Due date |
|---|---|---|
| | | |

---

## Quality gate

- [ ] All four BANT dimensions assessed and documented.
- [ ] MEDDIC scored for deals ≥ $50K or with multiple stakeholders.
- [ ] Five conversational domains audited.
- [ ] Win probability score computed and justified.
- [ ] Red flags listed (even if none).
- [ ] Verdict stated (pursue / no-go / more-info).
- [ ] If more-info: next steps listed with owner + due date.
- [ ] Human sign-off on verdict before advancing to Scope.
