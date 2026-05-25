/**
 * T-CA-005 (TEST-CA-010 shape leg + TEST-CA-028 readBinary additivity) — RED:
 * `VaultPort` gains EXACTLY `readBinary(path) -> Promise<Uint8Array>`; the seven
 * P0–P4 members stay byte-identical (SPEC-CA-006/028).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-006 appends the member.
 *
 * Traces: TEST-CA-010 (shape leg), TEST-CA-028 (additivity), SPEC-CA-006/028,
 * REQ-CA-010, ADR-CA-001 §3, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type { VaultPort } from '@/domain/ports';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- the seven P0–P4 members + the one P5 additive member, EXACTLY ----
const _keys: Equals<
	keyof VaultPort,
	| 'readFile'
	| 'writeFile'
	| 'deleteFile'
	| 'listFiles'
	| 'listFolders'
	| 'fileExists'
	| 'createFolder'
	| 'readBinary'
> = true;
void _keys;

// ---- readBinary(path) -> Promise<Uint8Array> ----
const _readBinary: Equals<VaultPort['readBinary'], (path: string) => Promise<Uint8Array>> = true;
void _readBinary;

// ---- the P0–P4 members byte-identical ----
const _readFile: Equals<VaultPort['readFile'], (path: string) => Promise<string>> = true;
const _writeFile: Equals<VaultPort['writeFile'], (path: string, content: string) => Promise<void>> =
	true;
void _readFile;
void _writeFile;

describe('VaultPort.readBinary additivity (TEST-CA-010/028 shape leg)', () => {
	it('a structural impl resolves a Uint8Array', async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const port: Pick<VaultPort, 'readBinary'> = {
			readBinary: async (path: string) => {
				void path;
				return bytes;
			},
		};
		const out = await port.readBinary('img/a.png');
		expect(out).toBeInstanceOf(Uint8Array);
		expect(Array.from(out)).toEqual([1, 2, 3]);
	});
});
