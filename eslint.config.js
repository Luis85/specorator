import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));

export default tseslint.config(
	// Base JS recommended rules
	js.configs.recommended,

	// TypeScript rules
	...tseslint.configs.recommended,

	// Vue 3 rules (sets vue-eslint-parser as the parser for .vue files)
	...pluginVue.configs['flat/recommended'],

	// Wire @typescript-eslint/parser into vue-eslint-parser for <script lang="ts">
	// and provide browser + node globals so DOM types are recognised
	{
		files: ['**/*.vue', '**/*.ts', '**/*.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				parser: tseslint.parser,
				tsconfigRootDir,
			},
		},
	},

	// Disable ESLint formatting rules that conflict with Prettier
	prettier,

	// Global ignores
	{
		ignores: ['node_modules/', 'main.js', 'dist-standalone/', '.worktrees/', 'docs/api/'],
	},

	// Project-wide rules
	{
		files: ['**/*.ts', '**/*.js', '**/*.vue'],
		rules: {
			// Adapter boundary: obsidian must only be imported in the plugin adapter layer
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'obsidian',
							message:
								'Import from obsidian only in the plugin adapter layer (src/plugin/**).',
						},
					],
				},
			],
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'error',
			'vue/multi-word-component-names': 'off',
			'vue/component-api-style': ['error', ['script-setup']],
			// Result discipline (ADR-004): raw try/catch is reserved for the
			// infrastructure layer and the tryAsync/trySync helper itself.
			// Domain, application, and UI code must use those helpers to
			// convert thrown values into Result<T, E>.
			'no-restricted-syntax': [
				'error',
				{
					selector: 'TryStatement',
					message:
						'Use tryAsync/trySync from @/domain/shared/tryAsync instead of try/catch. Raw try/catch is allowed only in src/infrastructure/** and the helper itself.',
				},
			],
		},
	},

	// Adapter layer — obsidian imports permitted here
	{
		files: ['src/plugin/**/*.ts', 'src/infrastructure/obsidian/**/*.ts'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},

	// Result-discipline allowlist: the helper itself, the infrastructure
	// adapter layer, and Node-side scripts are the only places where raw
	// try/catch is sanctioned.
	{
		files: [
			'src/infrastructure/**/*.ts',
			'src/domain/shared/tryAsync.ts',
			'scripts/**/*.js',
		],
		rules: {
			'no-restricted-syntax': 'off',
		},
	},
);
