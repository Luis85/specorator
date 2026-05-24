import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import pluginVue from 'eslint-plugin-vue';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Project-local ESLint rules (T-ASM-078). Loaded via CommonJS `require`
// because ESLint rules use `module.exports`; this repo's package.json is
// `"type": "module"` so the rule files use the `.cjs` extension. The
// `require` call returns `any`; suppress the type-aware lint here because
// ESLint config is plain JS with no type information for the rule's
// internal shape.
const localRequire = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const noClaudeHomeReadsRule = localRequire('./eslint-rules/no-claude-home-reads.cjs');

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));

// Architectural-boundary import bans by layer (ADR-001 / ADR-008).
const DOMAIN_FORBIDDEN_IMPORTS = [
	{ name: 'obsidian', message: 'Domain must not depend on Obsidian. Use ports/Result instead.' },
	{ name: 'vue', message: 'Domain must not depend on Vue.' },
	{ name: 'pinia', message: 'Domain must not depend on Pinia.' },
	{ name: 'vue-router', message: 'Domain must not depend on Vue Router.' },
	{ name: '@vue/reactivity', message: 'Domain must not depend on Vue reactivity.' },
];
const DOMAIN_FORBIDDEN_PATTERNS = [
	{ group: ['node:*'], message: 'Domain must not depend on Node built-ins.' },
	{
		group: ['@/infrastructure/*', 'src/infrastructure/*', '../infrastructure/*'],
		message: 'Domain must not depend on infrastructure.',
	},
];
// UI may reach into `@/infrastructure/bridge/**` (the port boundary, per
// CLAUDE.md) but nothing else under infrastructure/. Composition-root
// modules (src/ui/main.ts) are carved out further down.
const UI_FORBIDDEN_PATTERNS = [
	{
		group: [
			'@/infrastructure/mock/**',
			'@/infrastructure/obsidian/**',
			'@/infrastructure/localstorage/**',
			'@/infrastructure/vault/**',
			'@/infrastructure/workflow-state/**',
			'src/infrastructure/mock/**',
			'src/infrastructure/obsidian/**',
			'src/infrastructure/localstorage/**',
			'src/infrastructure/vault/**',
			'src/infrastructure/workflow-state/**',
			'../infrastructure/mock/**',
			'../infrastructure/obsidian/**',
			'../infrastructure/localstorage/**',
			'../infrastructure/vault/**',
			'../infrastructure/workflow-state/**',
		],
		message: 'UI may only reach into @/infrastructure/bridge/** (the port boundary).',
	},
];

const MAX_LINES_OPTIONS = { max: 350, skipBlankLines: true, skipComments: true };

// Shared DOM-injection property bans (used in the global block and in scoped
// overrides that carve out the window.* dialog entries for non-plugin contexts).
const DOM_INJECTION_BANS = [
	{
		object: 'document',
		property: 'innerHTML',
		message: 'innerHTML is unsafe; use textContent or createEl().',
	},
	{ property: 'innerHTML', message: 'innerHTML is unsafe; use textContent or createEl().' },
	{ property: 'outerHTML', message: 'outerHTML is unsafe; use createEl()/replaceChildren().' },
	{
		property: 'insertAdjacentHTML',
		message: 'insertAdjacentHTML is unsafe; use createEl()/append().',
	},
];

// ADR-008: the aggregate IBridge / BridgeKey / useBridge surface was deleted
// in favour of four narrow ports under src/domain/ports. Re-introducing any of
// those names — even by accident — should fail lint with a clear pointer.
// Pattern list covers alias-style imports (@/...) and every relative-path form
// the now-deleted files used (`./X`, `../X`, `../bridge/X`, etc.). ESLint's
// `patterns` uses minimatch; `**/X` matches @/... and bare-name forms but does
// NOT match relative dot-prefixed paths, so the relative variants are listed
// explicitly.
const PORTS_BAN_PATTERN = {
	group: [
		'**/IBridge',
		'**/BridgeKey',
		'**/useBridge',
		'./IBridge',
		'./BridgeKey',
		'./useBridge',
		'../IBridge',
		'../BridgeKey',
		'../useBridge',
		'../bridge/IBridge',
		'../bridge/BridgeKey',
		'../composables/useBridge',
	],
	message:
		'IBridge / BridgeKey / useBridge were superseded by the narrow ports in src/domain/ports (ADR-008). Import a specific port (SettingsPort, VaultPort, WorkspacePort, NotificationPort) and the matching composable instead.',
};

