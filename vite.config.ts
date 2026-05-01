import { builtinModules } from 'module';
import { defineConfig } from 'vite';

// Modules provided by the Obsidian desktop environment that must not be bundled
const obsidianExternals = [
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

export default defineConfig({
	build: {
		lib: {
			entry: 'src/main.ts',
			formats: ['cjs'],
			fileName: () => 'main.js',
		},
		rollupOptions: {
			external: [...obsidianExternals, ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
			output: {
				exports: 'default',
			},
		},
		outDir: '.',
		emptyOutDir: false,
		sourcemap: 'inline',
		minify: false,
	},
});
