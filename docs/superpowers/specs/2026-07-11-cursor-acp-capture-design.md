---
title: Cursor ACP diagnostics capture — wire, stderr, and lifecycle recording
date: 2026-07-11
status: implemented (2026-07-14 hardening complete)
scope: src/providers/cursor, src/providers/acp, src/core/transport, src/core/logging
relates-to: docs/superpowers/specs/2026-07-11-cursor-acp-runtime-design.md
---

# Cursor ACP diagnostics capture

## Purpose

The ACP runtime shipped doc-blind (no spike). First-run validation on a real
vault is the verification gate, and every payload mismatch found there needs
raw evidence to fix. This feature records the complete picture of a Cursor
ACP session — wire frames, stderr, lifecycle — so validation runs produce
(a) diagnosable bug reports and (b) capture files that replace the
doc-derived test fixtures 1:1.

## Decisions (validated 2026-07-11)

| Decision | Choice |
|---|---|
| Scope | Full wire capture (both directions) + stderr + lifecycle events + session meta. |
| Tap point | Additive optional hooks on the shared transport (`JsonRpcStdioClient.onWireFrame`, `AcpSubprocess.onStderrData`) — provider-neutral; Cursor is the only consumer now. |
| Storage | `.specorator/captures/cursor/<yyyymmdd-hhmmss>-<pid>/` in the vault. |
| Activation | `captureAcpTraffic` boolean in Cursor provider settings, default OFF; settings-tab toggle; palette command to open the capture folder. |
| Safety | Every written line passes the core `redact` scrubber; writer failures disable capture for the session (single warn), never break a turn. |
| Retention | Newest 20 session dirs kept; pruned on writer start. |

## Components

| Unit | Responsibility |
|---|---|
| `JsonRpcStdioClient` (core/transport) | New optional `onWireFrame?: (direction: 'client' \| 'agent', rawLine: string) => void` in its config; invoked where outbound lines are written and inbound lines are dispatched. No-op cost when unset. |
| `AcpSubprocess` (providers/acp) | New optional `onStderrData?: (chunk: string) => void` alongside the existing ring buffer. |
| `CursorAcpCaptureWriter` (providers/cursor/diagnostics/, new) | Owns one session dir; queued async appends; redaction; retention prune; failure-disable. Files: `wire.jsonl` (`{t, dir, frame}` per line), `stderr.log`, `lifecycle.jsonl`, `meta.json` (CLI version, plugin version, platform, timestamps). |
| `CursorChatRuntime` | Creates a writer per spawn when the setting is on; calls a small `captureEvent()` helper at the lifecycle points it already logs: spawn (CLI path/args, env KEY NAMES only), initialize result, session new/load/fallback, mode/model application, cancel/escalation, exit. |
| Cursor settings tab | Toggle with a "diagnostics only — captures may contain prompt text" description. |
| Command registrar | `Cursor: open ACP capture folder` (reveals the folder via Obsidian/OS). |

## Data flow

```
agent acp stdio ──AcpSubprocess──▶ JsonRpcStdioClient
        │ stderr                        │ onWireFrame(dir, line)
        ▼ onStderrData                  ▼
        CursorAcpCaptureWriter (queue → redact → append)
        ▲
        │ captureEvent(...)
   CursorChatRuntime lifecycle branches
```

## Error handling

- Writer I/O failure: disable capture for the session, warn once via
  `logger.scope('cursor.capture')`, continue the turn untouched.
- Setting toggled mid-session: reconciled against the live process. Transport
  hooks always dereference the current writer, so enabling creates one without
  respawn and disabling flushes/drops it immediately.
- Redaction: JSON frames are parsed and deep key-redacted before serialization,
  then value-level scrubbing catches secret-shaped substrings; malformed/non-JSON
  lines use the string scrubber fallback. Spawn events record env variable names
  only, never values.

## Testing

- Transport: frames reach a registered `onWireFrame` in both directions;
  unset hook adds no behavior (existing suites unchanged).
- Writer: redaction applied to a token-bearing frame; retention prunes to 20;
  first append failure disables subsequent writes and warns once.
- Integration: the fake-ACP-server suite gains a case asserting a scripted
  turn produces a complete, ordered `wire.jsonl` + lifecycle entries.

## Out of scope (YAGNI)

Zip/export bundles, Opencode adoption (seam is ready; wire it when needed), and
UI viewers for captures.

## Validation tie-in

The first-run validation checklist in
`2026-07-11-cursor-acp-runtime-design.md` gains step 0: enable
`captureAcpTraffic` before running the checklist. Captured `wire.jsonl`
files from real runs become the replacement fixtures for today's
doc-derived test data.
