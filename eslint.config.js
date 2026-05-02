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
		},
	},

	// Adapter layer — obsidian imports permitted here
	{
		files: ['src/plugin/**/*.ts', 'src/infrastructure/obsidian/**/*.ts'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},
);
