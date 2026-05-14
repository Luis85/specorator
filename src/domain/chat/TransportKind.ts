/**
 * Discriminated string union for the chat transport selector (SPEC-ASM-001 §2.1).
 *
 *   'auto'         — defer to runtime detection (default; resolved by selectTransport)
 *   'api-key'      — force the SDK / API-key transport
 *   'subscription' — force the subscription / CLI subprocess transport
 *   'degraded'     — no transport available; selector returns the degraded sink
 *
 * Satisfies REQ-ASM-001, REQ-ASM-002.
 *
 * This file is part of the domain layer (ADR-008). It must not import from
 * 'obsidian', 'child_process', or any infrastructure module.
 */
export type TransportKind = 'auto' | 'api-key' | 'subscription' | 'degraded'
