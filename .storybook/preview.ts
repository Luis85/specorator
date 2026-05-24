import type { Preview } from '@storybook/vue3-vite';
import { setup } from '@storybook/vue3-vite';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { i18n, setLocale } from '../src/ui/i18n';
import {
	LOGGER_PORT,
	NOTIFICATION_PORT,
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
} from '../src/infrastructure/bridge/ports';
import { MockBridge } from '../src/infrastructure/mock/MockBridge';
import './obsidian-theme.css';

const storyRouter = createRouter({
	history: createMemoryHistory(),
	routes: [
		{ path: '/', name: 'home', component: { template: '<div />' } },
		{ path: '/features', name: 'features', component: { template: '<div />' } },
		{ path: '/settings', name: 'settings', component: { template: '<div />' } },
		{ path: '/file/:filePath(.*)', name: 'file', component: { template: '<div />' } },
	],
});

const storyBridge = new MockBridge();

setup((app) => {
	app.use(createPinia());
	app.use(i18n);
	app.use(storyRouter);
	app.provide(SETTINGS_PORT, storyBridge);
	app.provide(VAULT_PORT, storyBridge);
	app.provide(WORKSPACE_PORT, storyBridge);
	app.provide(NOTIFICATION_PORT, storyBridge);
	app.provide(LOGGER_PORT, storyBridge);
});

const preview: Preview = {
	globalTypes: {
		theme: {
			description: 'Obsidian theme',
			defaultValue: 'dark',
			toolbar: {
				title: 'Theme',
				icon: 'paintbrush',
				items: [
					{ value: 'light', title: 'Light', right: '☀️' },
					{ value: 'dark', title: 'Dark', right: '🌙' },
				],
				dynamicTitle: true,
			},
		},
	},
	decorators: [
		(story, ctx) => {
			const theme = (ctx.globals as { theme?: 'light' | 'dark' }).theme ?? 'dark';
			document.body.classList.remove('theme-light', 'theme-dark');
			document.body.classList.add(`theme-${theme}`);
			setLocale('en');
			return story();
		},
	],
	parameters: {
		backgrounds: { disable: true },
		a11y: { test: 'todo' },
	},
};

export default preview;
