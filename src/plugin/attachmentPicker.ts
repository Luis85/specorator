import { FuzzySuggestModal, type App, type TFile } from 'obsidian';
import type { PickedAttachment } from '@/ui/chat/modalSeam';
import { resolveImageMime } from '@/infrastructure/image/imageEncode';

/**
 * The P5 paperclip attach-picker launcher (FIX-2.2, SPEC-CA-022/026). The vault
 * file/image picker is Obsidian-specific, so it lives here in `src/plugin/**`
 * (coverage-excluded, manual leg TEST-CA-M1) — `AgentSidebarView` wires it into the
 * `PICK_ATTACHMENT` seam, so the Vue surface never imports `obsidian` (NFR-CA-002).
 * The picked file's extension decides its kind: an allow-list image extension →
 * `image` (the caller runs the 8 MiB/MIME gate), otherwise → `file` (a chip).
 */
class AttachmentPickerModal extends FuzzySuggestModal<TFile> {
	private resolved = false;

	constructor(
		app: App,
		private readonly resolve: (picked: PickedAttachment | null) => void,
	) {
		super(app);
		this.setPlaceholder('Attach a vault file or image…');
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.resolved = true;
		const kind = resolveImageMime(file.path) !== null ? 'image' : 'file';
		this.resolve({ kind, path: file.path });
	}

	override onClose(): void {
		super.onClose();
		// A dismiss (Escape / click-away) without a choice resolves `null` — no attach.
		if (!this.resolved) this.resolve(null);
	}
}

/**
 * Open the vault file/image picker; resolves the picked attachment or `null` on
 * dismiss (SPEC-CA-022/026). Coverage-excluded (Obsidian `Modal`) → manual leg.
 */
export function pickAttachment(app: App): Promise<PickedAttachment | null> {
	return new Promise<PickedAttachment | null>((resolve) => {
		new AttachmentPickerModal(app, resolve).open();
	});
}
