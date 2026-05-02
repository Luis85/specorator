import { builtinModules } from 'module';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const OBSIDIAN_EXTERNALS = [
	'obsidian',
	'electron',
	'@codemirror/autocomplete',
	'@codemirror/collab',
	'@codemirror/commands',
	'@codemirror/language',
	'@codemirror/lint',
	'@codemirror/search',
	'@codemirror/state',
	'@codemirror/view',
	'@lezer/common',
	'@lezer/highlight',
	'@lezer/lr',
];

const ALL_EXTERNALS = [
	...OBSIDIAN_EXTERNALS,
	...builtinModules,
	...builtinModules.map((m) => `node:${m}`),
];

export default defineConfig(({ mode }) => {
	const alias = { '@': resolve(__dirname, 'src') };

	if (mode === 'plugin') {
		return {
			plugins: [vue()],
			resolve: { alias },
			build: {
				lib: {
					entry: resolve(__dirname, 'src/plugin/main.ts'),
					formats: ['cjs'],
					fileName: () => 'main.js',
				},
				rollupOptions: {
					external: ALL_EXTERNALS,
					output: { exports: 'default' },
				},
				outDir: '.',
				emptyOutDir: false,
				sourcemap: 'inline',
				minify: false,
			},
		};
	}

	// Standalone dev / browser build
	return {
		plugins: [vue()],
		resolve: { alias },
		build: {
			outDir: 'dist-standalone',
			base: process.env.VITE_BASE_URL ?? '/',
		},
		base: process.env.VITE_BASE_URL ?? '/',
	};
});
