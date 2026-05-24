import type { IconNode, IconPort } from '@/domain/ports';
import { lookupIconNode } from './iconNodeMap';

/**
 * Static-map `IconPort` (SPEC-RR-012) — the synthetic backing shared by
 * `MockBridge` (`npm run dev`) and `LocalStorageBridge` (GitHub Pages demo).
 *
 * `setIcon` is pure, synchronous, total and idempotent: it resolves a logical
 * icon name to a declarative `IconNode` from the shared static map, or `null`
 * for an unknown name (the caller falls back to a generic icon — REQ-RR-019).
 * No DOM element, no HTML string, no DOM-injection sink (NFR-RR-006).
 *
 * Stateless, so a single shared singleton (`staticIconPort`) is safe to reuse.
 */
class StaticIconPort implements IconPort {
	setIcon(name: string): IconNode | null {
		return lookupIconNode(name);
	}
}

/** Shared, stateless static-map icon port backed by {@link lookupIconNode}. */
export const staticIconPort: IconPort = new StaticIconPort();
