/**
 * T-CA-012 (RED) — `LocalStorageBridge` selection ports + `readBinary`
 * (SPEC-CA-009 selection + readBinary legs).
 *
 * The LocalStorage selection ports are INERT: `getCurrentSelection()` → null,
 * `supportsBrowserSelection: false`, `onSelectionChange` registers but NEVER
 * fires; the highlight is a no-op. `readBinary` is localStorage-backed bytes
 * (parity with the LS `readFile`) — a missing path rejects.
 *
 * Fails until T-CA-013 supplies the inert LS selection ports + the real LS
 * `readBinary` (replacing the throwing stub). No `obsidian`/`node:*`.
 *
 * Traces: TEST-CA-013/014/015 (LS backing), TEST-CA-010 (LS readBinary),
 * SPEC-CA-009, REQ-CA-018, NFR-CA-010.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge';
import type {
	SelectionSourcePort,
	SelectionHighlightPort,
} from '@/domain/ports';
import type { EditorSelectionContext } from '@/domain/chat/attachments/Selection';

const editorSel: EditorSelectionContext = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'hello',
	startLine: 0,
	lineCount: 1,
};

describe('LocalStorageBridge selection ports (SPEC-CA-009 selection leg)', () => {
	it('exposes an inert SelectionSourcePort', () => {
		const bridge = new LocalStorageBridge();
		const source: SelectionSourcePort = bridge.selectionSource;
		expect(source.getCurrentSelection()).toBeNull();
		expect(source.supportsBrowserSelection).toBe(false);
	});

	it('onSelectionChange registers but never fires', () => {
		const bridge = new LocalStorageBridge();
		const listener = vi.fn();
		const unsubscribe = bridge.selectionSource.onSelectionChange(listener);
		expect(typeof unsubscribe).toBe('function');
		expect(listener).not.toHaveBeenCalled();
		// Unsubscribing is safe and still never fires anything.
		expect(() => {
			unsubscribe();
		}).not.toThrow();
		expect(listener).not.toHaveBeenCalled();
	});

	it('exposes a no-op SelectionHighlightPort (never throws)', () => {
		const bridge = new LocalStorageBridge();
		const highlight: SelectionHighlightPort = bridge.selectionHighlight;
		expect(() => {
			highlight.show(editorSel);
		}).not.toThrow();
		expect(() => {
			highlight.clear();
		}).not.toThrow();
	});
});

describe('LocalStorageBridge.readBinary (SPEC-CA-009 readBinary leg)', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('returns localStorage-backed bytes written by the bridge', async () => {
		const bridge = new LocalStorageBridge();
		const bytes = new Uint8Array([1, 2, 3, 250]);
		bridge.seedBinary('media/x.png', bytes);
		const read = await bridge.readBinary('media/x.png');
		expect(Array.from(read)).toEqual([1, 2, 3, 250]);
	});

	it('rejects for a missing path', async () => {
		const bridge = new LocalStorageBridge();
		await expect(bridge.readBinary('media/none.png')).rejects.toThrow();
	});
});
