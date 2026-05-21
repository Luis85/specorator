/**
 * Co-located re-export of `MockCursorApiAdapter` for the test fake surface
 * (NFR-MPS-014). UI and integration tests import from here so the fake
 * surface is discoverable next to the rest of `tests/__fakes__/`.
 *
 * The actual implementation lives under `src/infrastructure/mock/` so it
 * also serves the standalone browser UI (`npm run dev`) via the same
 * module — matching the `MockClaudeCliPort` precedent.
 */
export { MockCursorApiAdapter } from '@/infrastructure/mock/MockCursorApiAdapter'
