---
id: PROTO-<SPRINT>-001
title: <Sprint title> — prototype
phase: prototype
sprint: <sprint-slug>
status: draft               # draft | complete
owner: facilitator
consulted:
  - prototyper
  - game-designer
inputs:
  - discovery/<sprint-slug>/convergence.md
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Prototype — <Sprint title>

> Phase 4 — *Deliver (build).* Make the shortlist testable in a day, not a sprint.
> "Fake it" philosophy: build only what the user will see. Functionality > aesthetics.

## Prototypes

One section per shortlisted concept. Each section is detailed enough that **a non-designer could run a playtest with it** without asking the prototyper for help.

### C-001 — <concept name>

#### Hypothesis

Re-state the riskiest assumption from `convergence.md`, framed as a falsifiable hypothesis:

> *We believe that <user segment> will <expected behavior> when given <prototype>. We will know this is true if <observable signal> in ≥ <threshold>% of sessions.*

#### Storyboard (10–15 panels)

| Panel | What the user sees | What the user does | What happens next |
|---|---|---|---|
| 1 | Cold open: the user encounters … | … | … |
| 2 | … | … | … |
| 3 | … | … | … |
| … | … | … | … |
| 15 | Resolution: … | … | … |

> Panels can be sketches (link from `discovery/<sprint-slug>/assets/storyboards/c-001/`), screenshots, or prose descriptions. Resist the urge to make them pretty.

#### Prototype style and assets

- **Style:** *paper prototype | Wizard-of-Oz | Frankenstein screenshots | clickable lo-fi | fake landing page*
- **Materials list:** *(cards, dice, tokens, sticky notes, paper screens, etc., or a list of files)*
- **Wizard role(s):** *(if any — what the human pretending to be the system has to do)*
- **Fidelity boundary:** what is faked vs. what is real. *(e.g., "results screen is fake; the input form is a real Google Form")*

#### Test script (for the playtest facilitator)

1. Greet the participant. Ask for verbal consent to record / take notes.
2. State the scenario: *"Imagine you are <persona> trying to <job>. Walk me through what you'd do."*
3. Hand them the prototype. **Do not explain.** ([Think Aloud](https://docs.idew.org/project-video-game/project-instructions/2-design-and-build-solution/2.4-playtest-paper-prototype) — let them narrate.)
4. Note: where do they hesitate? Where do they expect feedback that isn't there?
5. Record verbatim quotes with timestamps.
6. Post-test: ask the four JTBD forces (Push / Pull / Anxiety / Habit). Did the prototype shift any?

#### Game-design lens checks

- **MDA traceability** — do the prototype's mechanics produce the intended dynamics and aesthetic?
- **Core loop visibility** — can the user complete one full action → reward → motivation cycle within 60 seconds of the prototype start?
- **Schell lens spot-check** — apply lens #14 *Problem Statement* and lens #71 *The Player*. Does the prototype actually address the problem for the actual player, not the imagined one?

### C-002 — …

*(Repeat for each shortlisted concept.)*

## What we deliberately did NOT prototype

The riskiest-assumption test only covers the riskiest assumption. List the other assumptions left unprototyped, so Phase 5 doesn't accidentally claim they were validated.

- A-001 — willingness-to-pay (not in this prototype; will be tested separately).
- A-002 — long-term engagement (multi-week behavior — can't be tested in 1-day playtest).

---

## Quality gate

- [ ] Each shortlisted concept has a storyboard of 10–15 panels.
- [ ] Each prototype has a falsifiable hypothesis with a quantitative threshold.
- [ ] Each prototype has a non-designer-runnable test script.
- [ ] Materials list / fidelity boundary documented for each prototype.
- [ ] Game-design lens checks completed (MDA traceability, core loop visibility, ≥ 1 Schell lens).
- [ ] What we did NOT prototype is explicit.
