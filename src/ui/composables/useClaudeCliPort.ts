/**
 * @deprecated WS-1 / ADR-MPS-001 — renamed to `useChatTransportPort`.
 * This re-export shim ships for one release so downstream consumers
 * have time to migrate; the file is removed in the next minor version.
 *
 * Allow-listed by `tests/lint/no-legacy-claude-cli-port-names.test.ts`
 * and `scripts/codemod/rename-claude-cli-port.mjs`.
 */
export { useChatTransportPort as useClaudeCliPort } from './useChatTransportPort';
