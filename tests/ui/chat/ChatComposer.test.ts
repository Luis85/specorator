/**
 * T-CC-021 (RED) — `ChatComposer.vue` keyboard contract + send/stop (TEST-CC-009).
 *
 * SPEC-CC-021, EC-1/2/3/4. Enter sends (no shift, no IME, non-empty) and prevents
 * the newline; Shift+Enter / IME-Enter / empty do not submit; Esc while streaming
 * cancels; the control is send while idle (disabled when empty/streaming) and a
 * stop control while streaming. Queried by `data-testid` only (ADR-009).
 *
 * Traces: REQ-CC-007, 008, 009, 010.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChatComposer from '@/ui/chat/ChatComposer.vue';
import { i18n } from '@/ui/i18n';
import type { AttachedFileRef, AttachedImage, CapturedSelection } from '@/domain/chat/attachments';
import { ChatComposerPageObject } from './ChatComposer.po';

function mountComposer(props: { isStreaming?: boolean } = {}) {
	const wrapper = mount(ChatComposer, {
		props: { isStreaming: props.isStreaming ?? false },
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ChatComposerPageObject(wrapper) };
}

describe('ChatComposer (TEST-CC-009)', () => {
	it('renders the composer wrapper, textarea, and send control', () => {
		const { po } = mountComposer();
		expect(po.exists()).toBe(true);
		// `get` throws if absent, so a non-throwing access proves the elements render.
		expect(po.textarea.element.tagName).toBe('TEXTAREA');
		expect(po.send.element.tagName).toBe('BUTTON');
	});

	it('Enter (no shift, no IME, non-empty) emits submit and prevents the newline', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		const event = await po.pressEnter();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
		expect(event.defaultPrevented).toBe(true);
	});

	it('EC-1: empty/whitespace value does not submit on Enter', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('   ');
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('EC-3: Shift+Enter does not submit (allows the newline)', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		const event = await po.pressEnter({ shift: true });
		expect(wrapper.emitted('submit')).toBeUndefined();
		expect(event.defaultPrevented).toBe(false);
	});

	it('EC-2: Enter during IME composition does not submit', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		await po.pressEnter({ composing: true });
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('clears the textarea after a successful submit', async () => {
		const { po } = mountComposer();
		await po.setValue('Hello');
		await po.pressEnter();
		expect(po.value()).toBe('');
	});

	it('send is disabled when empty and enabled when non-empty (idle)', async () => {
		const { po } = mountComposer();
		expect(po.sendDisabled()).toBe(true);
		await po.setValue('Hello');
		expect(po.sendDisabled()).toBe(false);
	});

	it('clicking send emits submit with the value', async () => {
		const { wrapper, po } = mountComposer();
		await po.setValue('Hello');
		await po.clickSend();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
	});

	it('EC-4: while streaming the control is a stop button that emits cancel (not submit)', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: true });
		await po.setValue('Hello');
		expect(po.sendDisabled()).toBe(false); // the stop control is active while streaming
		await po.clickSend();
		expect(wrapper.emitted('cancel')).toHaveLength(1);
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('EC-4: Enter does not start a second turn while streaming', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: true });
		await po.setValue('Hello');
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toBeUndefined();
	});

	it('Esc while streaming emits cancel (REQ-CC-010)', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: true });
		await po.pressEsc();
		expect(wrapper.emitted('cancel')).toHaveLength(1);
	});

	it('Esc while idle does not emit cancel', async () => {
		const { wrapper, po } = mountComposer({ isStreaming: false });
		await po.pressEsc();
		expect(wrapper.emitted('cancel')).toBeUndefined();
	});
});

// ── P5 context-attachments extension (TEST-CA-004/006, SPEC-CA-022) ──────────────

const files: AttachedFileRef[] = [{ path: 'notes/a.md', displayName: 'a' }];
const images: AttachedImage[] = [
	{ path: 'img/x.png', mimeType: 'image/png', byteSize: 4, dataBase64: 'AAA' },
];
const selection: CapturedSelection = {
	kind: 'editor',
	notePath: 'notes/a.md',
	selectedText: 'hi',
	startLine: 1,
	lineCount: 1,
};

function mountWithContext(
	props: {
		attachedFiles?: readonly AttachedFileRef[];
		images?: readonly AttachedImage[];
		capturedSelection?: CapturedSelection | null;
		supportsBrowserSelection?: boolean;
	} = {},
) {
	const wrapper = mount(ChatComposer, {
		props: {
			isStreaming: false,
			attachedFiles: props.attachedFiles,
			images: props.images,
			capturedSelection: props.capturedSelection,
			supportsBrowserSelection: props.supportsBrowserSelection ?? false,
			resolveThumbSrc: (path: string) => `app://resource/${path}`,
		},
		global: { plugins: [i18n] },
	});
	return { wrapper, po: new ChatComposerPageObject(wrapper) };
}

describe('ChatComposer P5 context-bar slot (TEST-CA-004/006, SPEC-CA-022)', () => {
	it('G2: with no context the context bar is hidden (byte-identical to P4)', () => {
		const { po } = mountWithContext();
		expect(po.hasContextBar()).toBe(false);
		expect(po.textareaExists()).toBe(true);
	});

	it('renders FileChips when attachedFiles is non-empty', () => {
		const { po } = mountWithContext({ attachedFiles: files });
		expect(po.hasContextBar()).toBe(true);
		expect(po.hasFileChips()).toBe(true);
	});

	it('renders ImageContextBar when images is non-empty', () => {
		const { po } = mountWithContext({ images });
		expect(po.hasContextBar()).toBe(true);
		expect(po.hasImageContextBar()).toBe(true);
	});

	it('renders SelectionIndicator when a selection is captured', () => {
		const { po } = mountWithContext({ capturedSelection: selection });
		expect(po.hasContextBar()).toBe(true);
		expect(po.hasSelectionIndicator()).toBe(true);
	});

	it('re-emits the file remove to the parent (REQ-CA-003)', async () => {
		const { wrapper, po } = mountWithContext({ attachedFiles: files });
		await po.clickFirstFileRemove();
		expect(wrapper.emitted('removeFile')).toEqual([['notes/a.md']]);
	});

	it('re-emits the file open to the parent (REQ-CA-005)', async () => {
		const { wrapper, po } = mountWithContext({ attachedFiles: files });
		await po.clickFirstFileLink();
		expect(wrapper.emitted('openFile')).toEqual([['notes/a.md']]);
	});

	it('re-emits the image remove + preview to the parent (REQ-CA-008/009)', async () => {
		const { wrapper, po } = mountWithContext({ images });
		await po.clickFirstImagePreview();
		expect(wrapper.emitted('previewImage')).toEqual([[images[0]]]);
		await po.clickFirstImageRemove();
		expect(wrapper.emitted('removeImage')).toEqual([['img/x.png']]);
	});

	it('re-emits the selection clear to the parent (REQ-CA-015)', async () => {
		const { wrapper, po } = mountWithContext({ capturedSelection: selection });
		await po.clickSelectionClear();
		expect(wrapper.emitted('clearSelection')).toHaveLength(1);
	});

	it('the P1 send path is unchanged with context present (still emits submit on Enter)', async () => {
		const { wrapper, po } = mountWithContext({ attachedFiles: files });
		await po.setValue('Hello');
		await po.pressEnter();
		expect(wrapper.emitted('submit')).toEqual([['Hello']]);
	});
});

// ── FIX-2.3 (was R-CA-002): drop / paste files into the composer ─────────────────
// SPEC-CA-022, REQ-CA-007/012. The composer accepts files dropped onto or pasted
// into it and emits `attachFiles` with the File[] for the parent to gate (image →
// 8 MiB/MIME gate, non-image → file chip). Claudian ground-truth:
// `ImageContext.setupDragAndDrop` / `setupPasteHandler`.

function imageFile(name: string): File {
	return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
}

describe('ChatComposer drop/paste (FIX-2.3, SPEC-CA-022)', () => {
	it('REQ-CA-007: dropping a file emits attachFiles with the dropped File[]', async () => {
		const { wrapper, po } = mountComposer();
		const file = imageFile('diagram.png');
		await po.dropFiles([file]);
		const emitted = wrapper.emitted('attachFiles');
		expect(emitted).toBeDefined();
		expect((emitted?.[0]?.[0] as File[])[0].name).toBe('diagram.png');
	});

	it('REQ-CA-007: pasting an image emits attachFiles with the pasted File[] (prevents default)', async () => {
		const { wrapper, po } = mountComposer();
		const file = imageFile('clip.png');
		const event = await po.pasteFiles([file]);
		const emitted = wrapper.emitted('attachFiles');
		expect(emitted).toBeDefined();
		expect((emitted?.[0]?.[0] as File[])[0].name).toBe('clip.png');
		expect(event.defaultPrevented).toBe(true);
	});

	it('a paste with NO files (plain text) does not emit attachFiles or prevent default', async () => {
		const { wrapper, po } = mountComposer();
		const event = await po.pasteText('just words');
		expect(wrapper.emitted('attachFiles')).toBeUndefined();
		expect(event.defaultPrevented).toBe(false);
	});
});

// ── FIX-2.2 (was R-CA-002): the paperclip attach button ──────────────────────────
// SPEC-CA-022, REQ-CA-001/007. An explicit attach control on the composer toolbar
// emits `attach` so the parent opens the vault file/image picker via the seam.

describe('ChatComposer attach button (FIX-2.2, SPEC-CA-022)', () => {
	it('REQ-CA-001/007: the composer renders a labelled attach control', () => {
		const { po } = mountComposer();
		expect(po.hasAttach()).toBe(true);
		expect(po.attachLabel().length).toBeGreaterThan(0);
	});

	it('REQ-CA-001/007: clicking the attach control emits attach', async () => {
		const { wrapper, po } = mountComposer();
		await po.clickAttach();
		expect(wrapper.emitted('attach')).toHaveLength(1);
	});
});
