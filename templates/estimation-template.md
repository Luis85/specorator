---
id: EST-<DEAL>-001
deal: <deal-slug>
client: <Client Name>
phase: estimate
status: draft         # draft | complete | blocked
owner: estimator
created: YYYY-MM-DD
updated: YYYY-MM-DD
pricing_model: fixed-price | t-and-m | retainer | phased
confidence: high | medium | low   # 80%+ = high, 60-79% = medium, <60% = low
---

# Estimation — <deal-slug>

## Summary

| | Value |
|---|---|
| **Total estimate (central)** | X days |
| **Low end (optimistic + contingency)** | X days |
| **High end (pessimistic + contingency)** | X days |
| **Confidence level** | high / medium / low |
| **Pricing model** | fixed-price / T&M / retainer / phased |
| **Indicative cost range** | €X — €Y |
| **Estimated duration** | X weeks |
| **Estimate basis** | three-point PERT / analogy / expert judgment |

## Assumptions this estimate is conditioned on

> These MUST appear in the SOW as a named exhibit. If any assumption is invalidated, the estimate must be re-run and the SOW repriced via change request.

| ID | Assumption | Impact if wrong |
|---|---|---|
| ASM-001 | | High / Medium / Low |
| ASM-002 | | |

## Work breakdown structure

### Phase 1 — Discovery & Design

| Work package | Optimistic (days) | Most likely (days) | Pessimistic (days) | PERT expected | Notes |
|---|---|---|---|---|---|
| Requirements workshops | | | | | |
| UX research & wireframes | | | | | |
| Architecture decision | | | | | |
| **Phase 1 total** | | | | | |

> PERT formula: E = (O + 4M + P) / 6

### Phase 2 — Core Development

| Work package | Optimistic (days) | Most likely (days) | Pessimistic (days) | PERT expected | Notes |
|---|---|---|---|---|---|
| [Epic: name from scope.md] | | | | | |
| [Epic: name] | | | | | |
| [Epic: name] | | | | | |
| **Phase 2 total** | | | | | |

### Phase 3 — Integrations

| Work package | Optimistic (days) | Most likely (days) | Pessimistic (days) | PERT expected | Notes |
|---|---|---|---|---|---|
| [Integration: name from scope.md] | | | | | |
| [Integration: name] | | | | | |
| **Phase 3 total** | | | | | |

### Phase 4 — Testing & QA

| Work package | Optimistic (days) | Most likely (days) | Pessimistic (days) | PERT expected | Notes |
|---|---|---|---|---|---|
| Integration testing | | | | | |
| UAT support | | | | | |
| Performance / security testing | | | | | |
| **Phase 4 total** | | | | | |

### Phase 5 — Deployment & Stabilisation

| Work package | Optimistic (days) | Most likely (days) | Pessimistic (days) | PERT expected | Notes |
|---|---|---|---|---|---|
| Infrastructure setup | | | | | |
| Deployment & migration | | | | | |
| Post-launch stabilisation (2 weeks) | | | | | |
| **Phase 5 total** | | | | | |

### Project management & communication overhead

| Work package | Optimistic (days) | Most likely (days) | Pessimistic (days) | PERT expected | Notes |
|---|---|---|---|---|---|
| Project management (all phases) | | | | | |
| Client communication overhead | | | | | |
| Documentation | | | | | |
| **PM total** | | | | | |

## Totals before risk adjustment

| | Days |
|---|---|
| **Base estimate (sum of PERT expected values)** | |
| **Standard deviation (√(Σ SD²))** | |
| **80% confidence interval (Base + 0.84 × SD)** | |

## Risk register

| ID | Risk description | Probability | Impact | Mitigation | Included in estimate? |
|---|---|---|---|---|---|
| RSK-001 | | H / M / L | H / M / L | | yes / no / contingency |
| RSK-002 | Undiscovered integrations beyond scope | M | H | Explicit out-of-scope clause + change order trigger | yes |
| RSK-003 | Client feedback cycles exceed SLA | M | M | Defined response SLA in SOW; delays shift timeline | no |
| RSK-004 | Third-party API constraints unknown | M | H | Spike budget in Phase 1; re-estimate if blocked | contingency |
| RSK-005 | Team availability disruption | L | M | Buffer in Phase 4/5 estimates | yes |

> Minimum 5 risks required. Mark "included in estimate" as `yes` (baked into hours), `no` (not covered, will be a change order if triggered), or `contingency` (covered by the contingency line).

## Risk multiplier

| Factor | Level (1–3) | Multiplier contribution |
|---|---|---|
| Scope novelty (how new is this type of project for us?) | | |
| Technical risk (unknown third-party systems, legacy integrations?) | | |
| Client responsiveness history | | |
| Team familiarity with this stack | | |
| **Risk multiplier (1.0 – 1.5×)** | | |

Notes on multiplier rationale:

## Contingency

| Item | Days | Rationale |
|---|---|---|
| Base contingency (15% of base estimate for known unknowns) | | |
| Risk contingency (for RSK items marked "contingency") | | |
| **Total contingency** | | |

## Final estimate

| | Days |
|---|---|
| **Base estimate** | |
| **× Risk multiplier** | |
| **+ Contingency** | |
| **Total (central)** | |
| **Low end** (optimistic base × 1.0, minimum contingency) | |
| **High end** (pessimistic base × risk multiplier + full contingency) | |

## Pricing model recommendation

**Recommended model:** fixed-price | T&M | retainer | phased

**Rationale** (reference the decision criteria in `docs/sales-cycle.md` §5):

**For fixed-price:**
- Price floor (80% confidence interval): €X
- Recommended quoted price: €Y (includes full contingency)
- NTE not applicable (risk is provider's)

**For T&M:**
- Day rates: Senior: €___, Mid: €___, Junior: €___
- Estimated range: €X – €Y
- Not-to-exceed cap (NTE): €Z (recommend 120% of central estimate)
- Invoicing: monthly in arrears

**For phased (paid discovery → fixed build):**
- Phase 1 (paid discovery): T&M, €X, duration N weeks
- Phase 2 (build): Fixed price, €Y (after Phase 1 scope refinement), duration N weeks
- Rationale for split:

## Payment milestone schedule

| Milestone | % of total | Amount | Trigger |
|---|---|---|---|
| Contract signature | 30% | | |
| End of design / UAT ready | 40% | | |
| Go-live / final acceptance | 30% | | |

## Team composition

| Role | Allocation | Duration |
|---|---|---|
| Project Manager | | full project |
| Lead Architect | | Phases 1–2 |
| Senior Developer | | Phases 2–3 |
| Developer | | Phases 2–4 |
| QA Engineer | | Phases 4–5 |
| UX Designer | | Phase 1 |

**Engineering sign-off:** This estimate has been reviewed by the technical lead who will work on the project.
Reviewed by: _______________ Date: _______________

---

## Quality gate

- [ ] WBS covers all in-scope deliverables from `scope.md`.
- [ ] Three-point estimates (O / M / P) recorded for each work package.
- [ ] PERT totals computed; confidence interval stated.
- [ ] Risk register has ≥ 5 entries (probability, impact, mitigation, in-estimate flag).
- [ ] Risk multiplier applied and justified.
- [ ] Contingency line item explicit (not absorbed silently).
- [ ] Pricing model chosen with rationale.
- [ ] Cost expressed as a range (low / central / high), not a single number.
- [ ] Payment milestone schedule proposed.
- [ ] Engineering sign-off obtained (not sales-only estimate).
- [ ] Assumptions register complete and will be attached to SOW as exhibit.
