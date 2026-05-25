/**
 * T-CA-015 (RED) — bounded base64 image-encode + gate constants (SPEC-CA-010,
 * TEST-CA-010 encode leg + TEST-CA-012 gate-constant leg).
 *
 * Asserts the pure transforms + the gate constants that `AddImageUseCase`
 * (T-CA-020) composes:
 *   - `MAX_IMAGE_BYTES === 8 * 1024 * 1024` (8 MiB);
 *   - `IMAGE_MIME_ALLOW_LIST` is EXACTLY the four members
 *     `['image/png','image/jpeg','image/webp','image/gif']`;
 *   - `encodeImageBase64(bytes, mime)` returns base64 (NO data-URI prefix), pure
 *     given the bytes (deterministic, no `obsidian`);
 *   - `resolveImageMime(path)` maps `.png`/`.jpg`/`.jpeg`/`.webp`/`.gif` to an
 *     allow-list member and `.exe` (+ any non-image) to `null` (no member,
 *     EC-CA-2).
 *
 * Fails until T-CA-016 supplies `@/infrastructure/image/imageEncode`. Pure — no
 * `obsidian`, no new `package.json` dependency.
 *
 * Traces: TEST-CA-010 (encode leg), TEST-CA-012 (gate-constant leg), SPEC-CA-010,
 * REQ-CA-010/012, NFR-CA-009/011.
 */
import { describe, it, expect } from 'vitest';
import {
	MAX_IMAGE_BYTES,
	IMAGE_MIME_ALLOW_LIST,
	encodeImageBase64,
	resolveImageMime,
} from '@/infrastructure/image/imageEncode';
import type { ImageMimeType } from '@/domain/chat/attachments';

describe('image gate constants (TEST-CA-012 gate-constant leg)', () => {
	it('MAX_IMAGE_BYTES is exactly 8 MiB', () => {
		expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
		expect(MAX_IMAGE_BYTES).toBe(8388608);
	});

	it('IMAGE_MIME_ALLOW_LIST is exactly the four members', () => {
		expect([...IMAGE_MIME_ALLOW_LIST]).toEqual([
			'image/png',
			'image/jpeg',
			'image/webp',
			'image/gif',
		]);
	});
});

describe('encodeImageBase64 (TEST-CA-010 encode leg)', () => {
	it('produces base64 with NO data-URI prefix', () => {
		const bytes = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello"
		const mime: ImageMimeType = 'image/png';
		const encoded = encodeImageBase64(bytes, mime);
		expect(encoded).toBe('aGVsbG8=');
		expect(encoded.startsWith('data:')).toBe(false);
	});

	it('is pure / deterministic given the bytes', () => {
		const bytes = new Uint8Array([1, 2, 3, 250, 255, 0]);
		const a = encodeImageBase64(bytes, 'image/jpeg');
		const b = encodeImageBase64(new Uint8Array([1, 2, 3, 250, 255, 0]), 'image/jpeg');
		expect(a).toBe(b);
	});

	it('round-trips through atob back to the original bytes', () => {
		const bytes = new Uint8Array([0, 127, 128, 255, 42]);
		const encoded = encodeImageBase64(bytes, 'image/webp');
		const decoded = atob(encoded);
		const back = new Uint8Array(decoded.length);
		for (let i = 0; i < decoded.length; i++) back[i] = decoded.charCodeAt(i);
		expect(Array.from(back)).toEqual([0, 127, 128, 255, 42]);
	});

	it('encodes empty bytes to an empty string (never throws)', () => {
		expect(encodeImageBase64(new Uint8Array([]), 'image/gif')).toBe('');
	});
});

describe('resolveImageMime (EC-CA-2)', () => {
	it('maps the image extensions to allow-list members', () => {
		expect(resolveImageMime('photo.png')).toBe('image/png');
		expect(resolveImageMime('a/b/photo.jpg')).toBe('image/jpeg');
		expect(resolveImageMime('photo.jpeg')).toBe('image/jpeg');
		expect(resolveImageMime('photo.webp')).toBe('image/webp');
		expect(resolveImageMime('photo.gif')).toBe('image/gif');
	});

	it('is case-insensitive on the extension', () => {
		expect(resolveImageMime('PHOTO.PNG')).toBe('image/png');
		expect(resolveImageMime('Photo.JPeG')).toBe('image/jpeg');
	});

	it('maps .exe (and any non-image) to no member (null)', () => {
		expect(resolveImageMime('malware.exe')).toBeNull();
		expect(resolveImageMime('notes.md')).toBeNull();
		expect(resolveImageMime('diagram.svg')).toBeNull();
		expect(resolveImageMime('bitmap.bmp')).toBeNull();
		expect(resolveImageMime('icon.ico')).toBeNull();
	});

	it('maps an extensionless path to no member (null)', () => {
		expect(resolveImageMime('README')).toBeNull();
		expect(resolveImageMime('')).toBeNull();
	});

	it('every resolved MIME is a member of the allow-list', () => {
		const resolved = resolveImageMime('x.png');
		expect(resolved).not.toBeNull();
		if (resolved !== null) expect(IMAGE_MIME_ALLOW_LIST).toContain(resolved);
	});
});
