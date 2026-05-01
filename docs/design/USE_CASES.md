# Specorator — Use Case Catalogue

**Derived from:** Wireframe designs, flow artboards, and engineering spec (v0.1)  
**Format:** Structured use cases with actor, trigger, preconditions, main flow, alternate flows, and postconditions  
**Last updated:** May 2026

---

## Index

### Domain A · Feature lifecycle
- [UC-01 Create a new feature](#uc-01-create-a-new-feature)
- [UC-02 Open the cockpit and restore context](#uc-02-open-the-cockpit-and-restore-context)
- [UC-03 Hand off a step](#uc-03-hand-off-a-step)
- [UC-04 Skip a step](#uc-04-skip-a-step)
- [UC-05 Close a feature (archive)](#uc-05-close-a-feature-archive)
- [UC-06 Abandon a feature](#uc-06-abandon-a-feature)
- [UC-07 Re-open an archived feature](#uc-07-re-open-an-archived-feature)
- [UC-08 Switch between features](#uc-08-switch-between-features)

### Domain B · Gate review
- [UC-09 Approach and enter a gate](#uc-09-approach-and-enter-a-gate)
- [UC-10 Fix a failing gate check](#uc-10-fix-a-failing-gate-check)
- [UC-11 Cross a gate](#uc-11-cross-a-gate)
- [UC-12 Override a failing gate check](#uc-12-override-a-failing-gate-check)
- [UC-13 Re-run gate checks manually](#uc-13-re-run-gate-checks-manually)

### Domain C · Open questions
- [UC-14 Write an open question](#uc-14-write-an-open-question)
- [UC-15 View all open questions for a feature](#uc-15-view-all-open-questions-for-a-feature)
- [UC-16 Resolve an open question](#uc-16-resolve-an-open-question)
- [UC-17 Escalate an open question to a decision note](#uc-17-escalate-an-open-question-to-a-decision-note)

### Domain D · Decision notes
- [UC-18 Log a decision note](#uc-18-log-a-decision-note)
- [UC-19 View decision notes linked to a feature](#uc-19-view-decision-notes-linked-to-a-feature)

### Domain E · Constitution & house rules
- [UC-20 Write the first house rule](#uc-20-write-the-first-house-rule)
- [UC-21 Add a house rule mid-project](#uc-21-add-a-house-rule-mid-project)
- [UC-22 Handle a constitution violation at the gate](#uc-22-handle-a-constitution-violation-at-the-gate)

### Domain F · Recovery
- [UC-23 Undo the last action (24h window)](#uc-23-undo-the-last-action-24h-window)
- [UC-24 Revert a feature to an earlier snapshot](#uc-24-revert-a-feature-to-an-earlier-snapshot)
- [UC-25 Revert a single step file](#uc-25-revert-a-single-step-file)
- [UC-26 Recover from spatial disorientation](#uc-26-recover-from-spatial-disorientation)

### Domain G · Team mode
- [UC-27 Enable team mode on a vault](#uc-27-enable-team-mode-on-a-vault)
- [UC-28 Request peer gate sign-off](#uc-28-request-peer-gate-sign-off)
- [UC-29 Peer resolves an open question](#uc-29-peer-resolves-an-open-question)
- [UC-30 Peer escalates an open question](#uc-30-peer-escalates-an-open-question)
- [UC-31 Resolve a sync conflict](#uc-31-resolve-a-sync-conflict)

### Domain H · Settings & configuration
- [UC-32 Configure gate strictness](#uc-32-configure-gate-strictness)
- [UC-33 Configure vault folder paths](#uc-33-configure-vault-folder-paths)
- [UC-34 Configure team mode and committers](#uc-34-configure-team-mode-and-committers)

### Domain I · Utility
- [UC-35 Export a feature spec](#uc-35-export-a-feature-spec)
- [UC-36 Run vault diagnostics](#uc-36-run-vault-diagnostics)
- [UC-37 Copy an error report](#uc-37-copy-an-error-report)
- [UC-38 View the feature timeline](#uc-38-view-the-feature-timeline)
- [UC-39 Access help for a jargon term](#uc-39-access-help-for-a-jargon-term)

---

## Actors

| Actor | Description |
|-------|-------------|
| **Builder** | Primary user — the person working on the feature. Solo or in a team. May not be an engineer. |
| **Peer** | A teammate listed in the committers setting. Shares the vault. Can resolve OQs, sign off on gates, and review specs. Only present when team mode is on. |
| **Plugin** | The Specorator Obsidian plugin itself — performs automated checks, manages state, triggers UI. |

---

## Notation

- **Preconditions** — must be true before the use case can begin
- **Main flow** — the happy path
- **Alternate flows** — named deviations (A1, A2…) — either valid alternatives or error conditions
- **Postconditions** — what is true after successful completion
- **Design refs** — links to wireframe flows

---

## Domain A · Feature lifecycle

---

### UC-01 Create a new feature

**Actor:** Builder  
**Trigger:** Builder has an idea for a feature and wants to begin structured work on it.

**Preconditions:**
- Specorator plugin is installed and active
- Vault is set up (settings.featuresFolder exists or can be created)

**Main flow:**
1. Builder invokes `Specorator: New feature` via command palette (⌘P) or ribbon button or cockpit empty-state CTA
2. Plugin presents a single-field modal: "What's the idea?" with placeholder "A sentence is fine."
3. Builder types the feature name/idea and confirms (⏎ or "Start →" button)
4. Plugin presents a size hint: Large / Medium / Small — with note "hint only, you can still use all 11 steps"
5. Builder selects a size
6. Plugin generates a kebab-case slug from the idea text (e.g. "magic-link-auth")
7. Plugin creates the feature folder at `features/{slug}/` with:
   - `_meta.md` (plugin-managed, status: active, lane: define)
   - All 11 step files from templates, with correct frontmatter
   - Size-appropriate skip suggestions pre-populated for Small/Medium selections
8. Plugin opens the cockpit focused on the new feature at step 1
9. Coach presents: "Start with the vision — what are you building and why?"

**Alternate flows:**
- **A1 · Slug collision:** If `features/{slug}/` already exists, plugin appends a 4-digit date suffix and confirms with the builder
- **A2 · Cancel:** Builder presses Esc at any point — no files created, no state changed
- **A3 · Empty name:** "Start →" is disabled until at least 3 characters are entered

**Postconditions:**
- Feature folder exists with 11 step files and `_meta.md`
- Cockpit is focused on the new feature at step 1
- Feature appears in the feature switcher sorted to the top (recency)

**Design refs:** `artboards/flow-first-feature.html` · `artboards/onboarding.html`

---

### UC-02 Open the cockpit and restore context

**Actor:** Builder  
**Trigger:** Builder opens Obsidian after a period away (could be minutes or days).

**Preconditions:**
- Specorator plugin is installed and active
- At least one feature exists in the vault

**Main flow:**
1. Builder opens Obsidian (or invokes `Specorator: Open cockpit` via ⌘P)
2. Plugin resolves the active feature from the last-focused feature record (DR-002 / OQ-2)
3. Cockpit displays the last-focused feature at its current step
4. If the builder was away for more than `settings.reentryThresholdHours` (default 24h) and `settings.reentryContext` is on: coach shows a "Back after N days" summary — last step touched, any new OQs, any stale items
5. Builder is immediately oriented — no manual navigation required

**Alternate flows:**
- **A1 · No features in vault:** Plugin shows "new vault" empty state with a "Start your first feature" CTA (see UC-01)
- **A2 · All features archived:** Plugin shows "all caught up" empty state with a "New feature" CTA
- **A3 · Active note is in a feature folder:** Context inference (DR-002) — cockpit switches to that feature even if it's not the last-focused one
- **A4 · Active note is not in a feature folder:** Plugin keeps showing the last-focused feature — does not blank the cockpit

**Postconditions:**
- Cockpit shows a feature the builder can immediately work on
- Re-entry context shown if threshold exceeded

**Design refs:** `artboards/flow-oq2.html` · `artboards/state-empty.html` · `artboards/state-newvault.html`

---

### UC-03 Hand off a step

**Actor:** Builder  
**Trigger:** Builder has completed the current step and wants to advance to the next.

**Preconditions:**
- A feature is focused in the cockpit
- The current step has met all eligibility criteria (no open questions, content is non-empty)
- The step is not a gate step

**Main flow:**
1. Cockpit coach shows "Ready to hand off" with a solid (non-ghosted) "Hand off →" button
2. Builder clicks "Hand off →"
3. Plugin shows an inline confirm (not a modal): "Hand off step N → step N+1? We'll mark [file] done and open [next file]."
4. Builder confirms with "Yes, hand off" (or ⌘⏎)
5. Plugin:
   a. Takes a snapshot of the feature folder (DR-005)
   b. Sets `status: done` and `handed_off_at: now` on the current step's frontmatter
   c. If team mode: sets `handed_off_by: @handle`
   d. Advances the feature's active step to the next non-skipped step
   e. Opens the next step file in the main pane
6. Cockpit shows an undo banner: "↶ Handed off step N — undo (24h)"
7. Coach transitions to guidance for the new step
8. Step rail animates the transition in 250ms

**Alternate flows:**
- **A1 · Cancel confirm:** Builder clicks "Cancel" or presses Esc — no state change
- **A2 · Next step is at a gate:** Plugin does not auto-advance past the gate — cockpit shows the gate review screen instead (see UC-09)
- **A3 · Step not eligible:** "Hand off" button is ghosted; coach explains what's missing
- **A4 · In team mode:** `handed_off_by` field written to step frontmatter with builder's handle

**Postconditions:**
- Current step: `status = done`, `handed_off_at` set
- Feature's active step advanced
- Snapshot exists for 24h undo
- Undo banner visible in cockpit

**Design refs:** `artboards/flow-handoff.html` · `artboards/state-undo.html`

---

### UC-04 Skip a step

**Actor:** Builder  
**Trigger:** Builder determines a step is not needed for the current feature and wants to mark it skipped with a reason.

**Preconditions:**
- A feature is focused
- The step to skip is not step 1 (Vision) or step 3 (Rules) — these are required

**Main flow:**
1. Builder invokes `Specorator: Skip step…` from command palette or step context menu
2. Plugin presents a reason prompt: "Why are you skipping this step?" (mandatory text field, minimum 1 character)
3. Builder types a one-line reason
4. Builder confirms
5. Plugin:
   a. Takes a snapshot (DR-005)
   b. Sets `status: skipped`, `skipped: true`, `skip_reason: {reason}`, `handed_off_at: now` on the step's frontmatter
   c. Advances the active step to the next non-skipped step
6. Step shows as ◇ (diamond) in the rail — visually distinct from ✓ (done)
7. Skip reason visible in rail tooltip on hover
8. If `skippedCount >= settings.skipWarningThreshold` (default 8): cockpit shows soft warning "Many steps skipped — is this intentional?"

**Alternate flows:**
- **A1 · Attempt to skip step 1 or 3:** Plugin shows inline message "Vision and Rules are required — they can't be skipped." Skip action is unavailable.
- **A2 · Cancel:** Builder dismisses the reason prompt — no state change
- **A3 · Empty reason:** Confirm button disabled until at least 1 character entered

**Postconditions:**
- Step marked skipped with reason in frontmatter
- Rail shows ◇ for the skipped step
- Snapshot taken for undo

**Design refs:** `artboards/flow-skip.html`

---

### UC-05 Close a feature (archive)

**Actor:** Builder  
**Trigger:** Feature has shipped. Builder wants to close the feature and move it to the archive.

**Preconditions:**
- All 11 steps are either `done` or `skipped` (with reasons)
- Feature is in the Ship lane
- If `settings.retroRequired`: step 11 (retrospective) must be `done` or have a skip reason

**Main flow:**
1. Builder invokes `Specorator: Close feature` from cockpit or command palette
2. Plugin verifies all preconditions. If all pass, shows confirm: "Close [feature name] and move to archive?"
3. Builder confirms
4. Plugin:
   a. Takes a final snapshot labelled "before-archive"
   b. Moves the feature folder from `features/{slug}/` to `archive/{slug}/`
   c. Updates `_meta.md`: `status: archived`, `lane: closed`, `archived_at: now`
5. Cockpit transitions to the next active feature (or empty state if none)
6. A brief close acknowledgement shown in the cockpit: "Closed. Archived to archive/{slug}/."

**Alternate flows:**
- **A1 · Not all steps complete:** "Close feature" is unavailable (greyed out in cockpit); tooltip explains what's remaining
- **A2 · Retro not written (retroRequired on):** Same as A1 — close blocked until retro or skip-retro reason exists
- **A3 · Cancel confirm:** No state change

**Postconditions:**
- Feature folder moved to `archive/`
- `_meta.md` updated with archived status
- Feature no longer appears in active feature switcher
- Feature searchable in archive view

**Design refs:** `artboards/flow-completion.html`

---

### UC-06 Abandon a feature

**Actor:** Builder  
**Trigger:** Builder decides to stop work on a feature permanently, even though it's not complete.

**Preconditions:**
- Feature is active (not already archived)

**Main flow:**
1. Builder invokes `Specorator: Abandon feature…` from cockpit or command palette
2. Plugin shows a reason prompt: "Why are you abandoning this feature?" (mandatory)
3. Builder types a reason
4. Builder confirms
5. Plugin:
   a. Takes a snapshot
   b. Moves feature folder to `archive/{slug}/`
   c. Updates `_meta.md`: `status: abandoned`, skip reason logged
6. Cockpit transitions to the next active feature

**Alternate flows:**
- **A1 · Cancel:** No state change

**Postconditions:**
- Feature in archive with `status: abandoned`
- Abandon reason in `_meta.md`
- Visually distinct from closed features in the archive list

**Design refs:** `artboards/flow-completion.html` (edge cases section)

---

### UC-07 Re-open an archived feature

**Actor:** Builder  
**Trigger:** A shipped feature has bugs, or an abandoned feature is being reconsidered.

**Preconditions:**
- Feature exists in `archive/`

**Main flow:**
1. Builder opens archive view and selects the feature, or invokes `Specorator: Re-open feature…` from palette
2. Plugin prompts for a re-open reason (mandatory)
3. Builder enters reason
4. Plugin:
   a. Takes a snapshot of the archived state
   b. Moves feature from `archive/{slug}/` back to `features/{slug}/`
   c. Updates `_meta.md`: `status: active`, `lane` restored to previous active lane, re-open reason logged in retrospective
   d. Arms undo for 24h
5. Cockpit focuses on the re-opened feature

**Alternate flows:**
- **A1 · Cancel:** No state change

**Postconditions:**
- Feature back in `features/`
- Re-open reason logged
- Feature appears in active feature switcher

**Design refs:** `artboards/flow-completion.html`

---

### UC-08 Switch between features

**Actor:** Builder  
**Trigger:** Builder wants to focus on a different active feature.

**Preconditions:**
- At least two active features exist

**Main flow:**
1. Builder invokes `Specorator: Switch feature` (⌘⇧F suggested) or uses the feature picker in the cockpit header
2. Plugin shows a fuzzy-search dropdown of all active features, sorted by recency (last_active_at)
3. Builder types to filter or selects from list
4. Plugin switches cockpit context to selected feature
5. Cockpit re-renders with the selected feature at its current step

**Alternate flows:**
- **A1 · Only one active feature:** Feature picker still opens but shows one item
- **A2 · Active note is in a feature folder:** Context switches automatically on leaf change (DR-002) without builder invoking the picker

**Postconditions:**
- `lastFocusedFeature` updated to selected feature
- Cockpit shows selected feature

---

## Domain B · Gate review

---

### UC-09 Approach and enter a gate

**Actor:** Builder  
**Trigger:** Builder is working on the last step before a gate (step 4 before Define→Build, step 8 before Build→Ship).

**Preconditions:**
- Feature is in the correct lane with all preceding steps done or skipped

**Main flow:**
1. From step 3 onward (approaching the gate), cockpit rail shows a yellow ⚑ flag at the gate position: "Gate ahead · after step 4"
2. Builder completes step 4 (or skips it with reason) and hands it off
3. Instead of advancing to step 5, cockpit presents the gate review screen
4. Gate review shows 5 checks (A1–A5 for Define→Build) with current pass/fail status
5. Plugin has auto-evaluated all checks on the last file save — results are already shown
6. Failing checks are shown in red with specific fix descriptions

**Postconditions:**
- Builder is on the gate review screen
- All check results are visible

**Design refs:** `artboards/flow-gate.html` · `artboards/state-gate-fail.html` · `artboards/state-gate-pass.html`

---

### UC-10 Fix a failing gate check

**Actor:** Builder  
**Trigger:** One or more gate checks are failing. Builder wants to resolve them.

**Preconditions:**
- Builder is on the gate review screen
- At least one hard-block check is failing

**Main flow:**
1. Gate review shows failing checks with plain-English fix descriptions
2. Each failing check has a one-click action: "Open file", "Add section", "Resolve questions"
3. Builder clicks the fix action
4. Plugin opens the relevant file at the relevant location (or performs the action directly)
5. Builder makes the edit and saves
6. On save, plugin re-evaluates gate checks automatically
7. Fixed check turns green in the gate review screen
8. Builder repeats for each failing check

**Alternate flows:**
- **A1 · Override instead of fix:** Builder invokes UC-12 (Override gate check) instead of fixing

**Postconditions:**
- Previously failing check now passes
- Gate check count updated in cockpit status bar

**Design refs:** `artboards/flow-gate.html` (frames 04–05)

---

### UC-11 Cross a gate

**Actor:** Builder (+ Peer in team mode)  
**Trigger:** All hard-block gate checks are passing. Builder wants to advance to the next lane.

**Preconditions:**
- All hard-block gate checks pass
- In team mode: peer sign-off is present (see UC-28)

**Main flow:**
1. Gate review shows all checks green and "all checks pass · gate ready to advance"
2. Builder clicks "Cross the gate" (or ⌘⏎)
3. Plugin:
   a. Takes a named snapshot: "before-{gate}-gate"
   b. Updates `_meta.md`: adds gate crossing record with timestamp, actor, peer sign-off (if team)
   c. Updates `_meta.md`: advances feature lane
   d. Updates step frontmatter for the gate-adjacent steps
4. Cockpit cross-fades to the new lane in 400ms (slower than hand-off)
5. Undo banner shown: "↶ Crossed gate: Define → Build — undo (24h)"
6. Coach transitions to Build-lane guidance

**Alternate flows:**
- **A1 · Team mode, no peer sign-off:** "Cross the gate" button is unavailable. Cockpit shows "Waiting on peer sign-off" with a "Request sign-off" CTA (UC-28)
- **A2 · Undo within 24h:** UC-23 restores the feature to the pre-gate state

**Postconditions:**
- Feature lane updated in `_meta.md`
- Gate crossing record in gates[] array
- Snapshot exists for undo
- Cockpit showing new lane

**Design refs:** `artboards/flow-gate.html` (frames 06–07) · `artboards/state-gate-pass.html`

---

### UC-12 Override a failing gate check

**Actor:** Builder  
**Trigger:** Builder wants to cross a gate despite a failing check (e.g. a hard deadline, or a legitimate exception).

**Preconditions:**
- Builder is on the gate review screen
- At least one check is failing

**Main flow:**
1. Builder clicks "Override gate check…" on a specific failing check
2. Plugin prompts: "Why are you overriding this check?" (mandatory, one line)
3. Builder enters reason
4. Builder confirms
5. Plugin logs the override in `_meta.md` with reason, actor, and timestamp
6. The overridden check is marked ⚠ in the gate review and timeline
7. If all remaining hard-block checks now pass (or are overridden), "Cross the gate" becomes available

**Alternate flows:**
- **A1 · Cancel:** No state change

**Postconditions:**
- Override logged in `_meta.md`
- Gate can now be crossed
- ⚠ marker permanent in timeline

**Design refs:** `artboards/flow-gate.html` (edge case A)

---

### UC-13 Re-run gate checks manually

**Actor:** Builder  
**Trigger:** Builder wants to force an immediate gate re-evaluation (e.g. after manual file edit without a save event).

**Preconditions:**
- Feature is at a gate

**Main flow:**
1. Builder invokes `Specorator: Re-run gate` from cockpit or command palette
2. Plugin re-evaluates all gate checks for the current feature
3. Cockpit animates a sequential tick through each check (visual confidence signal)
4. Results update in the gate review screen

**Postconditions:**
- Gate check results reflect current file state

---

## Domain C · Open questions

---

### UC-14 Write an open question

**Actor:** Builder  
**Trigger:** Builder is writing a step file and encounters something they haven't decided yet.

**Preconditions:**
- Builder is editing a step file inside a feature folder
- File matches the plugin's scan pattern (`features/*/[0-9][0-9]-*.md`)

**Main flow:**
1. Builder types a line starting with `? ` in the step file (e.g. `? Should links expire after 15 min or 60 min?`)
2. Builder saves the file
3. Plugin scans the file on save, detects the `? ` line
4. Plugin registers the OQ in the oqCounts cache for the feature
5. Cockpit OQ panel updates: counter increments, new OQ appears in the list
6. Gate check A3 (0 open questions) now fails for the feature

**Alternate flows:**
- **A1 · `?` in a non-step file:** Plugin does not scan files outside `features/*/[0-9][0-9]-*.md` — the question is not tracked

**Postconditions:**
- OQ registered in cache
- OQ visible in cockpit right pane
- Gate check A3 failing

**Design refs:** `artboards/flow-oq.html` (act 1)

---

### UC-15 View all open questions for a feature

**Actor:** Builder  
**Trigger:** Builder wants to see all outstanding questions for the current feature.

**Preconditions:**
- Feature has at least one open question

**Main flow:**
1. Cockpit right pane shows OQ panel whenever `oqCount > 0` (no toggle required — always visible when questions exist)
2. Questions listed by file, sorted by age (oldest first)
3. Each item shows: question text · source file · age
4. Questions older than `settings.oqStaleThresholdDays` show amber "stale" tag
5. Builder clicks a question → plugin opens the source file at the exact line

**Postconditions:**
- Builder sees all OQs
- Clicking a question navigates to the source

**Design refs:** `artboards/flow-oq.html` (act 2)

---

### UC-16 Resolve an open question

**Actor:** Builder (or Peer in team mode)  
**Trigger:** Builder has an answer to an open question and wants to close it.

**Preconditions:**
- An open question exists in a step file

**Main flow:**
1. Builder opens the step file (directly or via UC-15 click)
2. Builder replaces the `? ` prefix with `! ` and appends or writes the answer on the same or next line
3. In team mode: adds `<!-- @handle · date -->` comment after the resolution
4. Builder saves the file
5. Plugin scans the file on save, detects the `! ` resolution
6. Plugin updates oqCounts cache — count decrements
7. Cockpit OQ panel updates: resolved item briefly shown struck-through, then removed
8. If this was the last OQ: gate check A3 turns green; OQ panel collapses
9. Coach optionally offers: "Was this a big choice? Log it as a decision note." (UC-17)

**Alternate flows:**
- **A1 · Resolution becomes a stale OQ:** If `!` is later removed or changed back to `?`, OQ is re-registered on next save

**Postconditions:**
- OQ marked resolved in cache
- Gate check A3 updated
- If last OQ: panel collapses, gate check green

**Design refs:** `artboards/flow-oq.html` (act 3)

---

### UC-17 Escalate an open question to a decision note

**Actor:** Builder  
**Trigger:** A just-resolved open question had architectural weight and deserves a decision record.

**Preconditions:**
- An OQ was just resolved (coach prompt appears)
- Or builder explicitly invokes `Specorator: Log decision…`

**Main flow:**
1. Coach shows: "Was this a big choice? Log it as a decision note — 60 seconds."
2. Builder clicks "Log decision →"
3. Plugin opens the decision note form pre-filled from the OQ text (see UC-18)

**Alternate flows:**
- **A1 · Dismissed:** Builder clicks "no, it's minor" — coach disappears, no action

**Postconditions:**
- Decision note form opened with OQ text pre-filled

**Design refs:** `artboards/flow-oq.html` (frame R4)

---

## Domain D · Decision notes

---

### UC-18 Log a decision note

**Actor:** Builder  
**Trigger:** Builder has made an architectural or significant design choice and wants to record it.

**Preconditions:**
- Vault is set up

**Main flow:**
1. Builder invokes `Specorator: Log decision…` (⌘⇧D suggested) or responds to coach prompt
2. Plugin opens a 3-field form:
   - **The choice** (title) — pre-filled from current step context or OQ text if triggered from UC-17
   - **Why** (context + rationale) — empty, plain text
   - **Consequences** — empty, plain text
3. Builder fills in the fields (takes ~60 seconds)
4. Builder saves
5. Plugin creates the decision note as `decisions/{slug}-{title-slug}.md` with frontmatter
6. Plugin auto-links the decision note from the current step file (inserts a wikilink)
7. Gate check A4 (decision note linked) now passes

**Alternate flows:**
- **A1 · Feature-scoped decision:** If a feature is focused, decision note saved to `features/{slug}/decisions/` instead of vault-level `decisions/`
- **A2 · Cancel:** No file created, no link inserted

**Postconditions:**
- Decision note file created
- Wikilink inserted into current step file
- Gate check A4 updated

**Design refs:** `artboards/flow-adr.html`

---

### UC-19 View decision notes linked to a feature

**Actor:** Builder  
**Trigger:** Builder wants to review decisions made for the current feature.

**Preconditions:**
- At least one decision note is linked from a step file

**Main flow:**
1. Cockpit right pane or step file shows wikilinks to decision notes
2. Builder clicks a wikilink → Obsidian opens the decision note in the main pane
3. Decision note shows: title, date, context, decision, consequences

**Postconditions:**
- Decision note visible in main pane

---

## Domain E · Constitution & house rules

---

### UC-20 Write the first house rule

**Actor:** Builder  
**Trigger:** Builder reaches step 2 (Open questions) for the first time and the vault has no constitution yet.

**Preconditions:**
- `CONSTITUTION.md` does not exist at vault root

**Main flow:**
1. Coach shows: "Every vault works better with house rules. Start with one."
2. Builder clicks "Add a rule →"
3. Plugin creates `CONSTITUTION.md` with a scaffold structure (Heading, Rules section, Retired rules section)
4. Plugin opens `CONSTITUTION.md` in the main pane at the Rules section
5. Builder writes the first rule as a bullet with a "Check:" clause
6. Builder saves
7. Gate check A5 now evaluates against this rule

**Alternate flows:**
- **A1 · Builder dismisses coach:** No file created. Coach does not re-appear unless builder invokes `Specorator: Open constitution`

**Postconditions:**
- `CONSTITUTION.md` exists
- First rule defined
- Gate A5 now active

**Design refs:** `artboards/flow-constitution.html` (part 1)

---

### UC-21 Add a house rule mid-project

**Actor:** Builder  
**Trigger:** A new rule is needed after several features already exist.

**Preconditions:**
- `CONSTITUTION.md` exists
- At least one active feature

**Main flow:**
1. Builder invokes `Specorator: Add house rule…`
2. Plugin opens a small form: rule text + "Check:" method
3. Builder fills in the rule
4. Plugin appends the rule to `CONSTITUTION.md` under `## Rules`
5. Plugin immediately re-evaluates gate checks for all active features against the new rule
6. Any features now failing the gate check A5 are flagged in the cockpit with: "House rules changed — gate re-check needed"

**Alternate flows:**
- **A1 · Rule conflicts with existing rule:** Plugin does not auto-detect conflicts — builder is responsible for reviewing `CONSTITUTION.md`

**Postconditions:**
- Rule added to `CONSTITUTION.md`
- All active features re-evaluated against the new rule
- Affected features flagged if gate A5 now fails

**Design refs:** `artboards/flow-constitution.html` (part 2)

---

### UC-22 Handle a constitution violation at the gate

**Actor:** Builder  
**Trigger:** Gate A5 (house rules respected) is failing for a feature.

**Preconditions:**
- Feature is at the Define→Build gate
- `CONSTITUTION.md` has at least one rule the feature hasn't addressed

**Main flow:**
1. Gate review shows A5 failing: "House rule 'translatable strings' not addressed"
2. Builder clicks "Address this rule →" — plugin opens the relevant step file at the recommended insertion point
3. Builder adds a note or section addressing the rule
4. Builder saves — gate A5 re-evaluates and passes

**Alternate flows:**
- **A1 · Override:** Builder invokes UC-12 and logs a reason why the rule doesn't apply to this feature

**Postconditions:**
- Gate A5 passes (via compliance or override)

**Design refs:** `artboards/flow-gate.html` (frame 04 · item B)

---

## Domain F · Recovery

---

### UC-23 Undo the last action (24h window)

**Actor:** Builder  
**Trigger:** Builder made a hand-off, gate cross, or file mutation they want to reverse.

**Preconditions:**
- A snapshot exists from within the last 24 hours
- The undo banner is visible in the cockpit

**Main flow:**
1. Builder clicks the undo banner: "↶ [Action] — undo (24h)"
2. Plugin shows a confirm: "Undo this? All files will be restored to the previous state."
3. Builder confirms
4. Plugin restores all step files and `_meta.md` from the snapshot
5. Cockpit re-renders with the restored state
6. Undo banner disappears

**Alternate flows:**
- **A1 · 24h window expired:** Undo banner no longer shown. Builder must use UC-24 (revert to snapshot)
- **A2 · Cancel confirm:** No state change

**Postconditions:**
- Feature state restored to pre-action state
- Snapshot consumed (removed)

**Design refs:** `artboards/flow-recovery.html` (part 1) · `artboards/state-undo.html`

---

### UC-24 Revert a feature to an earlier snapshot

**Actor:** Builder  
**Trigger:** Builder wants to go further back than the 24h undo window, or wants to choose a specific historical state.

**Preconditions:**
- Feature has at least one named snapshot (gate-crossing snapshots are retained until archival)

**Main flow:**
1. Builder invokes `Specorator: Revert feature…` from command palette
2. Plugin shows a list of named snapshots (e.g. "before-define-build-gate · 3 days ago")
3. Builder selects a snapshot
4. Plugin shows a diff summary: "N files changed — N lines added, N removed"
5. Builder confirms
6. Plugin restores all files from the selected snapshot
7. Cockpit re-renders with restored state

**Alternate flows:**
- **A1 · Cancel at diff:** No state change

**Postconditions:**
- Feature restored to selected snapshot state

**Design refs:** `artboards/flow-recovery.html` (part 2)

---

### UC-25 Revert a single step file

**Actor:** Builder  
**Trigger:** Builder wants to undo edits to one step file without rolling back the whole feature.

**Preconditions:**
- The file is open in Obsidian
- At least one snapshot exists for the feature

**Main flow:**
1. Builder invokes `Specorator: Revert file…` from command palette
2. Plugin shows snapshot list scoped to the currently open file
3. Builder selects a snapshot version
4. Plugin shows the file content diff
5. Builder confirms
6. Plugin restores only that file from the snapshot

**Postconditions:**
- Single file restored; rest of feature unchanged

**Design refs:** `artboards/flow-recovery.html` (part 2 · edge case)

---

### UC-26 Recover from spatial disorientation

**Actor:** Builder  
**Trigger:** Builder doesn't know where they are in a feature — what step they're on, why, or what happened.

**Preconditions:**
- A feature is focused in the cockpit

**Main flow:**
1. Builder opens the cockpit
2. Cockpit shows: current step number, current lane, step description
3. Builder clicks "Show full timeline" or invokes `Specorator: Show timeline`
4. Plugin shows a chronological event log: all hand-offs, gate crossings, OQ resolutions, decision notes, and skips — with timestamps and any team attributions
5. Builder reads the history and re-orients
6. Builder can click any event to jump to the relevant file

**Postconditions:**
- Builder is oriented — knows current step, how they got here, and what's next

**Design refs:** `artboards/flow-recovery.html` (part 3)

---

## Domain G · Team mode

---

### UC-27 Enable team mode on a vault

**Actor:** Builder  
**Trigger:** The vault is being shared with teammates (via Obsidian Sync or Git) and peer sign-off is needed on gates.

**Preconditions:**
- Vault is already syncing (Obsidian Sync, Git, or Dropbox)
- Plugin is installed for all participants

**Main flow:**
1. Builder opens Settings → Community plugins → Specorator → Vault section
2. Builder sets `Gate mode` to "Team"
3. Builder enters committer handles (one per line) — these must match Obsidian Sync author names or git commit email prefixes
4. Builder saves settings
5. Plugin immediately shows three new UI elements in the cockpit:
   - Presence strip (last active teammates)
   - Attribution on step hand-offs (`handed_off_by`)
   - Peer sign-off slot on gate items
6. Only gates crossed **after** enabling team mode require peer sign-off — existing closed gates are unaffected

**Alternate flows:**
- **A1 · No committers listed:** Team mode on but no committers — plugin warns "Add committer handles to use team features"

**Postconditions:**
- `gateMode: "team"` in settings
- Committer list populated
- New team UI visible in cockpit

**Design refs:** `artboards/flow-team.html` (act 1)

---

### UC-28 Request peer gate sign-off

**Actor:** Builder  
**Trigger:** Define→Build gate self-checks all pass but peer sign-off is required and outstanding.

**Preconditions:**
- Team mode is enabled
- All hard-block gate checks pass (A1–A5)
- Peer sign-off (T1) has not yet been received

**Main flow:**
1. Cockpit shows gate status: "4 of 5 pass · waiting on peer sign-off"
2. Builder clicks "Request sign-off"
3. Plugin generates a PR description with the gate checklist pre-filled and reviewer suggested from committers list
4. If git remote is configured: plugin opens the PR URL in the browser
5. If no git remote: plugin copies the PR template to clipboard
6. Peer reviews the spec files and merges the PR (or edits `_meta.md` directly if no git)
7. Plugin detects the merge commit from a listed committer touching `_meta.md`
8. Gate check T1 turns green
9. "Cross the gate" button becomes available (UC-11)

**Alternate flows:**
- **A1 · No git remote (Obsidian Sync / Dropbox teams):** Peer signs off by manually adding `peer_signoff: "@handle"` to the gate record in `_meta.md`. Plugin detects this on next sync.
- **A2 · Unknown committer signs off:** Plugin shows soft warning "Unrecognised committer — add them in settings?" Sign-off still counts.

**Postconditions:**
- Peer sign-off recorded in `_meta.md`
- Gate check T1 passes
- Gate crossable

**Design refs:** `artboards/flow-team.html` (act 2)

---

### UC-29 Peer resolves an open question

**Actor:** Peer  
**Trigger:** Peer sees an open question in the shared vault that they can answer.

**Preconditions:**
- Team mode is enabled
- OQ exists in a step file
- Peer has access to the shared vault

**Main flow:**
1. Peer opens the feature folder in their Obsidian
2. Peer sees the OQ in the cockpit OQ panel (same panel as UC-15)
3. Peer opens the step file and edits the `? ` line to `! ` with their answer
4. Peer adds an attribution comment: `<!-- @handle · date -->`
5. Peer saves the file
6. On sync: feature owner's cockpit counter drops; resolved OQ shows "resolved by @handle"

**Postconditions:**
- OQ resolved with attribution
- Feature owner's cockpit updated on next sync

**Design refs:** `artboards/flow-team.html` (act 3)

---

### UC-30 Peer escalates an open question

**Actor:** Peer  
**Trigger:** Peer sees an OQ they cannot answer and wants to flag it needs the owner's attention.

**Preconditions:**
- Team mode is enabled
- OQ exists in a step file

**Main flow:**
1. Peer opens the step file
2. Peer adds `@{ownerHandle}` to the end of the `? ` line: `? Should links expire after 15 min? @you`
3. Peer adds a comment: `<!-- @handle · can't answer -->`
4. Peer saves the file
5. On sync: feature owner's cockpit shows the OQ with "Needs your answer" accent border

**Postconditions:**
- OQ tagged as needing owner's attention
- Owner's cockpit highlights the tagged OQ

**Design refs:** `artboards/flow-team.html` (act 3 · frame P4)

---

### UC-31 Resolve a sync conflict

**Actor:** Builder  
**Trigger:** Two people edited the same step file simultaneously, causing a sync conflict.

**Preconditions:**
- Team mode is enabled
- A conflict exists (Obsidian Sync duplicate or Git conflict markers)

**Main flow (Obsidian Sync):**
1. Plugin detects a `(conflicted copy)` file on startup or file-watch event
2. Cockpit shows a conflict banner: "⚠ Sync conflict in [file]"
3. Gate evaluation is paused for the affected feature
4. Builder clicks "Resolve conflict →"
5. Plugin shows a side-by-side view: "yours" vs "theirs" with committer attribution
6. Builder clicks "Keep mine" or "Keep theirs"
7. Plugin keeps the chosen version and deletes the conflict file
8. Gate re-evaluates

**Alternate flow (Git):**
- Plugin detects `<<<<<<< HEAD` markers in a file
- Shows same conflict banner
- Offers "Open in editor" — plugin steps aside and lets the builder resolve in Obsidian or external editor

**Postconditions:**
- Conflict resolved — one version survives
- Gate re-evaluates against the surviving file
- No auto-merge of spec content

**Design refs:** `artboards/flow-team.html` (act 4) · `artboards/flow-recovery.html` (edge cases)

---

## Domain H · Settings & configuration

---

### UC-32 Configure gate strictness

**Actor:** Builder  
**Trigger:** Builder wants to adjust which gate checks are hard blocks vs soft nudges, or change the minimum EARS rule count.

**Preconditions:**
- Plugin is installed

**Main flow:**
1. Builder opens Settings → Community plugins → Specorator → Gates section
2. Builder adjusts any of:
   - `Gate mode` (Solo / Team)
   - `Decision note gate check` (Hard / Soft / Off)
   - `Gate scan trigger` (On save / Manual)
   - `Minimum EARS rules` (number)
   - `"Too many skips" warning threshold` (number)
3. Settings take effect immediately — no save button, no restart

**Postconditions:**
- Gate checks re-evaluated against new settings on next file save

**Design refs:** `artboards/flow-settings.html` (section 3)

---

### UC-33 Configure vault folder paths

**Actor:** Builder  
**Trigger:** Builder wants to change where Specorator stores its files (non-default folder names).

**Preconditions:**
- Plugin is installed
- Builder is aware that changing paths after features exist requires migration

**Main flow:**
1. Builder opens Settings → Vault section
2. Builder changes folder paths (features/, archive/, decisions/) or constitution file name
3. Plugin shows inline warning if features already exist: "Changing this path after features exist will orphan existing files. Consider migrating manually first."
4. Builder confirms (or cancels)
5. New path takes effect for all future file creation

**Alternate flows:**
- **A1 · Cancel:** No change

**Postconditions:**
- New path used for all future plugin file creation
- Existing files not moved (migration is manual — post-MVP)

**Design refs:** `artboards/flow-settings.html` (section 4)

---

### UC-34 Configure team mode and committers

**Actor:** Builder  
**Trigger:** Builder is setting up team mode for the first time or updating the committers list.

**Preconditions:**
- Plugin is installed

**Main flow:**
1. Builder opens Settings → Vault section
2. Builder sets `Gate mode` to Team
3. Builder enters committer handles, one per line
4. Builder optionally sets `Min reviewers` (default: 1)
5. Settings take effect immediately

**Postconditions:**
- Team mode active
- Committer list used for attribution and sign-off detection

**Design refs:** `artboards/flow-team.html` (act 1) · `artboards/flow-settings.html` (section 3)

---

## Domain I · Utility

---

### UC-35 Export a feature spec

**Actor:** Builder  
**Trigger:** Builder wants to share the full feature spec with a contractor or external stakeholder.

**Preconditions:**
- A feature is focused in the cockpit

**Main flow:**
1. Builder invokes `Specorator: Export spec…` from cockpit or command palette
2. Plugin concatenates all step files in order, prepends the feature name and gate history, and appends all linked decision notes
3. Plugin saves the output as a single `.md` file (e.g. `magic-link-auth-spec-export.md`) in the vault root or a chosen location
4. Plugin opens the exported file in Obsidian

**Postconditions:**
- Single exportable `.md` file created
- File is self-contained — readable without the plugin

---

### UC-36 Run vault diagnostics

**Actor:** Builder  
**Trigger:** Builder suspects something is wrong with the vault structure after a manual edit, plugin upgrade, or migration.

**Preconditions:**
- Plugin is installed

**Main flow:**
1. Builder invokes `Specorator: Run diagnostics`
2. Plugin checks:
   - All feature folders have valid `_meta.md` frontmatter
   - All step files have correct `specorator: true` frontmatter
   - `CONSTITUTION.md` is parseable (if it exists)
   - Snapshot index in `_meta.md` matches files in `.specorator/snapshots/`
3. Plugin reports findings in a cockpit banner: "N issues found" or "Vault is healthy"
4. Each issue has a description and — where possible — a one-click fix

**Postconditions:**
- Builder knows the vault health status
- Actionable issues surfaced

---

### UC-37 Copy an error report

**Actor:** Builder  
**Trigger:** Plugin encountered an error and builder wants to report it.

**Preconditions:**
- Plugin has logged an error (status bar dot shows red)

**Main flow:**
1. Builder invokes `Specorator: Copy error report`
2. Plugin formats the last error as a structured bug report: plugin version, Obsidian version, error message, stack trace, vault feature count
3. Plugin copies to clipboard
4. Builder pastes into a GitHub issue

**Alternate flows:**
- **A1 · No error logged:** Command is available but shows "No error to report"

**Postconditions:**
- Error report on clipboard
- No auto-submit (DR-006 — nothing leaves the machine without the builder's action)

---

### UC-38 View the feature timeline

**Actor:** Builder  
**Trigger:** Builder wants a chronological history of everything that happened to a feature.

**Preconditions:**
- A feature is focused

**Main flow:**
1. Builder invokes `Specorator: Show timeline` or clicks the timeline expand in the cockpit
2. Plugin renders a chronological event log:
   - Step hand-offs (with timestamp, and handle in team mode)
   - Gate crossings (with peer sign-off attribution)
   - Gate overrides (with reason + ⚠ marker)
   - OQ resolutions (with resolver handle in team mode)
   - Decision notes logged
   - Skips (with reason)
   - Snapshots (named)
3. Each event is clickable — navigates to the relevant file or snapshot

**Postconditions:**
- Full feature history visible

---

### UC-39 Access help for a jargon term

**Actor:** Builder  
**Trigger:** Builder sees an unfamiliar term in the cockpit and wants to understand it.

**Preconditions:**
- Builder is in the cockpit or any Specorator view
- The term has a `(?)` popover trigger

**Main flow:**
1. Builder clicks the `(?)` next to a term (e.g. "EARS", "ADR", "gate", "constitution")
2. Plugin shows a popover with a fixed structure:
   - **One-line definition** (plain English)
   - **One-paragraph why** (why this concept exists in Specorator)
   - **One link** ("Read more →" — opens the relevant rationale section or external resource)
3. Builder reads and closes the popover (click outside or press Esc)

**Postconditions:**
- Builder understands the term without leaving the cockpit

**Design refs:** `artboards/help-popovers.html`

---

## Summary statistics

| Domain | Use cases | Notes |
|--------|-----------|-------|
| A · Feature lifecycle | 8 | UC-01 through UC-08 |
| B · Gate review | 5 | UC-09 through UC-13 |
| C · Open questions | 4 | UC-14 through UC-17 |
| D · Decision notes | 2 | UC-18 through UC-19 |
| E · Constitution | 3 | UC-20 through UC-22 |
| F · Recovery | 4 | UC-23 through UC-26 |
| G · Team mode | 5 | UC-27 through UC-31 |
| H · Settings | 3 | UC-32 through UC-34 |
| I · Utility | 5 | UC-35 through UC-39 |
| **Total** | **39** | |

---

*Derived from wireframe designs v0.1 · May 2026*  
*All use cases reference at least one wireframe artboard. See the design refs fields above.*
