/**
 * QW-B — Tests for `MockBridge`'s new `getActiveFilePath()` /
 * `getActiveSelection()` `WorkspacePort` methods and the matching
 * `setActiveFilePath` / `setActiveSelection` test fixtures.
 *
 * The two new methods let `buildTurnInput` snapshot the active note and
 * current editor selection into a `<vault-context>` block in the system
 * suffix without booting Obsidian. MockBridge is the only seam tests use
 * to drive that state — see `composeVaultContextBlock` for the formatter.
 */
import { describe, it, expect } from 'vitest';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

describe('MockBridge — WorkspacePort active path + selection (QW-B)', () => {
	it('getActiveFilePath defaults to null', () => {
		const bridge = new MockBridge();
		expect(bridge.getActiveFilePath()).toBeNull();
	});

	it('getActiveSelection defaults to null', () => {
		const bridge = new MockBridge();
		expect(bridge.getActiveSelection()).toBeNull();
	});

	it('setActiveFilePath round-trips through getActiveFilePath', () => {
		const bridge = new MockBridge();
		bridge.setActiveFilePath('specs/foo/idea.md');
		expect(bridge.getActiveFilePath()).toBe('specs/foo/idea.md');
	});

	it('setActiveFilePath(null) clears the path', () => {
		const bridge = new MockBridge();
		bridge.setActiveFilePath('p.md');
		bridge.setActiveFilePath(null);
		expect(bridge.getActiveFilePath()).toBeNull();
	});

	it('setActiveSelection round-trips through getActiveSelection', () => {
		const bridge = new MockBridge();
		bridge.setActiveSelection('hello\nworld');
		expect(bridge.getActiveSelection()).toBe('hello\nworld');
	});

	it('setActiveSelection(null) clears the selection', () => {
		const bridge = new MockBridge();
		bridge.setActiveSelection('something');
		bridge.setActiveSelection(null);
		expect(bridge.getActiveSelection()).toBeNull();
	});

	it('the two fields are independent', () => {
		const bridge = new MockBridge();
		bridge.setActiveFilePath('a.md');
		bridge.setActiveSelection('text');
		expect(bridge.getActiveFilePath()).toBe('a.md');
		expect(bridge.getActiveSelection()).toBe('text');
		bridge.setActiveFilePath(null);
		expect(bridge.getActiveSelection()).toBe('text');
	});
});

describe('MockBridge — WorkspacePort vault metadata (QW-C)', () => {
	it('getVaultName defaults to "Mock Vault"', () => {
		const bridge = new MockBridge();
		expect(bridge.getVaultName()).toBe('Mock Vault');
	});

	it('getMarkdownFileCount defaults to 0', () => {
		const bridge = new MockBridge();
		expect(bridge.getMarkdownFileCount()).toBe(0);
	});

	it('setVaultName round-trips through getVaultName', () => {
		const bridge = new MockBridge();
		bridge.setVaultName('My Notes');
		expect(bridge.getVaultName()).toBe('My Notes');
	});

	it('setMarkdownFileCount round-trips through getMarkdownFileCount', () => {
		const bridge = new MockBridge();
		bridge.setMarkdownFileCount(42);
		expect(bridge.getMarkdownFileCount()).toBe(42);
	});
});
