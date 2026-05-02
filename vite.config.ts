import { builtinModules } from 'module';
import { resolve } from 'path';
import { defineConfig, type Plugin as VitePlugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { parse } from 'postcss';
import type { AtRule, Rule } from 'postcss';

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

function scopeSelector(selector: string): string {
	const trimmedSelector = selector.trim();

	if (trimmedSelector.startsWith('.specorator-root')) {
		return trimmedSelector;
	}

	return `.specorator-root :where(${trimmedSelector})`;
}

function parentAtRule(rule: Rule): AtRule | undefined {
	return rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : undefined;
}

function scopeBuiltCss(): VitePlugin {
	return {
		name: 'specorator-scope-css',
		enforce: 'post',
		generateBundle(_, bundle) {
			for (const asset of Object.values(bundle)) {
				if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) {
					continue;
				}

				const root = parse(String(asset.source));

				root.walkRules((rule) => {
					const atRule = parentAtRule(rule);

					if (atRule?.name.endsWith('keyframes')) {
						return;
					}

					rule.selectors = rule.selectors.map(scopeSelector);
				});

				asset.source = root.toString();
			}
		},
	};
}

export default defineConfig(({ mode }) => {
	const alias = { '@': resolve(__dirname, 'src') };

	if (mode === 'plugin') {
		return {
			plugins: [vue(), scopeBuiltCss()],
			resolve: { alias },
			build: {
				lib: {
					entry: resolve(__dirname, 'src/plugin/main.ts'),
					formats: ['cjs'],
					fileName: () => 'main.js',
				},
				rollupOptions: {
					external: ALL_EXTERNALS,
					output: {
						exports: 'default',
						// Obsidian convention: CSS file must be named styles.css
						assetFileNames: (info) =>
							info.names?.some((n) => n.endsWith('.css')) ? 'styles.css' : '[name][extname]',
					},
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
		plugins: [vue(), scopeBuiltCss()],
		resolve: { alias },
		build: {
			outDir: 'dist-standalone',
			base: process.env.VITE_BASE_URL ?? '/',
		},
		base: process.env.VITE_BASE_URL ?? '/',
	};
});
