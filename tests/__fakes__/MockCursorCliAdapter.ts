/**
 * T-MPS-064 — Test-side re-export of `MockCursorCliAdapter` so test suites can
 * pull it from `tests/__fakes__/` alongside the other shared mocks
 * (ADR-009). The implementation lives under `src/infrastructure/mock/` so
 * the standalone browser UI (`npm run dev`) can consume it without crossing
 * a `tests/` import boundary.
 */
export { MockCursorCliAdapter } from '@/infrastructure/mock/MockCursorCliAdapter'
