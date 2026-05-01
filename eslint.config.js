import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Base JS recommended rules
	js.configs.recommended,

	// TypeScript rules
	...tseslint.configs.recommended,

	// Vue 3 rules (covers .vue SFCs; no-op until Vue files are added in #14)
	...pluginVue.configs['flat/recommended'],

	// Disable ESLint formatting rules that conflict with Prettier
	prettier,

	// Global ignores
	{
		ignores: ['node_modules/', 'main.js'],
	},

	// Project-wide rules
	{
		files: ['**/*.ts', '**/*.js', '**/*.vue'],
		rules: {
			// Adapter boundary: obsidian must only be imported in the plugin
			// adapter layer. Tighten to src/plugin/** once the repository layout
			// from issue #13 is in place.
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'obsidian',
							message:
								'Import from obsidian only in the plugin adapter layer (src/main.ts or src/plugin/**).',
						},
					],
				},
			],
		},
	},

	// Adapter layer — obsidian imports permitted here
	{
		files: ['src/main.ts', 'src/plugin/**/*.ts'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},
);