// Deleted-subsystem guard (ADR-PSR-001, SPEC-PSR-013, NFR-PSR-009). Bans
// re-importing any path removed in the P0 reboot. Each glob corresponds to a
// real path deleted during the leaf-first waves (a glob matching nothing would
// itself be a defect). OC-PSR-5: the MCP registrars lived under
// `@/infrastructure/obsidian/mcp/**`, so the design's top-level
// `@/infrastructure/mcp/**` glob is dropped in favour of the real path.
//
// The guard evolves per phase (ADR-PSR-001 "regrows per phase"). P1 (chat-core,
// ADR-CC-001) regrows the chat domain (`@/domain/chat`), the chat application
// layer (`@/application/chat`), and `MarkdownRenderPort` (new minimal contract),
// so those entries are removed here. P2 (rich-rendering, ADR-RR-001 §4, T-RR-003)
// regrows the icon seam (`IconPort` + `ICON_PORT` key + the `SpIcon` consumer),
// so `@/domain/ports/IconPort` is dropped from this group and `ICON_PORT` from
// DELETED_INJECTION_KEYS below — these three regrown paths are now permitted
// while EVERY other P0-deleted symbol stays forbidden. (`SpIcon` lives at the
// new UI path `@/ui/chat/SpIcon`, which no ban glob matches — it is permitted by
// construction.) Still-deleted subsystems — the `Feature` aggregate, the old
// transport/MCP/secret/metadata/canvas ports + adapters — stay banned until
// their own phase regrows them.
const DELETED_SUBSYSTEM_BAN = {
	group: [
		'@/domain/feature',
		'@/domain/feature/**',
		'@/application/feature/**',
		'@/application/migration/**',
		'@/infrastructure/bridge/FeatureRepository',
		'@/infrastructure/bridge/degradedClaudeCliPort',
		'@/infrastructure/obsidian/Claude*',
		'@/infrastructure/obsidian/Cursor*',
		'@/infrastructure/obsidian/ObsidianMcp*',
		'@/infrastructure/obsidian/ObsidianCli*',
		'@/infrastructure/obsidian/ObsidianMetadataCache*',
		'@/infrastructure/obsidian/ObsidianCanvas*',
		'@/infrastructure/obsidian/ObsidianSecretStore*',
		'@/infrastructure/obsidian/ObsidianConfirmModal*',
		'@/infrastructure/obsidian/ObsidianMarkdownRender*',
		'@/infrastructure/obsidian/mcp/**',
		'@/infrastructure/cursor/**',
		'**/SpecoratorView',
		'**/AgentSidepanelView',
		'@/domain/ports/ChatTransportPort',
		'@/domain/ports/TransportLifecyclePort',
		'@/domain/ports/ConfirmModalPort',
		'@/domain/ports/SecretStorePort',
		// `@/domain/ports/IconPort` regrows in P2 (ADR-RR-001 §4, T-RR-003) — removed.
		'@/domain/ports/MetadataCachePort',
		'@/domain/ports/CanvasPort',
		'@/domain/ports/ObsidianMcpServerPort',
		'@/domain/ports/ObsidianCliPort',
	],
	message:
		'This module names a subsystem deleted in the P0 reboot (ADR-PSR-001). The chat/feature/transport/MCP/onboarding surface regrows per phase — do not re-import the old path.',
};

