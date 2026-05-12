---
id: DESIGN-<SLUG>
surface: <surface type — page | flow | component-set | email | deck>
slug: <design-slug>
status: draft            # draft | approved | parked
date: YYYY-MM-DD
owner: design-lead
consulted:
  - ux-designer
  - product-strategist
inputs:
  - <upstream brief, PRD, or prompt — path or URL>
---

# Design brief — <Surface name>

> Approved by the human before Phase 2 (Sketch) begins. A brief with `status: draft` is not a gate pass.

## 1. Surface

**Type:** <!-- page | flow | component-set | email | deck -->  
**Name:** <!-- e.g. "Docs index", "Onboarding flow", "Dashboard v1" -->  
**Entry point:** <!-- URL, command, or user trigger that brings the user to this surface -->  
**Exit / conversion goal:** <!-- what the user does when the surface succeeds — "finds the command within 3 clicks", "completes setup", "books a demo" -->

## 2. Audience

**Primary user:** <!-- one sentence describing the target person — role, context, sophistication level -->  
**Job to be done:** <!-- what they are trying to accomplish when they arrive here -->  
**Current pain:** <!-- what is broken or missing that this surface fixes -->

## 3. Success condition

<!-- One measurable statement. "User can navigate to any command reference page within 2 clicks from the index." Not "users find it useful." -->

## 4. Constraints

| Constraint | Detail |
|---|---|
| Responsive | <!-- yes / no / mobile-first / desktop-only --> |
| Accessibility | <!-- WCAG 2.1 AA / AA+ / none specified --> |
| Existing components | <!-- must reuse system / may introduce new / standalone --> |
| Brand compliance | <!-- brand-reviewer runs at Mock phase (always for Specorator surfaces) --> |
| Token additions allowed | <!-- yes — propose via PR / no — resolve to existing tokens only --> |
| Other | <!-- performance budget, i18n, dark mode, etc. --> |

## 5. Out of scope

<!-- What this surface explicitly does not do. Prevents scope creep and frames the sketch. -->

- …

## 6. Open questions

<!-- Questions that must be answered before or during the design track. Owner and due date for each. -->

| # | Question | Owner | Due |
|---|---|---|---|
| 1 | | | |

## 7. Approvals

| Role | Name / agent | Date | Decision |
|---|---|---|---|
| Human | | | Approved / Changes requested |
