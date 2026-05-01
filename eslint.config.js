import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Base JS recommended rules
	js.configs.recommended,

	// TypeScript rules
	...tseslint.configs.recommended,

	// Vue 3 rules
	...pluginVue.configs['flat/recommended'],

	// Disable ESLint formatting rules that conflict with Prettier
	prettier,

	// Global ignores
	{
		ignores: ['node_modules/', 'main.js', 'dist-standalone/'],
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
		files: ['src/plugin/**/*.ts'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},
);
