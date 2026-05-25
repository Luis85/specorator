/**
 * T-CA-023 (RED) — `AddImageUseCase` (SPEC-CA-015). The gate runs IN ORDER:
 * (1) resolve MIME from the extension — a non-image (`.exe`) → `err` BEFORE any
 * read (REQ-CA-012, EC-CA-2); (2) read bytes via `vault.readBinary` wrapped in
 * `tryAsync` — a missing file → `err`, never an unguarded throw; (3) `byteSize >
 * MAX_IMAGE_BYTES` → `err` MEASURED before encode (no oversize string built,
 * REQ-CA-012, EC-CA-1); (4) else encode → `ok({ path, mimeType, byteSize,
 * dataBase64 })`. A rejected image never enters the set; the payload carries no
 * secret (only path + MIME + size + base64).
 *
 * Fails (RED) until T-CA-024 implements
 * `src/application/chat/attachments/AddImageUseCase.ts`.
 *
 * Traces: TEST-CA-007 (U leg), TEST-CA-012, TEST-CA-030 (no-secret leg),
 * SPEC-CA-015, REQ-CA-007/012, NFR-CA-009/004, EC-CA-1/2.
 */
import { describe, it, expect } from 'vitest';
import { AddImageUseCase } from '@/application/chat/attachments/AddImageUseCase';
import { MAX_IMAGE_BYTES, encodeImageBase64 } from '@/infrastructure/image/imageEncode';
import { fakeModulePorts } from '../../../__fakes__/fake-ports';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('TEST-CA-007 AddImageUseCase.execute — happy path', () => {
	it('resolves MIME, reads bytes, and encodes to an AttachedImage', async () => {
		const ports = fakeModulePorts();
		ports.bridge.seedBinary('img/logo.png', PNG_BYTES);
		const result = await new AddImageUseCase(ports.vault).execute('img/logo.png');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			path: 'img/logo.png',
			mimeType: 'image/png',
			byteSize: PNG_BYTES.length,
			dataBase64: encodeImageBase64(PNG_BYTES, 'image/png'),
		});
	});

	it('TEST-CA-030: the payload carries no secret — only path/MIME/size/base64', async () => {
		const ports = fakeModulePorts();
		ports.bridge.seedBinary('img/logo.png', PNG_BYTES);
		const result = await new AddImageUseCase(ports.vault).execute('img/logo.png');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(Object.keys(result.value).sort()).toEqual(
			['byteSize', 'dataBase64', 'mimeType', 'path'].sort(),
		);
		// base64 alphabet only — no raw bytes / data-URI prefix leak.
		expect(result.value.dataBase64).toMatch(/^[A-Za-z0-9+/=]*$/);
	});
});

describe('TEST-CA-012 AddImageUseCase.execute — gate order', () => {
	it('EC-CA-2: a non-image (.exe) → err BEFORE any read', async () => {
		const ports = fakeModulePorts();
		// Seed bytes under the .exe path; the MIME gate must reject before reading.
		ports.bridge.seedBinary('payload.exe', PNG_BYTES);
		const result = await new AddImageUseCase(ports.vault).execute('payload.exe');
		expect(result.ok).toBe(false);
	});

	it('a missing file → err (readBinary rejection guarded by tryAsync)', async () => {
		const ports = fakeModulePorts();
		const result = await new AddImageUseCase(ports.vault).execute('missing/absent.png');
		expect(result.ok).toBe(false);
	});

	it('EC-CA-1: an oversize image (> 8 MiB) → err, measured before encode', async () => {
		const ports = fakeModulePorts();
		const oversize = new Uint8Array(MAX_IMAGE_BYTES + 1);
		ports.bridge.seedBinary('img/huge.png', oversize);
		const result = await new AddImageUseCase(ports.vault).execute('img/huge.png');
		expect(result.ok).toBe(false);
	});

	it('an image exactly at the 8 MiB boundary is accepted', async () => {
		const ports = fakeModulePorts();
		const atLimit = new Uint8Array(MAX_IMAGE_BYTES);
		ports.bridge.seedBinary('img/limit.png', atLimit);
		const result = await new AddImageUseCase(ports.vault).execute('img/limit.png');
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.byteSize).toBe(MAX_IMAGE_BYTES);
	});

	it('never throws across the boundary on a missing file', async () => {
		const ports = fakeModulePorts();
		await expect(new AddImageUseCase(ports.vault).execute('nope.png')).resolves.toBeDefined();
	});
});

// ── FIX-2.3 (was R-CA-002): drop/paste — gate in-hand bytes (no vault read) ──────
// SPEC-CA-015, REQ-CA-007/012. A dropped/pasted image's bytes are already in hand
// (a `File`), so `executeBytes(name, bytes)` runs the SAME MIME→size→encode gate
// without a `readBinary` round-trip. Claudian ground-truth: `ImageContext.addImageFromFile`.

describe('AddImageUseCase.executeBytes — in-hand bytes (drop/paste)', () => {
	it('REQ-CA-007: resolves MIME from the name and encodes in-hand bytes to an AttachedImage', () => {
		const ports = fakeModulePorts();
		const result = new AddImageUseCase(ports.vault).executeBytes('pasted.png', PNG_BYTES);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			path: 'pasted.png',
			mimeType: 'image/png',
			byteSize: PNG_BYTES.length,
			dataBase64: encodeImageBase64(PNG_BYTES, 'image/png'),
		});
	});

	it('EC-CA-2: a non-image name (.exe) → err (no AttachedImage)', () => {
		const ports = fakeModulePorts();
		const result = new AddImageUseCase(ports.vault).executeBytes('payload.exe', PNG_BYTES);
		expect(result.ok).toBe(false);
	});

	it('EC-CA-1: oversize in-hand bytes (> 8 MiB) → err', () => {
		const ports = fakeModulePorts();
		const oversize = new Uint8Array(MAX_IMAGE_BYTES + 1);
		const result = new AddImageUseCase(ports.vault).executeBytes('huge.png', oversize);
		expect(result.ok).toBe(false);
	});
});
