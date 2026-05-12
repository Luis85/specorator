---
id: VALID-<SPRINT>-001
title: <Sprint title> — validation
phase: validate
sprint: <sprint-slug>
status: draft               # draft | complete
owner: facilitator
consulted:
  - user-researcher
  - critic
inputs:
  - discovery/<sprint-slug>/prototype.md
verdict: pending             # go | no-go | pivot | pending
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Validation — <Sprint title>

> Phase 5 — *Deliver (test).* Put the prototype in front of a real human and learn.
> Aim for ≥ 5 sessions per concept (Sprint 2.0 / Nielsen heuristic).

## Sessions

| Session | Concept | Participant (segment) | Date | Format | Notes link |
|---|---|---|---|---|---|
| S-01 | C-001 | <segment> | YYYY-MM-DD | in-person / remote | … |
| S-02 | C-001 | … | … | … | … |
| S-03 | C-001 | … | … | … | … |
| S-04 | C-002 | … | … | … | … |
| S-05 | C-002 | … | … | … | … |

## Hypothesis verdicts

For each shortlisted concept, mark the riskiest-assumption hypothesis as **supported / refuted / inconclusive**, with the falsification criterion from `prototype.md` evaluated against the actual session data.

### C-001 — <concept name>

- **Hypothesis** — *(from prototype.md)*
- **Falsification criterion** — *(from prototype.md)*
- **Observed** — *(quantitative result: e.g. "3 of 5 sessions failed at panel 7")*
- **Verdict** — **supported | refuted | inconclusive**
- **Verbatim quotes** — capture 2–4 representative quotes. Quotes, not summaries.

  > *"I have no idea what this button does." — S-02*
  >
  > *"Oh, that's clever — I'd actually pay for this." — S-04*

### C-002 — …

## Playtest 4-measure scoring

For each concept, score the four playcentric measures (1–5 each).

| Concept | Functionality | Completeness | Balance | Engagement | Notes |
|---|---|---|---|---|---|
| C-001 | 4 | 3 | 2 | 5 | strong engagement, balance issue at panel 9 |
| C-002 | 2 | 2 | 4 | 2 | … |

## JTBD post-test — Forces of Progress

Did the prototype shift the four forces?

| Concept | Push (↑↓) | Pull (↑↓) | Anxiety (↑↓) | Habit (↑↓) | Net switch likely? |
|---|---|---|---|---|---|
| C-001 | ↑ | ↑↑ | ↓ | → | yes |
| C-002 | → | ↑ | ↑ | → | no |

## Surprises and serendipity

What did we learn that we did not set out to learn? Often the most valuable Phase 5 output.

- *(e.g., "Three participants asked whether the feature could be triggered by voice — none of our concepts considered voice as input.")*

## Sprint verdict

Set `verdict:` in the frontmatter. Pick exactly one:

- **Go** — ≥ 1 concept's hypothesis was *supported* and a Decider has authorised handoff. Proceed to `/discovery:handoff`.
- **No-go** — every concept's hypothesis was *refuted*. The sprint closes. The lessons are still valuable; capture them in **What we'd test next**.
- **Pivot** — validation surfaced a different opportunity than what was framed. Either re-run Phase 1 with the new framing or close this sprint and open a fresh one.

> *Verdict:* `<go | no-go | pivot>` · *Sign-off:* <name> · *Date:* YYYY-MM-DD

## What we'd test next

Even on **Go**, list the next-riskiest assumptions that the prototype did *not* test. These flow into the chosen-brief's open questions and ultimately into Stage 2 (Research).

- A-002 — long-term engagement
- A-003 — willingness-to-pay
- A-004 — operational cost at scale

---

## Quality gate

- [ ] ≥ 3 sessions per concept (≥ 5 strongly recommended).
- [ ] Each hypothesis is marked supported / refuted / inconclusive against its falsification criterion.
- [ ] Verbatim quotes captured (not summaries).
- [ ] Playtest 4 measures scored for each concept.
- [ ] JTBD post-test forces captured.
- [ ] Surprises section is not empty (a real test surfaces something unexpected).
- [ ] Sprint verdict set: `go | no-go | pivot`.
- [ ] What-we'd-test-next list is populated.
