# Idea Draft: Gamified Issue → Tasks → Agentic Resolution → PR Review Workflow

## Problem framing

Specorator's workflow can be cognitively heavy across long feature cycles. A lightweight gamification layer could increase sustained contribution cadence and reduce drop-off between stages (idea, requirements, tasks, implementation, review).

## Web research highlights (2023–2026)

1. **Gamification in software engineering shows mixed-but-often-positive effects when mechanics are tied to meaningful work outcomes, not vanity metrics.**
   - A 2024 systematic review in software engineering education/training found motivation and engagement gains are common, but effect size and durability depend on context and implementation quality.

2. **Badges alone are weak; social meaning and progression design matter.**
   - 2023/2024 research on GitHub personal achievements shows badges spread quickly but are interpreted as noisy signals unless aligned with visible, trusted competence.

3. **Leaderboard-heavy systems can backfire.**
   - Broad gamification literature and Stack Overflow reputation studies indicate highly competitive mechanics can discourage newcomers, incentivize gaming behavior, and skew effort toward point-maximizing activities.

4. **Idle/incremental loops fit long-running async work if they reward consistency, not raw speed.**
   - Idle game design patterns (small frequent feedback + long horizon progression) map well to issue/task pipelines where latency is normal (reviews, CI, stakeholder approvals).

5. **Anti-gaming controls are essential in developer workflows.**
   - Incentive systems in Q&A/dev communities can be exploited (low-value activity for points). Production systems should include quality multipliers and caps.

## Design implications for this repository

### A. Reward model (quality-first)
- Base XP only for meaningful transitions:
  - Issue scoped/accepted
  - Task decomposition complete
  - PR opened against `develop`
  - PR merged after review
  - Post-merge cleanup completed
- Quality multipliers:
  - CI green first pass
  - Review latency improvements
  - Low rework / minimal reopen
- Penalties / dampeners:
  - Reopened PRs due to avoidable misses
  - Failing mandatory gates repeatedly

### B. Idle-game layer
- "Passive generation" from healthy work-in-progress that advances checkpoints over time (e.g., requirement completeness, review responsiveness).
- "Active boosts" for focused actions (finishing tests, resolving reviewer comments, writing release notes).
- Periodic "prestige" reset per sprint/release cycle:
  - Reset transient points
  - Keep meta-progression (titles/perks unlocked)

### C. Avoiding harmful incentives
- Do **not** reward raw commit count, comment count, or LOC.
- Cap daily score from low-value repetitive actions.
- Show private self-progress by default; opt-in public leaderboards.
- Add team goals to prevent winner-takes-all behavior.

### D. Data model candidates
- Event stream sourced from GitHub metadata:
  - issue_opened, issue_labeled, tasks_defined, pr_opened, ci_green, review_requested, review_addressed, pr_merged
- Score function should be transparent and versioned.
- Keep an "explain score" endpoint/UI panel for trust.

## Proposed MVP experiment (4–6 weeks)

1. **Cohort:** opt-in contributors only.
2. **Mechanics:** levels, streaks, milestones, no global leaderboard in phase 1.
3. **Success metrics:**
   - Median issue-to-PR cycle time
   - Review turnaround time
   - Reopen rate
   - Contributor retention across 2+ cycles
4. **Guardrails:**
   - Weekly anomaly checks for gaming
   - Kill switch for any mechanic increasing review noise or low-quality churn

## Risks
- Metric gaming and shallow work optimization
- Contributor stress from always-on signals
- Fairness concerns across different role types (author/reviewer/maintainer)

## Recommendation
Proceed with a **small opt-in MVP** that prioritizes:
1. quality-gated progression,
2. private progress loops over public ranking,
3. transparent scoring with auditability,
4. explicit rollback criteria.

If the maintainer approves, the next step is to convert this into:
- `specs/<slug>/idea.md` and
- `specs/<slug>/workflow-state.md` at idea stage,
then run the normal intake path before implementation.
