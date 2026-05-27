/**
 * T-AY-014 (RED -> green) — additivity invariant: no swept surface's default
 * render or locale output regresses from the `next` baseline (TEST-AY-014).
 * SPEC-AY-010, REQ-AY-014, NFR-AY-004, EC-AY-010 — the cardinal P12
 * counter-metric.
 *
 * Three legs:
 *  - Locale byte-identity: `git diff next -- src/ui/i18n/locales` is empty (en/de
 *    + all ten locales unchanged, NFR-AY-004/008).
 *  - Source allow-list: the entire `src/` diff vs `next` touches ONLY the P12
 *    allow-list (the new CSS layer, the two CSS-import entry edits, and the new
 *    `.sr-only` notice live region). No swept component template under
 *    `src/ui/chat/**` / `src/ui/agent/**` / `src/plugin/modals/**` changed — the
 *    P0-P11 default render is byte-identical at the source.
 *  - Default-render structural check: representative swept components render their
 *    existing visible structure; the added a11y attributes (`aria-*`) + the
 *    `.sr-only` clip do not alter the visible default render.
 *
 * Traces: TEST-AY-014, SPEC-AY-010, REQ-AY-014, NFR-AY-004, EC-AY-010.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import TabBar from '@/ui/chat/TabBar.vue';
import FileChips from '@/ui/chat/FileChips.vue';
import ImageThumb from '@/ui/chat/ImageThumb.vue';
import ChatComposer from '@/ui/chat/ChatComposer.vue';
import { useTabsStore } from '@/ui/stores/tabsStore';
import type { ChatTurnRunner } from '@/ui/stores/chatStore';
import { i18n } from '@/ui/i18n';
import { ok } from '@/domain/shared/Result';
import { MockChatRuntime } from '@/infrastructure/mock/MockChatRuntime';
import { MockHistoryStore } from '@/infrastructure/mock/MockHistoryStore';
import type { AttachedFileRef, AttachedImage } from '@/domain/chat/attachments';

const REPO_ROOT = resolve(__dirname, '../../..');

/** Run a git command at the repo root and return trimmed stdout. */
function git(args: string[]): string {
	return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

/** The exact P12 allow-list of `src/` files (additive layer + entry edits + host). */
const ALLOWED = new Set([
	'src/plugin/main.ts',
	'src/ui/main.ts',
	'src/ui/styles/accessibility.css',
	'src/ui/components/NoticeLiveRegion.vue',
]);

function bindStore(maxTabs = 3) {
	const store = useTabsStore();
	store.bindTabDeps({
		createRuntime: () => new MockChatRuntime([]),
		createRunner: (): ChatTurnRunner => ({
			run: vi.fn().mockResolvedValue(ok(undefined)),
			cancel: vi.fn(),
		}),
		notifyStartFailure: () => undefined,
		notifyInfo: () => undefined,
		history: new MockHistoryStore(),
		generateTitle: () => Promise.resolve(ok('title')),
		getMaxTabs: () => maxTabs,
	});
	return store;
}

const file: AttachedFileRef = { path: 'notes/a.md', displayName: 'a' };
const image: AttachedImage = {
	path: 'img/a.png',
	mimeType: 'image/png',
	byteSize: 4,
	dataBase64: 'AAAA',
};

describe('additivity invariant (TEST-AY-014)', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('the locale output is byte-identical to the next baseline (NFR-AY-004/008)', () => {
		const diff = git(['diff', '--name-only', 'next', '--', 'src/ui/i18n/locales']);
		expect(diff, `locale files changed vs next:\n${diff}`).toBe('');
	});

	it('manifest.json is byte-identical to the next baseline (NFR-AY-008)', () => {
		const diff = git(['diff', '--name-only', 'next', '--', 'manifest.json']);
		expect(diff, 'manifest.json changed vs next').toBe('');
	});

	it('the src/ diff vs next touches only the P12 additive allow-list (no swept surface)', () => {
		const out = git(['diff', '--name-only', 'next', '--', 'src']);
		const changed = out.length === 0 ? [] : out.split('\n').map((p) => p.replace(/\\/g, '/'));
		const offenders = changed.filter((p) => !ALLOWED.has(p));
		expect(offenders, `unexpected swept-surface changes vs next: ${JSON.stringify(offenders)}`).toEqual(
			[],
		);
	});

	it('TabBar default render keeps its visible badge structure (no a11y artifact)', () => {
		bindStore();
		const store = useTabsStore();
		store.openTab();
		const wrapper = mount(TabBar, { global: { plugins: [i18n] } });
		// The visible non-colour numeric cue is intact (1-based numbers as text).
		const numbers = wrapper.findAll('[data-testid="tab-number"]').map((n) => n.text().trim());
		expect(numbers.length).toBeGreaterThan(0);
		expect(numbers.every((n) => /^\d+$/.test(n))).toBe(true);
	});

	it('FileChips + ImageThumb default render keep their visible labels (no a11y artifact)', () => {
		const chips = mount(FileChips, { props: { files: [file] }, global: { plugins: [i18n] } });
		expect(chips.get('[data-testid="file-chip-link"]').text()).toContain('a');
		const thumb = mount(ImageThumb, {
			props: { image, resolveThumbSrc: () => 'blob:x' },
			global: { plugins: [i18n] },
		});
		expect(thumb.find('[data-testid="image-thumb-img"]').exists()).toBe(true);
	});

	it('ChatComposer default render shows the textarea + send (P1 byte-identical seam)', () => {
		const wrapper = mount(ChatComposer, {
			props: { isStreaming: false },
			global: { plugins: [i18n] },
		});
		expect(wrapper.find('[data-testid="composer-textarea"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="composer-send"]').exists()).toBe(true);
	});
});
