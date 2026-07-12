// Jest-lane stand-in for the per-tab Vue transcript mount. The real
// `mountTranscript` (src/features/chat/ui/vue/transcript/mountTranscript.ts)
// createApp+mounts an SFC, which the Jest lane can't render; the Vitest lane
// exercises it for real in tests/vue/chat/transcript/mountTranscript.test.ts.
//
// Returns a handle whose `getScrollEl()` is null so the tab wiring falls back to
// its existing messages-wrapper mock element as `dom.messagesEl`.

export const mountTranscript = jest.fn(() => ({
  app: { unmount: jest.fn() },
  getScrollEl: () => null,
  unmount: jest.fn(),
}));
