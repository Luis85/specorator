import { MarkdownView, type App } from 'obsidian';
import type { AuxModelPort, NotificationPort } from '@/domain/ports';
import type { AttachedImage } from '@/domain/chat/attachments';
import type { InlineEditDecision } from '@/ui/chat/modalSeam';
import { InlineEditUseCase } from '@/application/chat/inlineEdit/InlineEditUseCase';
import { InlineEditModal, type InlineEditModalLabels } from './modals/InlineEditModal';
import { ImagePreviewModal } from './modals/ImagePreviewModal';

/**
 * The P5 inline-edit + image-preview launchers (SPEC-CA-026, ADR-CA-004 §1). This
 * is the ONLY place the two Obsidian `Modal`s are wired into the production seam —
 * `AgentSidebarView` (and the editor command) calls these, so the Vue surface
 * never imports `obsidian` or the modals (NFR-CA-002). Each launcher builds its use
 * case over the provided cold-start `AuxModelPort` (no provider-id branch,
 * SPEC-CA-029) and applies the accepted edit to the ACTIVE editor (REQ-CA-024); a
 * reject / dismiss leaves the note unchanged (REQ-CA-025). Labels are literal
 * strings, matching the existing fork/delete/instruction launchers.
 */

const INLINE_EDIT_LABELS: InlineEditModalLabels = {
	title: 'Inline edit',
	promptPlaceholder: 'Describe the edit…',
	submit: 'Edit',
	querying: 'Editing…',
	accept: 'Accept',
	reject: 'Reject',
	clarifyReplyPlaceholder: 'Reply…',
	continueLabel: 'Continue',
	failed: 'Inline edit produced no usable result.',
};

const IMAGE_PREVIEW_LABELS = { title: 'Image preview', close: 'Close' };

/**
 * Open the inline-edit modal pre-bound to the selection, drive
 * `InlineEditUseCase` over the aux, and APPLY an accepted edit to the active
 * editor's selection (REQ-CA-024). Resolves the decision (or `null` on a
 * failure/dismiss) so the Vue caller stays free of `obsidian`.
 */
export async function openInlineEdit(
	app: App,
	aux: AuxModelPort,
	notify: NotificationPort,
	params: { selectedText: string; notePath?: string },
): Promise<InlineEditDecision | null> {
	const useCase = new InlineEditUseCase(aux);
	const decision = await new InlineEditModal(
		app,
		useCase,
		notify,
		params,
		INLINE_EDIT_LABELS,
	).openAndWait();
	// Apply on accept: replace the active editor's current selection range
	// (the modal was opened on it). A reject / dismiss / failure leaves it unchanged.
	if (decision?.kind === 'accept') {
		const editor = app.workspace.getActiveViewOfType(MarkdownView)?.editor;
		editor?.replaceSelection(decision.editedText);
	}
	return decision;
}

/**
 * Open the full-size image preview (REQ-CA-008). The `src` is the captured base64
 * snapshot as a `data:` URI — the modal never touches the payload beyond the
 * resolved `src` (EC-CA-15: a moved/deleted source file keeps the preview stable).
 */
export function openImagePreview(_app: App, image: AttachedImage): Promise<void> {
	return new ImagePreviewModal(
		_app,
		{ src: `data:${image.mimeType};base64,${image.dataBase64}`, alt: image.path },
		IMAGE_PREVIEW_LABELS,
	).openAndWait();
}
