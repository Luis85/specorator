/**
 * T-CA-002 (TEST-CA-003) — RED: the attachment DTOs `AttachedFileRef` +
 * `AttachedImage` match the SPEC-CA-002 shapes — `ImageMimeType` is exactly the
 * four-member allow-list, every field `readonly`, re-exported from the
 * `@/domain/chat/attachments/index` barrel.
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-CA-003 supplies the DTOs.
 *
 * Traces: TEST-CA-003, SPEC-CA-002, REQ-CA-001/007/013, NFR-CA-001.
 */
import { describe, it, expect } from 'vitest';
import type {
	AttachedFileRef,
	AttachedImage,
	ImageMimeType,
} from '@/domain/chat/attachments';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- AttachedFileRef = { readonly path; readonly displayName } ----
const _fileRefShape: Equals<
	AttachedFileRef,
	{ readonly path: string; readonly displayName: string }
> = true;
void _fileRefShape;

// ---- ImageMimeType is EXACTLY the four-member allow-list ----
const _mimeExact: Equals<
	ImageMimeType,
	'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
> = true;
void _mimeExact;

// ---- AttachedImage shape (all readonly) ----
const _imageShape: Equals<
	AttachedImage,
	{
		readonly path: string;
		readonly mimeType: ImageMimeType;
		readonly byteSize: number;
		readonly dataBase64: string;
	}
> = true;
void _imageShape;

describe('attachment DTOs (TEST-CA-003)', () => {
	it('constructs an AttachedFileRef with path + displayName', () => {
		const ref: AttachedFileRef = { path: 'folder/note.md', displayName: 'note' };
		expect(ref.path).toBe('folder/note.md');
		expect(ref.displayName).toBe('note');
	});

	it('constructs an AttachedImage with the four-member MIME allow-list', () => {
		const png: AttachedImage = {
			path: 'img/a.png',
			mimeType: 'image/png',
			byteSize: 1024,
			dataBase64: 'AAAA',
		};
		expect(png.mimeType).toBe('image/png');
		const mimes: ImageMimeType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
		expect(mimes).toHaveLength(4);
		expect(mimes).not.toContain('image/svg+xml' as unknown as ImageMimeType);
	});
});
