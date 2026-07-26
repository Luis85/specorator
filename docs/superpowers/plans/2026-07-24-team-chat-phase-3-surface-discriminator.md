---
title: "Team Chat — Phase 3: surface discriminator — Implementation Plan"
date: 2026-07-24
status: draft
scope: src/core/types/chat.ts, src/app/conversations/ConversationStore.ts, src/core/bootstrap/SessionStorage.ts, src/core/types/PluginContext.ts, src/main.ts
relates-to: docs/research/... (Phase 3 surface map, in-session), docs/superpowers/specs/2026-07-24-team-chat-design.md
---

# Team Chat — Phase 3: surface discriminator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `surface: 'chat' | 'team-chat'` tag to conversations, propagate it losslessly through the persist⇄load⇄list chain, and exclude `team-chat` conversations from the ad-hoc chat history UI by filtering the single `getConversationList()` chokepoint — so the Team Chat DM threads Phase 4 creates never intermingle with ordinary chat history, while environment reconciliation still sees every conversation.

**Architecture:** `surface` mirrors the existing optional `boundAgentId`/`workOrderPath` overlay fields, defaulting to `'chat'` when absent (existing data untouched). It rides `SessionMetadata` (persisted) → `Conversation` (in-memory) → `ConversationMeta` (list item) — and, unlike `boundAgentId`, must reach `ConversationMeta` because both history consumers read that type. Every hop is optional so the compiler enforces none of it; roundtrip tests (construct → save → reload → assert survived) are the safety net. The exclusion filter lives ONLY at `ConversationStore.getConversationList()` — that covers the header history dropdown, the composer `$` resume flow, and the fork-title dedup for free; the `getConversations()` sibling (env/model reconciliation) stays deliberately unfiltered.

**Tech Stack:** TypeScript, Jest.

---

## File Structure

| File | Change |
|------|--------|
| `src/core/types/chat.ts` | add `surface?: 'chat' \| 'team-chat'` to `Conversation` (~:120), `SessionMetadata` (~:163), `ConversationMeta` (~:135) |
| `src/app/conversations/ConversationStore.ts` | `createConversation` options + literal; `loadConversations` map; `getConversationList` literal **+ the exclusion filter** |
| `src/core/bootstrap/SessionStorage.ts` | `toSessionMetadata` literal; `listAllConversations` literal |
| `src/core/types/PluginContext.ts` | mirror the `createConversation` options signature (~:142) |
| `src/main.ts` | mirror the `createConversation` options signature (~:730) |
| Tests | `tests/unit/app/conversations/ConversationStore.test.ts` (roundtrip + filter + reconciliation-unfiltered), `tests/unit/providers/claude/storage/SessionStorage.test.ts` (toSessionMetadata surface), `tests/integration/main.test.ts` (end-to-end filter) |

**Ordering:** types + option signatures (compiles, inert) → propagation + roundtrip tests → filter + filter/reconciliation tests.

---

## Task 1 — Add `surface` to the three types + the `createConversation` option (×3 copies)

**Files:** Modify `src/core/types/chat.ts`, `src/app/conversations/ConversationStore.ts`, `src/core/types/PluginContext.ts`, `src/main.ts`. Test: none (typecheck gate).

- [ ] 1.1 In `src/core/types/chat.ts`, add to `Conversation` (right after `boundAgentId?: string;`, ~:120):
  ```ts
  /** Which surface owns this conversation. Absent ⇒ ordinary ad-hoc chat; 'team-chat' hides it from the chat history UI. */
  surface?: 'chat' | 'team-chat';
  ```
  Add the identical field to `SessionMetadata` (after its `boundAgentId?: string;`, ~:163) and to `ConversationMeta` (after `titleGenerationStatus?`, ~:135) — same doc comment.

- [ ] 1.2 In `src/app/conversations/ConversationStore.ts`, add `surface?: 'chat' | 'team-chat';` to the `createConversation(options?: {...})` bag (next to `boundAgentId?: string;`). Mirror the exact same option addition in the `createConversation` signature copies in `src/core/types/PluginContext.ts` (~:142) and `src/main.ts` (~:730). (All three signatures are hand-duplicated; missing an outer copy breaks `plugin.createConversation({ surface })` at Phase-4 call sites.)

- [ ] 1.3 Gate: `npm run typecheck && npm run lint`. Expected: green (fields optional, no consumers yet). Commit: `Phase 3 (1/3): add surface? to Conversation/SessionMetadata/ConversationMeta + createConversation option` (+ the two trailer `-m` lines).

## Task 2 — Propagate `surface` through every hop + roundtrip tests

**Files:** Modify `src/app/conversations/ConversationStore.ts`, `src/core/bootstrap/SessionStorage.ts`. Test: `tests/unit/app/conversations/ConversationStore.test.ts`, `tests/unit/providers/claude/storage/SessionStorage.test.ts`.

- [ ] 2.1 **Red — roundtrip tests.** In `ConversationStore.test.ts`, mirror the existing `boundAgentId` precedents (`'persists boundAgentId when provided'` ~:117 and `'loads boundAgentId from metadata on loadConversations'` ~:456). First update the suite's `toSessionMetadata` mock (~:33) to carry `surface: conv.surface,` next to `boundAgentId`. Then add:
  ```ts
  it('persists surface when provided', async () => {
    const conv = await store.createConversation({ surface: 'team-chat' });
    expect(conv.surface).toBe('team-chat');
    await store.updateConversation(conv.id, { title: 'x' });
    expect(sessions.saveMetadata.mock.calls.at(-1)?.[0]).toMatchObject({ surface: 'team-chat' });
  });

  it('loads surface from metadata on loadConversations', async () => {
    sessions.listMetadata.mockResolvedValue([
      { id: 'c1', title: 'DM', createdAt: 1, updatedAt: 1, surface: 'team-chat' },
    ]);
    await store.loadConversations();
    expect(store.getConversationSync('c1')?.surface).toBe('team-chat');
  });
  ```
  Run `npx jest tests/unit/app/conversations/ConversationStore.test.ts -t "surface"`. Expected: FAIL (surface not carried).

