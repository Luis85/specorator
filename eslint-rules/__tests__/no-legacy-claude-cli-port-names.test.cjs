/**
 * T-MPS-007 — Tests for the `no-legacy-claude-cli-port-names` ESLint rule.
 *
 * Covers REQ-MPS-009, NFR-MPS-012. Runs in Node via the standard
 * ESLint `RuleTester` (CommonJS), not Vitest. Invoked by
 * `npm run lint:rules`.
 *
 * Each invalid case re-introduces one of the seven retired identifiers
 * or a legacy import path; each valid case shows the post-rename
 * spelling and proves the rule does not over-fire on the new names.
 *
 * Refs SPEC-MPS-001 §2.1, ADR-MPS-001.
 */

'use strict';

const { RuleTester } = require('eslint');
const rule = require('../no-legacy-claude-cli-port-names.cjs');

const ruleTester = new RuleTester({
	languageOptions: {
		ecmaVersion: 2022,
		sourceType: 'module',
	},
});

ruleTester.run('no-legacy-claude-cli-port-names', rule, {
	valid: [
		// Post-rename identifiers must not fire.
		"import { ChatTransportPort } from '@/domain/ports'",
		"import { ChatTransportError } from '@/domain/ports'",
		"import { CHAT_TRANSPORT_PORT } from '@/infrastructure/bridge/ports'",
		"import { useChatTransportPort } from '@/ui/composables/useChatTransportPort'",
		"const port = ChatTransportPort.make()",
		// Unrelated identifiers must not fire.
		"const port = 'somePort'",
		"export const Claude = { greet: () => 'hi' }",
		// Unrelated import paths must not fire.
		"import x from '@/domain/ports/SettingsPort'",
		"import y from '@/ui/composables/useChatTransportPort'",
	],
	invalid: [
		{
			// `import { Foo }` produces two Identifier nodes (imported +
			// local). Both fire the rule, which is fine — the user only
			// needs to see at least one diagnostic on the offending line.
			code: "import { ClaudeCliPort } from '@/domain/ports'",
			errors: [
				{ messageId: 'forbiddenIdentifier' },
				{ messageId: 'forbiddenIdentifier' },
			],
		},
		{
			code: "import { ClaudeCliError } from '@/domain/ports'",
			errors: [
				{ messageId: 'forbiddenIdentifier' },
				{ messageId: 'forbiddenIdentifier' },
			],
		},
		{
			code: "const Code = ClaudeCliErrorCode",
			errors: [{ messageId: 'forbiddenIdentifier' }],
		},
		{
			code: "const Q = ClaudeCliQueryOptions",
			errors: [{ messageId: 'forbiddenIdentifier' }],
		},
		{
			code: "const S = ClaudeCliStreamOptions",
			errors: [{ messageId: 'forbiddenIdentifier' }],
		},
		{
			code: "import { CLAUDE_CLI_PORT } from '@/infrastructure/bridge/ports'",
			errors: [
				{ messageId: 'forbiddenIdentifier' },
				{ messageId: 'forbiddenIdentifier' },
			],
		},
		{
			code: "const port = useClaudeCliPort()",
			errors: [{ messageId: 'forbiddenIdentifier' }],
		},
		{
			code: "import x from '@/domain/ports/ClaudeCliPort'",
			errors: [{ messageId: 'forbiddenImportPath' }],
		},
		{
			code: "import x from '@/ui/composables/useClaudeCliPort'",
			errors: [{ messageId: 'forbiddenImportPath' }],
		},
		// Defensive bans on the deleted IBridge aggregate names.
		{
			code: "const b = useBridge()",
			errors: [{ messageId: 'forbiddenIdentifier' }],
		},
		{
			code: "const t = useChatTransports()",
			errors: [{ messageId: 'forbiddenIdentifier' }],
		},
	],
});

console.log('no-legacy-claude-cli-port-names: all RuleTester cases pass.');
