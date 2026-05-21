/**
 * T-MPS-007 — `no-legacy-claude-cli-port-names` ESLint rule.
 *
 * Bans re-introduction of the seven legacy identifiers retired in WS-1
 * (SPEC-MPS-001 §2.1, ADR-MPS-001):
 *   - ClaudeCliPort
 *   - ClaudeCliError
 *   - ClaudeCliErrorCode
 *   - ClaudeCliQueryOptions
 *   - ClaudeCliStreamOptions
 *   - CLAUDE_CLI_PORT
 *   - useClaudeCliPort
 *
 * Also defensively bans `useBridge` and `useChatTransports` so the
 * deleted IBridge aggregate cannot creep back in under either name
 * (mirrors the existing ports-pattern ban for IBridge / BridgeKey).
 *
 * The rule fires on:
 *   - Identifier references (variable use, type reference, JSX attribute).
 *   - Import / export specifier names.
 *   - Import / export source string literals that point at the legacy
 *     port-file or composable paths.
 *
 * Allow-list: the deprecated re-export shim at
 *   src/ui/composables/useClaudeCliPort.ts
 * is exempt — the file is the *intentional* one-release re-export. The
 * allow-list is applied at the call-site in `eslint.config.js`.
 *
 * CommonJS (.cjs) — runs in Node's ESLint host (eslint.config.js loads
 * via `createRequire` + `module.exports`).
 */

'use strict';

const LEGACY_IDENTIFIERS = new Set([
	'ClaudeCliPort',
	'ClaudeCliError',
	'ClaudeCliErrorCode',
	'ClaudeCliQueryOptions',
	'ClaudeCliStreamOptions',
	'CLAUDE_CLI_PORT',
	'useClaudeCliPort',
	// Defensive: bans on the deleted aggregate names referenced in
	// ADR-MPS-001 §Compliance.
	'useBridge',
	'useChatTransports',
]);

const LEGACY_IMPORT_PATH_PATTERNS = [
	/(^|\/)domain\/ports\/ClaudeCliPort(\.|$)/,
	/(^|\/)ui\/composables\/useClaudeCliPort(\.|$)/,
];

function isStringLiteral(node) {
	return node !== null && node !== undefined && node.type === 'Literal' && typeof node.value === 'string';
}

function checkSourceLiteral(context, node) {
	if (!isStringLiteral(node)) return;
	const value = node.value;
	for (const re of LEGACY_IMPORT_PATH_PATTERNS) {
		if (re.test(value)) {
			context.report({
				node,
				messageId: 'forbiddenImportPath',
				data: { path: value },
			});
			return;
		}
	}
}

module.exports = {
	meta: {
		type: 'problem',
		docs: {
			description:
				'Forbid any re-introduction of the legacy ClaudeCli* port identifiers ' +
				'(SPEC-MPS-001 §2.1, ADR-MPS-001).',
		},
		schema: [],
		messages: {
			forbiddenIdentifier:
				"'{{name}}' was retired by ADR-MPS-001. Use the ChatTransportPort " +
				'equivalent (see SPEC-MPS-001 §2.1 rename table).',
			forbiddenImportPath:
				"Import path '{{path}}' references a retired ClaudeCli* module. " +
				'Use the ChatTransportPort equivalent under ' +
				'@/domain/ports/ChatTransportPort or @/ui/composables/useChatTransportPort.',
		},
	},
	create(context) {
		function report(node, name) {
			context.report({
				node,
				messageId: 'forbiddenIdentifier',
				data: { name },
			});
		}

		return {
			Identifier(node) {
				if (LEGACY_IDENTIFIERS.has(node.name)) {
					report(node, node.name);
				}
			},
			// Catch `import { useClaudeCliPort } from '...'` even when the
			// specifier is imported via `import * as foo`.
			ImportDeclaration(node) {
				checkSourceLiteral(context, node.source);
			},
			ExportNamedDeclaration(node) {
				if (node.source) checkSourceLiteral(context, node.source);
			},
			ExportAllDeclaration(node) {
				checkSourceLiteral(context, node.source);
			},
		};
	},
};