- [ ] 2.2 **Green — implement the hops:**
  - `ConversationStore.loadConversations` map (~:87): add `surface: meta.surface,` next to `boundAgentId: meta.boundAgentId,`.
  - `ConversationStore.createConversation` literal (~:134): add `surface: options?.surface,` next to `boundAgentId: options?.boundAgentId,`.
  - `SessionStorage.toSessionMetadata` (~:214): add `surface: conversation.surface,` next to `boundAgentId: conversation.boundAgentId,`.
  - `SessionStorage.listAllConversations` (~:172-190): add `surface: meta.surface,` to its `ConversationMeta` literal (currently unreached, but keep the chain lossless).
  Run the surface tests. Expected: PASS.

- [ ] 2.3 Add a `SessionStorage` `toSessionMetadata` surface assertion in `tests/unit/providers/claude/storage/SessionStorage.test.ts` (mirror its existing field coverage). Run that file. Expected: PASS.

- [ ] 2.4 Gate: `npm run typecheck && npx jest tests/unit/app/conversations/ConversationStore.test.ts tests/unit/providers/claude/storage/SessionStorage.test.ts`. Commit: `Phase 3 (2/3): propagate surface losslessly through persist/load/toSessionMetadata` (+ trailers).

## Task 3 — Filter `team-chat` out of `getConversationList()` (+ keep reconciliation unfiltered)

**Files:** Modify `src/app/conversations/ConversationStore.ts`. Test: `tests/unit/app/conversations/ConversationStore.test.ts`, `tests/integration/main.test.ts`.

- [ ] 3.1 **Red — filter tests.** In `ConversationStore.test.ts`:
  ```ts
  it('excludes team-chat conversations from getConversationList but keeps them in getConversations', async () => {
    await store.createConversation({ surface: 'team-chat' });     // a DM
    await store.createConversation({});                            // an ordinary chat (surface absent ⇒ 'chat')
    const listed = store.getConversationList();
    expect(listed.some((c) => c.surface === 'team-chat')).toBe(false);
    expect(listed.length).toBe(1);
    // Reconciliation sibling still sees ALL conversations (team-chat DMs need env reconciliation too):
    expect(store.getConversations().length).toBe(2);
  });
  ```
  Run `npx jest tests/unit/app/conversations/ConversationStore.test.ts -t "excludes team-chat"`. Expected: FAIL (DM currently listed).

- [ ] 3.2 **Green — implement the filter** in `ConversationStore.getConversationList()` (~:414-426). Add `surface: c.surface,` to the mapped `ConversationMeta` literal, and apply the exclusion when building the list:
  ```ts
  getConversationList(): ConversationMeta[] {
    return this.conversations
      .filter((c) => (c.surface ?? 'chat') !== 'team-chat')   // ad-hoc history only; DMs live in the Team Chat surface
      .map((c) => ({
        // ...existing fields...
        surface: c.surface,
      }));
  }
  ```
  (Keep the existing sort/preview/messageCount logic; only add the `.filter(...)` and the `surface` field.) Run the filter test. Expected: PASS. This one chokepoint covers the header history dropdown (`SpecoratorView.projectChatShell` → `getConversationList()`), the composer `$` resume (`InputController.getConversations → getConversationList()`), and `TabManager.buildForkTitle`'s title-dedup — all correctly scoped to ad-hoc chats.

- [ ] 3.3 Add an integration assertion in `tests/integration/main.test.ts` (its `describe('getConversationList', ...)` ~:915, real store): a `team-chat` conversation is absent from `plugin.getConversationList()` but present via `getConversationSync`. Run it. Expected: PASS.

- [ ] 3.4 Full gate: `npm run typecheck && npm run lint && npm run test`. Expected: green (incl. the `ResumeSessionDropdown` + `buildForkTitle` suites, which are surface-agnostic and trust their input list — confirm they still pass unchanged). Commit: `Phase 3 (3/3): exclude team-chat conversations from getConversationList (history UI chokepoint)` (+ trailers).

## Task 4 — Spec doc fix

- [ ] 4.1 In `docs/superpowers/specs/2026-07-24-team-chat-design.md` §4, correct the Phase-4 preview line from `createConversation({ agentId })` to `createConversation({ boundAgentId: agentId, surface: 'team-chat' })` (the real option is `boundAgentId`, and DMs are created on the `team-chat` surface). Commit with the docs.

---

## Self-Review

- **Spec coverage:** implements §4 surface discriminator — the field on all three types, lossless propagation, and the single-chokepoint filter. Deliberate non-goals confirmed: `getConversations()` (reconciliation) stays unfiltered; `buildForkTitle` inherits the filtered list (fork titles dedup against visible ad-hoc chats only — harmless). Resume-dropdown *scoping on the Team Chat surface* and message-action ownership are Phase 4 (they need the view).
- **Silent-hop risk:** every hop is optional, so the roundtrip tests (2.1) are the enforcement, not the compiler. `listAllConversations` (currently unreached) is patched anyway to keep the chain lossless.
- **Type consistency:** `surface?: 'chat' | 'team-chat'` identical on all three types + all three `createConversation` option copies.
