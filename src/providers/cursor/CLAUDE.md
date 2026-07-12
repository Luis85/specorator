# Cursor Provider

Adaptor for Cursor Agent over first-party ACP (`agent acp`), built on the shared `src/providers/acp/` transport plus Cursor's own dialect extensions (`runtime/cursorAcpExtensions.ts`).

## Runtime gotchas

- `usage_update` (the accepted ACP session-usage RFD, agentclientprotocol.com/rfds/session-usage.md) is NOT emitted by `agent acp` as of CLI 2026.07.09, per Cursor staff — usage derives from the model-window fallback instead. Don't go hunting for that frame on the wire.
- `session/list` is absent from Cursor's ACP surface — JSONL hydration from `~/.cursor/chats/<workspace>/<session>/` stays the history source of truth. Re-check before proposing a migration to an ACP-native session list.
- `cursor/task`'s notification-vs-request label is unreliable (real captures show it arriving as a BLOCKING request despite docs elsewhere implying otherwise) — treat the documented response schema as the contract, not the label.
- `cursor/generate_image` carries the same label/schema contradiction as `cursor/task` (docs call it a notification but document a response schema); it is registered defensively as a request handler in `cursorAcpExtensions.ts` even though no real capture has shown it firing yet.
