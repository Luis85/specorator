import { copyFileSync, existsSync } from 'fs';
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

/**
 * Rolldown's CJS output mangles `import.meta.url` to `{}.url` (undefined),
 * crashing dependencies that call `createRequire(import.meta.url)` at module
 * top-level — `@anthropic-ai/claude-agent-sdk` does this in its bundled
 * `sdk.mjs`. A global `import.meta.url` substitution would also rewrite
 * `fileURLToPath(import.meta.url)` and other module-relative-path call sites,
 * silently changing their semantics (Codex P1 on PR #367). Narrow the rewrite
 * to the single broken pattern: `createRequire(import.meta.url)` becomes
 * `createRequire(require("url").pathToFileURL(process.execPath).href)`, which
 * `createRequire` accepts. Other `import.meta.url` references continue to flow
 * through Rolldown unchanged.
 *
 * Matches both `createRequire(import.meta.url)` (un-minified) and
 * `IDENT(import.meta.url)` where `IDENT` is the minified alias of an
 * `import { createRequire as IDENT } from 'node:module'|'module'` binding —
 * which is what the published SDK ships.
 */
function patchCreateRequireImportMetaUrl(): VitePlugin {
	const REPLACEMENT = 'require("url").pathToFileURL(process.execPath).href';
	return {
		name: 'specorator-patch-create-require-import-meta-url',
		enforce: 'pre',
		transform(code, id) {
			if (!/[\\/]node_modules[\\/]@anthropic-ai[\\/]claude-agent-sdk[\\/]/.test(id)) {
				return null;
			}
			const aliases = new Set<string>(['createRequire']);
			const importRe = /import\s*\{([^}]*)\}\s*from\s*['"](?:node:)?module['"]/g;
			for (const match of code.matchAll(importRe)) {
				for (const spec of match[1].split(',')) {
					const aliasMatch = /createRequire\s+as\s+([A-Za-z_$][\w$]*)/.exec(spec);
					if (aliasMatch !== null) aliases.add(aliasMatch[1]);
				}
			}
			const aliasPattern = [...aliases].map((a) => a.replace(/[$]/g, '\\$&')).join('|');
			// `\b` doesn't match between non-word characters; the SDK ships
			// `$S(import.meta.url)` and Rolldown can emit `=$S(…)`, so use an
			// explicit lookbehind that excludes identifier-continuation chars.
			const callRe = new RegExp(
				`(?<![A-Za-z0-9_$])(${aliasPattern})\\(\\s*import\\.meta\\.url\\s*\\)`,
				'g',
			);
			const out = code.replace(callRe, (_full, fn: string) => `${fn}(${REPLACEMENT})`);
			return out === code ? null : { code: out, map: null };
		},
	};
}

function copyPluginArtifacts(): VitePlugin {
	return {
		name: 'specorator-copy-plugin-artifacts',
		closeBundle() {
			copyFileSync(resolve(__dirname, 'dist-plugin/main.js'), resolve(__dirname, 'main.js'));
			copyFileSync(resolve(__dirname, 'dist-plugin/styles.css'), resolve(__dirname, 'styles.css'));
			// Sourcemap is emitted as a separate file (sourcemap: true). Copy it next to
			// main.js so local DevTools can resolve it. The released asset bundle in
			// release.yml deliberately omits main.js.map.
			const mapSrc = resolve(__dirname, 'dist-plugin/main.js.map');
			if (existsSync(mapSrc)) {
				copyFileSync(mapSrc, resolve(__dirname, 'main.js.map'));
			}
		},
	};
}

function scopeSelector(selector: string): string {
	const trimmedSelector = selector.trim();

	if (trimmedSelector.startsWith('.specorator-root')) {
		return trimmedSelector;
	}

	return `.specorator-root :where(${trimmedSelector})`;
}

function parentAtRule(rule: Rule): AtRule | undefined {
	return rule.parent?.type === 'atrule' ? rule.parent : undefined;
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

					if (atRule?.name.endsWith('keyframes') === true) {
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
			plugins: [patchCreateRequireImportMetaUrl(), vue(), scopeBuiltCss(), copyPluginArtifacts()],
			resolve: { alias },
			define: {
				'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
			},
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
							info.names.some((n) => n.endsWith('.css')) ? 'styles.css' : '[name][extname]',
					},
				},
				outDir: 'dist-plugin',
				emptyOutDir: false,
				sourcemap: true,
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
