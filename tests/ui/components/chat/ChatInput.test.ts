/**
 * T-CCS-022 — Tests: ChatInput — v-model, disabled state, send via Ctrl+Enter, button states.
 * Satisfies REQ-CCS-013, REQ-CCS-014, REQ-CCS-015, NFR-CCS-009, SPEC-CCS-001 §7.5.
 *
 * Mention-picker tests (PR-ASV-4 / D-ASV-3) live in the
 * `describe('mention picker', ...)` block at the bottom.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import ChatInput from '@/ui/components/chat/ChatInput.vue';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import { VAULT_PORT } from '@/infrastructure/bridge/ports';
import { MENTION_DEBOUNCE_MS } from '@/ui/composables/useMentionPicker';
import { ChatInputPO } from './ChatInput.po';

function mountChatInput(
	props: { modelValue: string; disabled: boolean; loading: boolean },
	files: Record<string, string> = {},
) {
	const bridge = new MockBridge(files);
	const wrapper = mount(ChatInput, {
		props,
		global: {
			provide: {
				[VAULT_PORT as symbol]: bridge,
			},
		},
	});
	return new ChatInputPO(wrapper);
}

describe('ChatInput', () => {
	it('renders data-testid="chat-input-textarea"', () => {
		const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
		expect(po.hasTextarea()).toBe(true);
	});

	it('renders data-testid="chat-send-button"', () => {
		const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
		expect(po.hasSendButton()).toBe(true);
	});

	describe('v-model binding', () => {
		it('modelValue prop sets textarea value', () => {
			const po = mountChatInput({ modelValue: 'Hello', disabled: false, loading: false });
			expect(po.textareaValue()).toBe('Hello');
		});

		it('typing in textarea emits update:modelValue', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeInTextarea('new text');
			const emitted = po.emitted('update:modelValue') as string[][];
			expect(emitted).toBeTruthy();
			expect(emitted[emitted.length - 1][0]).toBe('new text');
		});
	});

	describe('keyboard send', () => {
		it('REQ-CCS-013: Ctrl+Enter emits send when not disabled and not loading', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false });
			await po.triggerSendKey(true);
			expect(po.emitted('send')).toBeTruthy();
		});

		it('Cmd+Enter emits send when not disabled and not loading', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false });
			await po.triggerSendKey(false);
			expect(po.emitted('send')).toBeTruthy();
		});

		it('Enter alone does not emit send', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false });
			await po.triggerEnterOnly();
			expect(po.emitted('send')).toBeFalsy();
		});

		it('Ctrl+Enter does not emit send when disabled=true', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: true, loading: false });
			await po.triggerSendKey(true);
			expect(po.emitted('send')).toBeFalsy();
		});

		it('Ctrl+Enter does not emit send when loading=true', async () => {
			const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: true });
			await po.triggerSendKey(true);
			expect(po.emitted('send')).toBeFalsy();
		});

		it('Ctrl+Enter does not emit send while an IME is composing', async () => {
			const po = mountChatInput({ modelValue: 'こんにち', disabled: false, loading: false });
			const ta = po.textarea;
			await ta.trigger('keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
			expect(po.emitted('send')).toBeFalsy();
		});

		it('Ctrl+Enter does not emit send when legacy keyCode === 229 fires', async () => {
			const po = mountChatInput({ modelValue: '中文', disabled: false, loading: false });
			const ta = po.textarea;
			await ta.trigger('keydown', { key: 'Enter', ctrlKey: true, keyCode: 229 });
			expect(po.emitted('send')).toBeFalsy();
		});
	});

	describe('disabled state', () => {
		it('REQ-CCS-014: when disabled=true, textarea has readonly attribute', () => {
			const po = mountChatInput({ modelValue: '', disabled: true, loading: false });
			expect(po.isTextareaReadonly()).toBe(true);
		});

		it('when disabled=true, send button has native disabled attribute', () => {
			const po = mountChatInput({ modelValue: '', disabled: true, loading: false });
			expect(po.isSendButtonDisabled()).toBe(true);
		});

		it('when disabled=false, textarea is not readonly', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			expect(po.isTextareaReadonly()).toBe(false);
		});
	});

	describe('button label', () => {
		it('when loading=false, button shows "Ask" label', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			expect(po.sendButtonText()).toContain('Ask');
		});

		it('when loading=true, button shows "Asking…" label', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: true });
			expect(po.sendButtonText()).toContain('Asking');
		});
	});

	/**
	 * PR-ASV-4 / D-ASV-3 — `@`-file mention picker integration tests.
	 *
	 * Cover the end-to-end keystroke flow: type `@req`, see a
	 * `requirements.md` candidate, press Enter, expect the inline text
	 * replacement AND the `add-context-file` event emitted (which
	 * `ChatSidebar.handleAddContextFile` then routes to
	 * `chatStore.addContextFile`).
	 */
	describe('mention picker', () => {
		const FILES = {
			'specs/foo/idea.md': '',
			'specs/foo/requirements.md': '',
			'specs/bar/requirements.md': '',
		}

		beforeEach(() => {
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it('opens the mention dropdown when the user types `@`', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@')
			expect(po.mentionDropdownExists()).toBe(false)
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			expect(po.mentionDropdownExists()).toBe(true)
		})

		it('typing `@req` surfaces a requirements.md candidate', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@req')
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			expect(po.mentionDropdownExists()).toBe(true)
			const text = po.wrapper.find('[data-testid="mention-option-0"]').text()
			expect(text).toContain('requirements.md')
		})

		it('Enter commits the selection: replaces `@req` and emits `add-context-file`', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@req')
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			await po.pressKey('Enter')

			const updates = po.emitted('update:modelValue') as string[][]
			const lastValue = updates[updates.length - 1][0]
			expect(lastValue).toBe('@requirements.md ')

			const added = po.emitted('add-context-file') as Array<[{ path: string; name: string }]>
			expect(added).toBeTruthy()
			expect(added[0][0]).toEqual({
				path: 'specs/bar/requirements.md',
				name: 'requirements.md',
				kind: 'file',
			})
		})

		it('Escape closes the dropdown without committing', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@req')
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			await po.pressKey('Escape')
			expect(po.mentionDropdownExists()).toBe(false)
			expect(po.emitted('add-context-file')).toBeFalsy()
		})

		it('ArrowDown moves selection and Enter commits the new highlight', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@req')
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			await po.pressKey('ArrowDown')
			await po.pressKey('Enter')

			const added = po.emitted('add-context-file') as Array<[{ path: string; name: string }]>
			expect(added).toBeTruthy()
			expect(added[0][0].path).toBe('specs/foo/requirements.md')
		})

		it('Ctrl+Enter still emits `send` instead of committing the mention', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@req')
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			await po.pressKey('Enter', { ctrl: true })

			expect(po.emitted('send')).toBeTruthy()
			expect(po.emitted('add-context-file')).toBeFalsy()
		})

		/**
		 * PR-ASV-4-folders — selecting a folder commits as `@<name>/`
		 * (trailing slash, no trailing space — user keeps typing to narrow)
		 * and must NOT emit `add-context-file`. Folders aren't context
		 * chips; only files are.
		 */
		it('selecting a folder rewrites to `@<name>/` and skips add-context-file', async () => {
			const po = mountChatInput(
				{ modelValue: '', disabled: false, loading: false },
				FILES,
			)
			await po.typeAndMoveCaretToEnd('@spec')
			await vi.advanceTimersByTimeAsync(MENTION_DEBOUNCE_MS + 1)
			await flushPromises()
			expect(po.mentionDropdownExists()).toBe(true)
			// The first row is the `specs` folder (prefix-matches `spec`;
			// files don't prefix-match the basename here).
			const firstLabel = po.wrapper.find('[data-testid="mention-option-0"]').text()
			expect(firstLabel).toContain('specs/')
			await po.pressKey('Enter')

			const updates = po.emitted('update:modelValue') as string[][]
			const lastValue = updates[updates.length - 1][0]
			expect(lastValue).toBe('@specs/')
			expect(po.emitted('add-context-file')).toBeFalsy()
		})
	})

	describe('slash-command palette (PR-ASV-3)', () => {
		it('does not render the dropdown before any `/` is typed', () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			expect(po.hasDropdown()).toBe(false);
		});

		it('opens the dropdown when `/` is typed at position 0', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeAndMoveCaret('/');
			expect(po.hasDropdown()).toBe(true);
		});

		it('opens the dropdown when `/` follows whitespace', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeAndMoveCaret('hello /');
			expect(po.hasDropdown()).toBe(true);
		});

		it('does NOT open when `/` follows a non-whitespace character', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeAndMoveCaret('path/to/file');
			expect(po.hasDropdown()).toBe(false);
		});

		it('filters items as the user types the query', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeAndMoveCaret('/cle');
			expect(po.dropdownItem('clear').exists()).toBe(true);
			expect(po.dropdownItem('help').exists()).toBe(false);
			expect(po.dropdownItem('new').exists()).toBe(false);
		});

		it('shows the empty placeholder when no commands match', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeAndMoveCaret('/xyzzy');
			expect(po.hasDropdown()).toBe(true);
			expect(po.dropdownEmpty.exists()).toBe(true);
		});

		it('closes when a whitespace is typed after the trigger', async () => {
			const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
			await po.typeAndMoveCaret('/cle');
			expect(po.hasDropdown()).toBe(true);
			await po.typeAndMoveCaret('/cle ');
			expect(po.hasDropdown()).toBe(false);
		});

		describe('keyboard navigation', () => {
			it('ArrowDown moves the highlight forward', async () => {
				const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
				await po.typeAndMoveCaret('/');
				// First item is highlighted by default
				expect(po.dropdownItem('clear').attributes('aria-selected')).toBe('true');
				await po.pressKey('ArrowDown');
				expect(po.dropdownItem('clear').attributes('aria-selected')).toBe('false');
				expect(po.dropdownItem('new').attributes('aria-selected')).toBe('true');
			});

			it('ArrowUp from index 0 wraps to the last entry', async () => {
				const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
				await po.typeAndMoveCaret('/');
				const items = po.dropdownItems();
				expect(items.length).toBeGreaterThan(0);
				await po.pressKey('ArrowUp');
				// Last item should now be aria-selected
				expect(items[items.length - 1].attributes('aria-selected')).toBe('true');
			});

			it('Escape closes the palette', async () => {
				const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
				await po.typeAndMoveCaret('/');
				expect(po.hasDropdown()).toBe(true);
				await po.pressKey('Escape');
				expect(po.hasDropdown()).toBe(false);
			});
		});

		describe('selection emits', () => {
			it('Enter on a highlighted entry emits select-command and does NOT emit send', async () => {
				const po = mountChatInput({ modelValue: '/', disabled: false, loading: false });
				await po.typeAndMoveCaret('/');
				await po.pressKey('Enter', { ctrl: true });
				expect(po.emitted('send')).toBeFalsy();
				const emitted = po.emitted('select-command') as Array<[{ name: string }]> | undefined;
				expect(emitted).toBeTruthy();
				expect(emitted?.[0][0].name).toBe('clear');
			});

			it('Tab selects the highlighted entry', async () => {
				const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
				await po.typeAndMoveCaret('/');
				await po.pressKey('Tab');
				const emitted = po.emitted('select-command') as Array<[{ name: string }]> | undefined;
				expect(emitted).toBeTruthy();
				expect(emitted?.[0][0].name).toBe('clear');
			});

			it('clicking an item emits select-command for that command', async () => {
				const po = mountChatInput({ modelValue: '', disabled: false, loading: false });
				await po.typeAndMoveCaret('/');
				await po.dropdownItem('new').trigger('mousedown');
				const emitted = po.emitted('select-command') as Array<[{ name: string }]> | undefined;
				expect(emitted).toBeTruthy();
				expect(emitted?.[0][0].name).toBe('new');
			});

			it('Ctrl+Enter still fires send when the palette is closed', async () => {
				const po = mountChatInput({ modelValue: 'hello', disabled: false, loading: false });
				await po.pressKey('Enter', { ctrl: true });
				expect(po.emitted('send')).toBeTruthy();
			});
		});

		describe('vault-loaded commands (PR-ASV-3 follow-up)', () => {
			async function mountWithVault(initialFiles: Record<string, string>) {
				const ports = fakeModulePorts();
				for (const [path, content] of Object.entries(initialFiles)) {
					await ports.vault.writeFile(path, content);
				}
				const wrapper = mount(ChatInput, {
					props: { modelValue: '', disabled: false, loading: false },
					global: {
						provide: {
							[VAULT_PORT as symbol]: ports.vault,
							[LOGGER_PORT as symbol]: ports.logger,
						},
					},
				});
				return { wrapper, po: new ChatInputPO(wrapper) };
			}

			it('emits select-command carrying the vault body and does NOT auto-send', async () => {
				const { wrapper, po } = await mountWithVault({
					'.claude/commands/draft.md':
						'---\ndescription: Draft a note.\n---\n\nDraft body to insert.',
				});
				await po.typeAndMoveCaret('/draft');
				// Wait for the async vault load triggered by `open()`.
				await flushPromises();
				await nextTick();
				expect(po.dropdownItem('draft').exists()).toBe(true);
				await po.dropdownItem('draft').trigger('mousedown');
				expect(po.emitted('send')).toBeFalsy();
				const emitted = po.emitted('select-command') as Array<[SlashCommand]> | undefined;
				expect(emitted).toBeTruthy();
				const cmd = emitted?.[0][0];
				expect(cmd?.name).toBe('draft');
				expect(cmd?.kind).toBe('vault-command');
				expect(cmd?.action).toBe('vault-prompt');
				expect(cmd?.body).toContain('Draft body to insert');
				// Sanity-check: silence unused wrapper lint.
				expect(wrapper.exists()).toBe(true);
			});
		});
	});
});
