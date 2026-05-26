/**
 * T-PV-008 (TEST-PV-112 port-shape leg) — RED: `HomeFsPort` exposes EXACTLY
 * `isAvailable(): boolean` (sync) + the three read-only `Result`-typed async methods
 * (`readFile`/`exists`/`listFolders`) — NO write/delete method (REQ-PV-081);
 * `HOME_FS_ROOTS = ['.codex', '.claude']` is the declared root constant;
 * `HOME_FS_PORT` is its OWN `InjectionKey` in `@/infrastructure/bridge/ports`; the
 * barrel `@/domain/ports` re-exports `HomeFsPort` + `HOME_FS_ROOTS`. The path-escape
 * + inert/seedable behaviour is the Mock leg (T-PV-013/014); the real `node:fs` is
 * the manual leg (TEST-PV-M1/M2).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-PV-009 adds the port + key + barrel.
 *
 * Traces: TEST-PV-112, SPEC-PV-007, REQ-PV-080..083, NFR-PV-006.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { HomeFsPort } from '@/domain/ports/HomeFsPort';
import { HOME_FS_ROOTS } from '@/domain/ports/HomeFsPort';
import type { HomeFsPort as PortFromBarrel } from '@/domain/ports';
import { HOME_FS_ROOTS as rootsFromBarrel } from '@/domain/ports';
import { HOME_FS_PORT } from '@/infrastructure/bridge/ports';
import type { Result } from '@/domain/shared/Result';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-export is the same type as the own module ----
const _barrelSame: Equals<HomeFsPort, PortFromBarrel> = true;
void _barrelSame;

// ---- The port exposes EXACTLY the four read members (no write/delete) ----
const _members: Equals<
	keyof HomeFsPort,
	'isAvailable' | 'readFile' | 'exists' | 'listFolders'
> = true;
void _members;

// ---- isAvailable is synchronous; the reads are Result-typed promises ----
const _isAvailable: Equals<HomeFsPort['isAvailable'], () => boolean> = true;
const _readFile: Equals<
	HomeFsPort['readFile'],
	(relativePath: string) => Promise<Result<string>>
> = true;
const _exists: Equals<
	HomeFsPort['exists'],
	(relativePath: string) => Promise<Result<boolean>>
> = true;
const _listFolders: Equals<
	HomeFsPort['listFolders'],
	(relativePath: string) => Promise<Result<readonly string[]>>
> = true;
void _isAvailable;
void _readFile;
void _exists;
void _listFolders;

// ---- The key is its own InjectionKey<HomeFsPort> ----
const _key: Equals<typeof HOME_FS_PORT, InjectionKey<HomeFsPort>> = true;
void _key;

describe('HomeFsPort shape + key + HOME_FS_ROOTS (TEST-PV-112)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof HOME_FS_PORT).toBe('symbol');
	});

	it('HOME_FS_ROOTS is exactly [".codex", ".claude"]', () => {
		expect(HOME_FS_ROOTS).toEqual(['.codex', '.claude']);
	});

	it('the barrel re-export is the same constant', () => {
		expect(rootsFromBarrel).toBe(HOME_FS_ROOTS);
	});

	it('an implementation satisfies the four read-only methods (no write/delete)', async () => {
		const port: HomeFsPort = {
			isAvailable: () => false,
			readFile: () => Promise.resolve({ ok: true, value: '' }),
			exists: () => Promise.resolve({ ok: true, value: false }),
			listFolders: () => Promise.resolve({ ok: true, value: [] }),
		};
		expect(port.isAvailable()).toBe(false);
		const read = await port.readFile('.codex/sessions/x.jsonl');
		expect(read.ok).toBe(true);
		const folders = await port.listFolders('.codex');
		expect(folders.ok && folders.value).toEqual([]);
		// No write/delete verb exists on the port (compile-enforced by `_members`).
		expect('writeFile' in port).toBe(false);
		expect('deleteFile' in port).toBe(false);
	});
});
