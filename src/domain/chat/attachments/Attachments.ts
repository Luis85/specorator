/**
 * Attachment DTOs (SPEC-CA-002, ADR-CA-001 §1/§3). Pure domain data — readonly
 * string/number/enum fields, no class, no `obsidian`, no `node:*` — so they cross
 * the Pinia store boundary cleanly (NFR-CA-004) and serialise without a custom
 * codec. Mirrors claudian-main `features/chat/ui/file-context/state/FileContextState.ts`
 * (the attached-file set), `utils/fileLink.ts` (the display name), and
 * `utils/imageEmbed.ts` (`IMAGE_EXTENSIONS`).
 */

/** A vault file attached to the turn as a context chip (REQ-CA-001..006). */
export interface AttachedFileRef {
	/** Vault-relative, no leading slash (VaultPort contract). */
	readonly path: string;
	/** Chip label — basename WITHOUT extension (fileLink parity; SPEC-CA-019). */
	readonly displayName: string;
}

/** A supported image MIME — the allow-list ported from claudian `IMAGE_EXTENSIONS` (ADR-CA-001 §3). */
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/** An image attached to the turn, carried as bounded base64 (REQ-CA-007..012). */
export interface AttachedImage {
	/** Vault-relative source (the thumbnail display source + the read source). */
	readonly path: string;
	readonly mimeType: ImageMimeType;
	/** Measured at attach time; the 8 MiB gate reads it (SPEC-CA-015). */
	readonly byteSize: number;
	/** The bounded base64 payload the runtime embeds in the turn — no data-URI prefix (ADR-CA-001 §3). */
	readonly dataBase64: string;
}
