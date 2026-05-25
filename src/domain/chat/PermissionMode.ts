/**
 * The Claudian permission-mode set (P7, SPEC-AS-001, ADR-AS-002 §1). Closed
 * lower-case string union — the fixed three-mode set is the invariant
 * (CLAR-AS-002; no fourth mode, no catalog list). Parity ground-truth:
 * claudian-main `core/types/settings.ts:76` (`PermissionMode = 'yolo' | 'plan' |
 * 'normal'`).
 *
 * `'normal'` is the default; the **absence** of a `permissionMode` value is
 * equivalent to `'normal'` (the no-rules default, REQ-AS-052). `'plan'` gates
 * edits behind the P4 exit-plan block; `'yolo'` auto-approves for the session
 * (SPEC-AS-010). Pure type — no class, no `obsidian`, no `node:*`, no Vue.
 */
export type PermissionMode = 'normal' | 'plan' | 'yolo';
