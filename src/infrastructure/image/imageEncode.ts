import type { ImageMimeType } from '@/domain/chat/attachments';

/**
 * Bounded base64 image-encode + gate constants (SPEC-CA-010, ADR-CA-001 §3).
 * Pure / total — no `obsidian` import, no new runtime dependency (NFR-CA-011).
 * The 8 MiB + allow-list GATE ORDER (MIME → readBinary → size → encode) is
 * enforced by `AddImageUseCase` (SPEC-CA-015, T-CA-020); this module is just the
 * constants + transforms it composes. Claudian ground-truth:
 * `utils/imageEmbed.ts` (`IMAGE_EXTENSIONS`).
 */

/** The maximum image byte size accepted into a turn — 8 MiB (ADR-CA-001 §3). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * The supported image MIME allow-list — the four members of `ImageMimeType`
 * (ported + narrowed from claudian `IMAGE_EXTENSIONS`; SVG/BMP/ICO are excluded
 * per ADR-CA-001 §3 / SPEC-CA-002).
 */
export const IMAGE_MIME_ALLOW_LIST: readonly ImageMimeType[] = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
];

/** Map a lower-cased file extension to its allow-list MIME (or `null`). */
const EXTENSION_TO_MIME: Readonly<Record<string, ImageMimeType>> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
};

/**
 * Resolve the allow-list `ImageMimeType` from a file path's extension, or `null`
 * if the extension is not an allow-list image (e.g. `.exe`/`.md`/`.svg`/`.bmp`/
 * `.ico`/extensionless — EC-CA-2). Case-insensitive. Pure / total.
 */
export function resolveImageMime(path: string): ImageMimeType | null {
	const lastDot = path.lastIndexOf('.');
	// No extension (or a leading-dot file with no real extension) → no member.
	if (lastDot <= 0 || lastDot === path.length - 1) return null;
	const ext = path.slice(lastDot + 1).toLowerCase();
	return EXTENSION_TO_MIME[ext] ?? null;
}

/**
 * Encode raw image bytes as base64 — NO data-URI prefix (the runtime/CLI
 * prompt-assembly owns the framing, SPEC-CA-002). Uses the global `btoa`
 * (available in the browser, Obsidian's Electron renderer, and Node ≥ 16 — the
 * vitest runtime). Pure given the bytes; total — empty bytes encode to `''`,
 * never throws. The `mimeType` is part of the contract (the caller has already
 * resolved + gated it); it is not embedded in the output.
 */
export function encodeImageBase64(bytes: Uint8Array, _mimeType: ImageMimeType): string {
	if (bytes.length === 0) return '';
	let binary = '';
	// Chunk the byte→char fold to avoid a huge intermediate apply on large images.
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		const slice = bytes.subarray(i, i + CHUNK);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}
