import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { createPinia, setActivePinia } from 'pinia';
import ThreadHistoryMenu from '@/ui/components/agent/ThreadHistoryMenu.vue';
import { useChatThreadsStore } from '@/ui/stores/chatThreadsStore';

/**
 * Storybook coverage for `<ThreadHistoryMenu>` (WS-AUX-9, T-AUX-335).
 *
 * Three stories: empty list, populated (3 rows), and a scrolling variant
 * (12 rows) so we can verify the max-block-size scroll affordance under the
 * 50vh cap.
 */
const meta: Meta<typeof ThreadHistoryMenu> = {
	title: 'Agent/ThreadHistoryMenu',
	component: ThreadHistoryMenu,
	render: (args) => ({
		components: { ThreadHistoryMenu },
		setup() {
			return { args };
		},
		template: `
			<div class="specorator-root" style="position: relative; padding: 16px; height: 480px; background: var(--sp-bg-primary);">
				<ThreadHistoryMenu v-bind="args" />
			</div>
		`,
	}),
};
export default meta;
type Story = StoryObj<typeof ThreadHistoryMenu>;

function seed(count: number): void {
	setActivePinia(createPinia());
	const store = useChatThreadsStore();
	for (let i = 0; i < count; i += 1) {
		const id = `story-${i}`;
		store.createThread({
			feature: null,
			transport: { provider: 'claude', mode: 'api' },
			logPath: `chats/${id}.md`,
			threadId: id,
			now: new Date(Date.now() - i * 60_000).toISOString(),
		});
		store.renameThread(id, `Thread ${i + 1} — sample conversation`);
	}
}

export const Empty: Story = {
	args: { open: true },
	decorators: [
		(story) => {
			setActivePinia(createPinia());
			return story();
		},
	],
};

export const WithThreads: Story = {
	args: { open: true },
	decorators: [
		(story) => {
			seed(3);
			return story();
		},
	],
};

export const Scrolling: Story = {
	args: { open: true },
	decorators: [
		(story) => {
			seed(12);
			return story();
		},
	],
};
