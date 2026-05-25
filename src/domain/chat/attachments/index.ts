/**
 * Barrel for the P5 attachment + selection DTOs (SPEC-CA-002/003). One-stop
 * import for the attachment file refs, the image DTO + its MIME allow-list, and
 * the `CapturedSelection` discriminated union.
 */
export type { AttachedFileRef, AttachedImage, ImageMimeType } from './Attachments';
export type {
	EditorSelectionContext,
	CanvasSelectionContext,
	BrowserSelectionContext,
	CapturedSelection,
} from './Selection';
