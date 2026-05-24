/**
 * T-PSR-012 (TEST-PSR-011) — RED: `WorkspacePort` is `openFile`-only.
 *
 * SPEC-PSR-009 / OC-PSR-1 revert the port to its ADR-008 shape, dropping the
 * chat-era members (`getActiveFile`, `onActiveFileChanged`, `getActiveFilePath`,
 * `getActiveSelection`, `getVaultName`, `getMarkdownFileCount`). The
 * compile-time exactness assertion below fails `npm run typecheck` against the
 * current fat interface and goes GREEN once T-PSR-013 narrows it.
 * Traces: REQ-PSR-005; SPEC-PSR-009.
 */
import { describe, it, expect } from 'vitest';
import type { WorkspacePort } from '@/domain/ports/WorkspacePort';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

// Exact-key equality: true only when WorkspacePort exposes ONLY `openFile`.
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const _workspacePortIsOpenFileOnly: Equals<keyof WorkspacePort, 'openFile'> = true;
void _workspacePortIsOpenFileOnly;

describe('WorkspacePort shape (TEST-PSR-011)', () => {
	it('MockBridge satisfies the narrowed WorkspacePort (openFile present)', () => {
		const port: WorkspacePort = new MockBridge();
		expect(typeof port.openFile).toBe('function');
	});
});