// Companion `paths` entry: the InjectionKeys deleted from
// `@/infrastructure/bridge/ports` (only the six core keys remain).
const DELETED_INJECTION_KEYS = {
	name: '@/infrastructure/bridge/ports',
	importNames: [
		// `ICON_PORT` regrows in P2 (ADR-RR-001 §4, T-RR-003) — removed from the ban.
		'METADATA_CACHE_PORT',
		'CANVAS_PORT',
		'CHAT_TRANSPORT_PORT',
		'PROVIDER_REGISTRY_KEY',
		'TRANSPORT_LIFECYCLE_PORT',
		'CONFIRM_MODAL_PORT',
		'SECRET_STORE_PORT',
		'TRANSPORT_KIND_KEY',
		'IS_MOBILE_KEY',
		'SETTINGS_VERSION_KEY',
		'OPEN_PLUGIN_SETTINGS_KEY',
		'PLUGIN_MANIFEST_KEY',
	],
	message:
		'This InjectionKey was deleted in the P0 reboot (ADR-PSR-001). Only the six core ports remain (SETTINGS_PORT, VAULT_PORT, WORKSPACE_PORT, NOTIFICATION_PORT, LOGGER_PORT, COMMUNITY_PLUGIN_PORT).',
};

export default defineConfig(
	// Base JS recommended rules
	js.configs.recommended,

	// TypeScript type-aware rules (project-driven)
	...tseslint.configs.recommendedTypeChecked,
	...tseslint.configs.stylisticTypeChecked,

	// Vue 3 rules (sets vue-eslint-parser as the parser for .vue files)
	...pluginVue.configs['flat/recommended'],

	// obsidianmd plugin recommended rule pack — kept early so project-wide
	// rule blocks below can override anything that conflicts with our setup.
	...obsidianmd.configs.recommended,

	// Project-local rules (T-ASM-078). The `local/no-claude-home-reads` rule
	// bans every code path that would read from `~/.claude/` or shell out
	// with `CLAUDE_CODE_OAUTH_TOKEN` in the spawned env (SPEC-ASM-001 §13.2,
	// NFR-ASM-004). Scoped to `src/**` only — tests, inputs, and docs are
	// allowed to mention these strings for fixture / documentation purposes.
	{
		files: ['src/**/*.ts', 'src/**/*.js', 'src/**/*.vue'],
		plugins: {
			local: {
				rules: {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					'no-claude-home-reads': noClaudeHomeReadsRule,
				},
			},
		},
		rules: {
			'local/no-claude-home-reads': 'error',
		},
	},

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
				project: ['./tsconfig.lint.json'],
				extraFileExtensions: ['.vue'],
				tsconfigRootDir,
			},
		},
	},

	// Disable ESLint formatting rules that conflict with Prettier
	prettier,

	// Global ignores
	{
		ignores: [
			'node_modules/',
			'main.js',
			'dist-plugin/',
			'dist-standalone/',
			'coverage/',
			'storybook-static/',
			'.worktrees/',
			'.claude/',
			'docs/',
			// Handed-in design-intent reference material (HTML mockups + their
			// standalone React JSX runtime). Not part of the plugin or tests;
			// not in tsconfig; should not block CI.
			'inputs/',
			// Boundary-rule proof fixtures: deliberately invalid imports/
			// syntax that the lint test exercises via the ESLint API.
			// Not lintable as part of the daily `npm run lint` surface.
			'**/__fixtures__/**',
			'**/*.json',
			'**/*.md',
			// Node-side build/release scripts: not part of the type-aware lint
			// surface (they run in Node, not in the plugin/UI build).
			'scripts/**',
			// Project-local ESLint rules and their RuleTester suite. CommonJS
			// .cjs files; the type-aware TS rules can't lint them (no
			// tsconfig coverage). Validated by `npm run lint:rules`.
			'eslint-rules/**',
			'version-bump.js',
			// Sub-projects under sites/ have their own ESLint setups.
			'sites/**',
		],
	},

	// Project-wide rules
	{
		files: ['**/*.ts', '**/*.js', '**/*.vue'],
		rules: {
			// Existing rules
			'no-unused-vars': 'off', // delegated to @typescript-eslint/no-unused-vars
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'error',
			'vue/multi-word-component-names': 'off',
			'vue/component-api-style': ['error', ['script-setup']],

			// W5 rule pack — type-aware
			'@typescript-eslint/strict-boolean-expressions': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/no-unsafe-return': 'error',
			'@typescript-eslint/no-unsafe-assignment': 'error',
			'@typescript-eslint/no-unsafe-argument': 'error',
			'@typescript-eslint/no-unsafe-member-access': 'error',
			'@typescript-eslint/no-unsafe-call': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/prefer-nullish-coalescing': 'error',
			'@typescript-eslint/prefer-optional-chain': 'error',
			'@typescript-eslint/restrict-template-expressions': 'error',
			'@typescript-eslint/no-base-to-string': 'error',
			'@typescript-eslint/only-throw-error': 'error',
			'@typescript-eslint/no-confusing-void-expression': 'error',
			'@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
			'@typescript-eslint/require-await': 'error',
			'@typescript-eslint/await-thenable': 'error',
			'@typescript-eslint/no-unnecessary-condition': 'error',
			'@typescript-eslint/no-redundant-type-constituents': 'error',

			// W5 rule pack — scalar
			eqeqeq: ['error', 'always'],
			'no-var': 'error',
			'prefer-const': 'error',
			complexity: ['error', 10],

			// W5 rule pack — DOM injection bans + dialog globals (member-call form).
			// `no-restricted-globals` covers bare confirm()/alert()/prompt(); this
			// block covers the window.confirm() / window.alert() / window.prompt()
			// member-call form that `no-restricted-globals` does not reach.
			// Non-plugin contexts (tests, LocalStorageBridge, stories) re-declare
			// this rule with only DOM_INJECTION_BANS to preserve their carve-out.
			'no-restricted-properties': [
				'error',
				...DOM_INJECTION_BANS,
				{
					object: 'window',
					property: 'confirm',
					message:
						'window.confirm blocks the Obsidian event loop. Use an Obsidian Modal subclass instead.',
				},
				{
					object: 'window',
					property: 'alert',
					message:
						'window.alert blocks the Obsidian event loop. Use NotificationPort or an Obsidian Modal subclass instead.',
				},
				{
					object: 'window',
					property: 'prompt',
					message:
						'window.prompt blocks the Obsidian event loop. Use an Obsidian Modal subclass instead.',
				},
			],

			// v1 shell hardening — Vue template DOM injection ban.
			// `pluginVue.configs['flat/recommended']` sets this to "warn"; we
			// upgrade to "error" so the no-v-html sink matches the severity of
			// the JS/TS innerHTML bans above. See CLAUDE.md "DOM construction".
			'vue/no-v-html': 'error',

			// v1 shell hardening — forbid browser-native dialog globals.
			// `window.confirm` / `alert` / `prompt` block Obsidian's event loop
			// and look out-of-place in the plugin UI. Use an Obsidian `Modal`
			// subclass (e.g. `new (class extends Modal { onOpen() { ... } })(app).open()`)
			// instead. Tests, LocalStorageBridge demo bridge, and any other
			// non-plugin contexts disable this rule via scoped overrides below.
			'no-restricted-globals': [
				'error',
				{
					name: 'confirm',
					message:
						'window.confirm blocks the Obsidian event loop. Use an Obsidian Modal subclass instead.',
				},
				{
					name: 'alert',
					message:
						'window.alert blocks the Obsidian event loop. Use NotificationPort or an Obsidian Modal subclass instead.',
				},
				{
					name: 'prompt',
					message:
						'window.prompt blocks the Obsidian event loop. Use an Obsidian Modal subclass instead.',
				},
			],

			// W5 rule pack — syntax bans
			// Result discipline (ADR-004): raw try/catch is reserved for the
			// infrastructure layer and the tryAsync/trySync helper itself.
			// Domain, application, and UI must use those helpers.
			// `delete` operator is banned project-wide; reassign or omit instead.
			'no-restricted-syntax': [
				'error',
				{
					selector: 'TryStatement',
					message:
						'Use tryAsync/trySync from @/domain/shared/tryAsync instead of try/catch. Raw try/catch is allowed only in src/infrastructure/** and the helper itself.',
				},
				{
					selector: 'UnaryExpression[operator="delete"]',
					message:
						'Avoid the `delete` operator; reassign with `undefined` or rebuild the object instead.',
				},
			],

			// W5 rule pack — cross-layer import baseline
			// (Layer-specific overrides below tighten this further.)
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'obsidian',
							message:
								'Import from obsidian only in the plugin adapter layer (src/plugin/** and src/infrastructure/obsidian/**).',
						},
						DELETED_INJECTION_KEYS,
					],
					patterns: [PORTS_BAN_PATTERN, DELETED_SUBSYSTEM_BAN],
				},
			],

			// W5 rule pack — file-size tiering (warn floor)
			'max-lines': ['warn', MAX_LINES_OPTIONS],

			// W12 — comments tagged with the warning markers below must be
			// converted to GitHub issues instead. See `terms` for the list.
			'no-warning-comments': ['error', { terms: ['todo', 'fixme', 'xxx'], location: 'anywhere' }],

			// Out-of-scope obsidianmd recommended rules — opinionated style
			// items not part of the W5 acceptance list. Keep the security/
			// architectural ones; downgrade purely cosmetic ones.
			'@typescript-eslint/array-type': 'off',
			'@typescript-eslint/no-deprecated': 'warn',
		},
	},

	// Domain layer — strictest import boundary, hard line-limit
	{
		files: ['src/domain/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: DOMAIN_FORBIDDEN_IMPORTS,
					patterns: DOMAIN_FORBIDDEN_PATTERNS,
				},
			],
			'max-lines': ['error', MAX_LINES_OPTIONS],
		},
	},

	// Modules layer (introduced in W2) — same hard line-limit posture
	{
		files: ['src/modules/**/*.ts'],
		rules: {
			'max-lines': ['error', MAX_LINES_OPTIONS],
		},
	},

	// Cross-module import ban — modules communicate through the EventBus only.
	// Pattern 1: alias-path ban (@/modules/other-module/...)
	// Pattern 2: relative-path ban (../other-module/...)
	// Allows: @/modules/index, @/modules/module, ./intra-module-file
	{
		files: ['src/modules/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							regex: String.raw`@/modules/(?!(index|module)$)[^/]+/`,
							message: 'Modules must not import sibling modules directly. Use the EventBus.',
						},
						{
							regex: String.raw`\.\./[^/]+/`,
							message: 'Modules must not import sibling modules directly. Use the EventBus.',
						},
					],
				},
			],
		},
	},

	// Core layer — application/infrastructure boundary.
	// Must not import obsidian, vue, pinia, src/plugin, or src/ui.
	{
		files: ['src/core/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: 'obsidian', message: 'src/core must not import obsidian directly.' },
						{ name: 'vue', message: 'src/core must not import vue.' },
						{ name: 'pinia', message: 'src/core must not import pinia.' },
					],
					patterns: [
						{ regex: String.raw`@/plugin/`, message: 'src/core must not import src/plugin.' },
						{ regex: String.raw`@/ui/`, message: 'src/core must not import src/ui.' },
					],
				},
			],
		},
	},

	// Mock infrastructure — runs in browser/test contexts (not inside Obsidian's
	// popout windows), so the activeWindow timer rule does not apply.
	{
		files: ['src/infrastructure/mock/**/*.ts', 'src/infrastructure/localstorage/**/*.ts'],
		rules: {
			'obsidianmd/prefer-active-window-timers': 'off',
		},
	},

	// UI layer — must not reach into infrastructure. Also runs in plain
	// browser via the standalone build, so popout-window-only rules from
	// the obsidianmd plugin don't apply here.
	{
		files: ['src/ui/**/*.ts', 'src/ui/**/*.vue'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'obsidian',
							message:
								'Import from obsidian only in the plugin adapter layer (src/plugin/** and src/infrastructure/obsidian/**).',
						},
					],
					patterns: [...UI_FORBIDDEN_PATTERNS, PORTS_BAN_PATTERN],
				},
			],
			'obsidianmd/prefer-active-doc': 'off',
			'obsidianmd/prefer-active-window-timers': 'off',
		},
	},

	// Adapter layer — obsidian imports permitted
	{
		files: ['src/plugin/**/*.ts', 'src/infrastructure/obsidian/**/*.ts'],
		rules: {
			'no-restricted-imports': 'off',
		},
	},

	// UI composition root (standalone bootstrap) — instantiates concrete
	// infrastructure adapters and runs in a plain browser, not Obsidian,
	// so the popout-window rules do not apply.
	{
		files: ['src/ui/main.ts'],
		rules: {
			'no-restricted-imports': 'off',
			'obsidianmd/prefer-active-doc': 'off',
			'obsidianmd/prefer-active-window-timers': 'off',
		},
	},

	// Result-discipline allowlist: the helper itself and the infrastructure
	// adapter layer are the only places where raw try/catch is sanctioned.
	// (delete-operator ban still applies.)
	{
		files: ['src/infrastructure/**/*.ts', 'src/domain/shared/tryAsync.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: 'UnaryExpression[operator="delete"]',
					message:
						'Avoid the `delete` operator; reassign with `undefined` or rebuild the object instead.',
				},
			],
		},
	},

	// LocalStorageBridge: the GitHub Pages demo bridge is intentionally
	// browser localStorage-backed; the obsidianmd ban does not apply.
	// Re-declare no-restricted-properties keeping only DOM-injection bans so
	// window.confirm/alert/prompt remain permitted in this context.
	{
		files: ['src/infrastructure/localstorage/**/*.ts'],
		rules: {
			'no-restricted-globals': 'off',
			'no-alert': 'off',
			'no-restricted-properties': ['error', ...DOM_INJECTION_BANS],
		},
	},

	// VaultPath utility: the whole point of this module is to normalise the
	// `.obsidian` configuration directory; the obsidianmd `hardcoded-config-path`
	// warning is exactly what it produces.
	{
		files: ['src/infrastructure/vault/**/*.ts'],
		rules: {
			'obsidianmd/hardcoded-config-path': 'off',
		},
	},

	// MockBridge: dev-only fallback bridge; console.warn is appropriate.
	{
		files: ['src/infrastructure/mock/**/*.ts'],
		rules: {
			'obsidianmd/rule-custom-message': 'off',
		},
	},

	// Plugin adapter layer: `Workspace.revealLeaf` (Promise-returning in
	// 1.7.2) and `FileManager.trashFile` (1.6.6) are the canonical APIs we
	// want to use. The `no-unsupported-api` rule flags them against our
	// declared minAppVersion of 1.4.0; bumping minAppVersion is a
	// release-management decision tracked separately, not a W5 concern.
	{
		files: ['src/plugin/main.ts', 'src/infrastructure/obsidian/**/*.ts'],
		rules: {
			'obsidianmd/no-unsupported-api': 'off',
		},
	},

	// Test files — relax strict rules that get noisy in fixtures/mocks.
	// obsidianmd rules are relaxed too: tests mirror the production modules
	// they cover (e.g. VaultPath tests assert on the literal `.obsidian`
	// path), and UI test fixtures use test-only strings ("My Feature") that
	// are not user-facing.
	{
		files: ['tests/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/only-throw-error': 'off',
			'@typescript-eslint/require-await': 'off',
			// Vitest's expect(spy.method).toHaveBeenCalled() pattern requires
			// passing method references that are vi.fn() mocks, not real class
			// methods; the unbound-method warning is a false positive here.
			'@typescript-eslint/unbound-method': 'off',
			// Empty arrow functions are used as no-op stubs in test fixtures.
			'@typescript-eslint/no-empty-function': 'off',
			'no-restricted-globals': 'off',
			'no-alert': 'off',
			// Re-declare keeping only DOM-injection bans so window.confirm/alert/prompt
			// remain permitted in test fixtures and helpers.
			'no-restricted-properties': ['error', ...DOM_INJECTION_BANS],
			'no-restricted-imports': 'off',
			complexity: 'off',
			'max-lines': 'off',
			'obsidianmd/hardcoded-config-path': 'off',
			'obsidianmd/ui/sentence-case': 'off',
			// Tests run under jsdom in node, not inside Obsidian. The
			// popout-window / forbidden-elements / prefer-create-el rules
			// are about runtime safety inside the plugin sandbox and do not
			// apply to vitest harnesses that need to drive the DOM directly
			// (e.g. injecting `<style>` to verify CSS-token cascades).
			'obsidianmd/prefer-active-doc': 'off',
			'obsidianmd/prefer-active-window-timers': 'off',
			'obsidianmd/prefer-create-el': 'off',
			'obsidianmd/no-forbidden-elements': 'off',
		},
	},

	// Bridge implementations: the four narrow ports declare Promise<T> for
	// every async method; sync-bodied async implementations are valid
	// satisfactions of the contract (and are easier to read than
	// `Promise.resolve(...)`).
	{
		files: [
			'src/infrastructure/mock/**/*.ts',
			'src/infrastructure/localstorage/**/*.ts',
			'src/infrastructure/obsidian/**/*.ts',
		],
		rules: {
			'@typescript-eslint/require-await': 'off',
		},
	},

	// obsidianmd ui/sentence-case — applied to plugin- and UI-facing strings
	// with our brand allowlist.
	{
		files: ['src/plugin/**/*.ts', 'src/ui/**/*.ts', 'src/ui/**/*.vue'],
		rules: {
			'obsidianmd/ui/sentence-case': ['error', { brands: ['Specorator', 'MCP'] }],
		},
	},

	// Tests must query exclusively via data-testid (ADR-009).
	// CSS class and id selector literals passed to wrapper.find / findAll /
	// get / getAll are forbidden — add a data-testid attribute and route
	// through a PageObject getter instead.
	{
		files: ['tests/**/*.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector:
						'CallExpression[callee.property.name=/^(find|findAll|get|getAll)$/] > Literal[value=/^[\\.#]/]',
					message:
						'Tests must query via data-testid only. CSS class and id selectors are forbidden — add a data-testid attribute and route through a PageObject getter instead.',
				},
			],
		},
	},

	// Stories + Storybook config — relax architectural-boundary rules so
	// stories can freely import @/ui/components and @/domain types.
	// Storybook runs in browser/Node, not in Obsidian, so dialog globals are
	// permitted; re-declare keeping only DOM-injection bans.
	{
		files: ['stories/**/*.ts', '.storybook/**/*.ts'],
		rules: {
			'no-restricted-globals': 'off',
			'no-alert': 'off',
			'no-restricted-properties': ['error', ...DOM_INJECTION_BANS],
			'no-restricted-imports': 'off',
			'max-lines': 'off',
			complexity: 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			// Storybook configs run in the browser/Node, not in Obsidian.
			'@typescript-eslint/require-await': 'off',
			'obsidianmd/prefer-active-doc': 'off',
			'obsidianmd/prefer-active-window-timers': 'off',
		},
	},
);
