---
title: "Handoff: /compact turn context (#516) + Commands tab (#515) open issues"
date: 2026-07-27
status: open
scope: features/chat, features/quickActions, providers/claude
---

# Handoff — PR #516 and #515

Two stacked PRs. **#516** (`claude/compact-turn-context-consumption`, base `main`) fixes
composer-side `/compact` context consumption. **#515**
(`claude/quick-actions-commands-visibility-gwj197`, base = #516's branch) adds the
Quick Actions Commands tab.

Both are green on their last pushed commits (#516 `f92537b`, all 10 CI checks; #515 verified
locally — see [Operational notes](#operational-notes) for why it has no CI run).

## The recurring root cause

Nearly every finding across ~20 review rounds is one defect wearing different clothes:

> **`isCompact` is re-derived from text at each stage instead of travelling with the turn,
> and no single site owns "what did this turn actually consume".**

Consumption is spread across four call sites in two controllers (`buildOutgoingTurn`, the
streaming-queue branch, `QueuedMessageController`'s steer commit, and
`applyPreparedTurnToUserMessage`), each independently re-answering a question whose real
answer lives elsewhere — sometimes in the provider's encoder. `compactTurnRules.ts` now owns
the *predicates*, but not the *responsibility*.

Two sharp consequences worth internalising before touching this code:

1. **The feature/provider line.** Predicates like `isCompactInvocation` are authoritative only
   for context the FEATURE layer strips (pills, images) — no provider gets a say. They are
   **wrong** for the current note, which stays on the turnRequest and is dropped or rendered
   per-runtime (Claude drops the envelope, Codex routes to its own endpoint, Opencode has no
   compact concept and renders it). Only `PreparedChatTurn.isCompact` can answer that.
2. **Queue merges destroy the classification.** `mergeQueuedChatTurns` joins as
   `existing\n\nincoming`, so `ordinary\n\n/compact` stops reading as compact while
   `/compact\n\nordinary` still does. Any text-derived predicate downstream of a merge is
   answering about a string that no longer represents a single user intent.

The durable fix is a **consumed-context contract**: turn submission reports what it actually
took, and one site acts on it. Every open item below is a symptom.

## Open issues

### 1. `/compact`-led merge discards the user's image (#516) — REGRESSION, highest priority

Introduced by `f92537b`. That commit strips `turnRequestOverride.images` when the merged
content leads with `/compact`, to stop an invisible attachment reaching the provider. But the
ordinary queue path has **already persisted that image to the vault and cleared it from the
composer**, so stripping deletes it outright and orphans the vault file. This is data loss,
and strictly worse than the bug it replaced.

**Repro:** stream a turn → queue `/compact` → send an ordinary message with a pasted image
(merges into the queued compact) → on dequeue the image is gone from composer, transcript, and
request.

**Fix (written and verified, then reverted — see below):** return the images to the composer
instead of dropping them, in `resolveTurnSubmission`:

```ts
if (isCompactInvocation(send.content)) {
  this.returnImagesToComposer(send, turnRequest.images);  // setImages([...existing, ...images])
  turnRequest.images = undefined;
}
```

Excluding context must never be a deletion. The change passed the full suite (9698) and the
quality ratchet, but pushed `InputController.ts` 15 lines past its shrink-only LOC ceiling
(1187 vs 1172). **It was reverted rather than landed by shaving rationale a third time.**

**Land it together with an extraction that pays for the lines** — see issue 5.

### 2. In-flight SDK probe survives invalidation (#515)

`ClaudeCommandCatalog.refresh()` / `notifyCommandsChanged()` clear `sdkCommands` but leave
`probePromise` running. `ensureProbed` reuses that unchanged promise and commits its result
whenever `sdkCommands` is empty — which the clear just guaranteed. So the event-triggered
refetch awaits a **pre-edit** probe and repopulates with stale data, which the aggregator then
caches for its full 60s TTL. Both the event path and the manual `refresh()` path have it.

**Fix:** a generation token in the catalog, mirroring the one already in
`ProviderEntryAggregator.fetchBucket` — bump on clear, and have `ensureProbed`'s `.then`
commit only if it still holds the current token.

### 2b. `invalidate()` refreshes disabled providers, and races its own refetch (#515) — REGRESSION

Both introduced by `c5fb8f5`, which made `ProviderCommandAggregator.invalidate()` also call
`commandCatalog.refresh()`. Fix these **together with issue 2** — all three are the same
"refresh path" and a partial fix leaves one of the spawns in place.

**2b-i — it spawns providers the user disabled.** The loop refreshes *every* record before the
`shouldFetch: (record) => record.isEnabled` guard is ever consulted. `CodexSkillCatalog.refresh()`
calls `listSkills({ forceReload: true })`, which starts a `CodexAppServerProcess`. This directly
contradicts the invariant this PR documents for `shouldFetch` (see `features/quickActions/CLAUDE.md`,
"Disabled providers are never asked"): merely clicking Refresh must not launch an opted-out provider.

*Fix:* filter `getRecordsToRefresh` by live `record.isEnabled`.

**2b-ii — it double-spawns on the enabled path.** `invalidate()` fires `refresh()` and returns,
then the renderer immediately calls `listAllStreaming()`. `CodexSkillListingService` does not
register force-reloads in its `pending` slot, so the foreground listing starts a *second*
`CodexAppServerProcess` for the same refresh.

*Fix:* either await the refresh before refetching, or — better, and what the fire-and-forget was
reaching for — split **synchronous cache invalidation** from the **replacement load**, so
`invalidate()` only drops caches and the single subsequent fetch does all the I/O. That shape also
makes 2b-i fall out naturally, since a non-spawning invalidation is safe for any provider.

> Note the pattern: the fire-and-forget `void Promise.resolve(...)` was chosen to keep
> `invalidate()` synchronous, and it bought a race plus an enablement-guard bypass. The
> sync/async split above is the real answer.

### 3. `/compact` routed to a blank tab compacts an empty transcript (#515)

`preferActiveTab: 'always'` only helps when the active tab's provider matches. Every other
route (blank active tab, other-provider active tab, work-order run tab, no active tab) falls
through to `resolveProviderChatTab`, which considers **only draft-free blanks** and otherwise
creates one — so compact runs against nothing, and a bound matching-provider tab in the
background is never even a candidate.

**Needs a product decision**, which is why it is still open:
- reject the dispatch when there is no eligible conversation, or
- search open tabs for a bound conversation on that provider.

They differ materially when several conversations are open. It also wants **"requires an
existing conversation" as a property on `ProviderCommandEntry`**, not a fifth hard-coded
`isCompactInvocation` branch — there are already four.

### 4. Argument-less command consumes pills staged with a preserved draft (#515)

`sendMessage({ content })` sets `shouldUseInput: false`, so the textarea survives — that is
what makes `preferActiveTab: 'always'` safe. But `resolveTurnSubmission` folds the pill mention
suffix in regardless and `buildOutgoingTurn` then clears the pills. The draft text is preserved
while the context staged with it is both sent with someone else's turn and removed.

**Two candidate fixes, in different PRs:**
- *#515:* widen the seed path's `blankTabHasComposerText` check to `blankTabHasPendingDraft`.
  Cheap, but an argument-less command then stops staying on the conversation whenever a pill is
  attached — undercutting active-tab routing for commands.
- *#516 (preferred):* a content-override send should never consume pills it didn't ask for.
  More principled, and generalises to every `sendMessage({ content })` caller — quick actions,
  loop prompts, Agent Board follow-ups. That reach is also why it needs its own review.

### 5. `InputController.ts` has no LOC headroom left

At 1172, it is a grandfathered **shrink-only** hotspot (`scripts/loc-baseline.json`). This PR
pair has hit the ceiling three times; twice I paid by deleting rationale, which the review
findings then proved was needed. The third time I stopped (issue 1).

**Before landing anything else here, extract.** The natural cut is the consumed-context
contract itself — the four consumption sites and their predicates — into
`compactTurnRules.ts` (which already exists and owns the predicates) or a sibling module. That
pays for issue 1's lines and is the structural fix for the root cause.

## Operational notes

- **#515 gets no CI while stacked.** `.github/workflows/ci.yml` triggers on
  `pull_request: branches: [main]`, so only GitGuardian runs. Its empty checks list is not a
  failure. **When #516 merges, retarget #515 to `main`** — that restores CI and will not happen
  on its own.
- **A `wip:` commit (`4542584`) is in #515's history**, from staging work across a branch
  switch. Cosmetic; left rather than force-push over merge commits. Squash-merge hides it.
- **Verify locally before pushing** — `npx tsc --noEmit`, `npx eslint src/`, `npx jest`, then
  `node scripts/check-loc.mjs` and `npm run check:quality`. The last two are blocking CI gates
  and the LOC one is the easiest to trip here.
- Fixes in this area need a **guard test plus a negative control** — a blanket skip passes the
  guard assertion alone. Verify each new test actually fails without its fix.

## Review process note

Roughly a third of the later findings were regressions introduced by the immediately preceding
fix. If a change here produces a new finding of the same shape, that is signal to stop and
address the contract rather than add another guard.
