import { ok, err, type Result } from '@/domain/shared/Result';
import { tryAsync } from '@/domain/shared/tryAsync';
import type { VaultPort } from '@/domain/ports';
import type { AttachedImage } from '@/domain/chat/attachments';
import {
	MAX_IMAGE_BYTES,
	encodeImageBase64,
	resolveImageMime,
} from '@/infrastructure/image/imageEncode';

/**
 * Attach a vault image as bounded base64 (SPEC-CA-015, REQ-CA-007/012). Claudian
 * ground-truth: `ImageContext.ts` + `imageEmbed.ts`. Runs the gate IN ORDER
 * (SPEC-CA-010): (1) resolve MIME from the extension — a non-image → `err` BEFORE
 * any read (EC-CA-2); (2) read bytes via `vault.readBinary` wrapped in `tryAsync`
 * — a missing file → `err`, never an unguarded throw; (3) `byteSize >
 * MAX_IMAGE_BYTES` → `err` MEASURED before encode (no oversize string built,
 * EC-CA-1); (4) else encode → `ok(AttachedImage)`.
 *
 * A rejected image never produces an `AttachedImage` (the caller only adds on
 * `ok`); the payload carries no secret, nothing is written to `data.json`
 * (NFR-CA-009, SPEC-CA-030). `Result`-returning, never throws (NFR-CA-004); no
 * provider branch; no `obsidian`/Vue import — the encode helper lives in infra
 * (SPEC-CA-010 sanctions the application→infra import).
 */
export class AddImageUseCase {
	constructor(private readonly vault: VaultPort) {}

	async execute(path: string): Promise<Result<AttachedImage>> {
		// (1) MIME allow-list gate — reject before any read (EC-CA-2).
		const mimeType = resolveImageMime(path);
		if (mimeType === null) {
			return err(new Error(`Unsupported image type: ${path}`));
		}

		// (2) Read bytes, guarded — a missing file is a Result.err, never a throw.
		const read = await tryAsync(() => this.vault.readBinary(path));
		if (!read.ok) return read;
		const bytes = read.value;

		// (3) Size gate — measured BEFORE the encode (no oversize string is built).
		const byteSize = bytes.byteLength;
		if (byteSize > MAX_IMAGE_BYTES) {
			return err(new Error(`Image exceeds the ${MAX_IMAGE_BYTES}-byte limit: ${path}`));
		}

		// (4) Encode.
		const dataBase64 = encodeImageBase64(bytes, mimeType);
		return ok({ path, mimeType, byteSize, dataBase64 });
	}
}
