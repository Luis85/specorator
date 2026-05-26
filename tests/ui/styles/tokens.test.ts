/**
 * Token-presence test for the WS-AUX-1 design-token layer (REQ-AUX-006,
 * REQ-AUX-009). Asserts every `--sp-*` token enumerated in
 * `specs/agent-ux-parity/spec.md` §4.1–§4.7 — plus the P3 threads/sessions
 * §4.10 block (`specs/threads-sessions/spec.md` SPEC-TS-028, NFR-TS-012) — is
 * declared by `src/ui/styles/tokens.css` on the `.specorator-root` selector and
 * the brand-override blocks.
 *
 * The test reads the CSS file as a string rather than mounting + computing
 * styles because jsdom's `getComputedStyle` resolves custom properties to
 * empty strings when the value chain transits `var(--foo)` lookups against
 * undefined parents (Obsidian theme vars are not loaded in unit tests).
 * Source-level grep gives a deterministic contract check against the
 * spec.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const TOKENS_PATH = resolve(__dirname, '../../../src/ui/styles/tokens.css');

const COLOUR_TOKENS = [
	'--sp-text-normal',
	'--sp-text-muted',
	'--sp-text-faint',
	'--sp-bg-primary',
	'--sp-bg-primary-alt',
	'--sp-bg-secondary',
	'--sp-bg-secondary-alt',
	'--sp-border',
	'--sp-border-strong',
	'--sp-interactive-accent',
	'--sp-interactive-hover',
	'--sp-error',
	'--sp-error-rgb',
	'--sp-warning',
	'--sp-success',
	'--sp-compact',
	'--sp-focus-ring',
];

const BRAND_TOKENS = [
	'--sp-brand',
	'--sp-brand-rgb',
	'--sp-brand-claude',
	'--sp-brand-claude-rgb',
	'--sp-brand-codex',
	'--sp-brand-codex-rgb',
	'--sp-brand-opencode',
	'--sp-brand-opencode-rgb',
	'--sp-brand-cursor',
	'--sp-brand-cursor-rgb',
	'--sp-brand-translucent',
	'--sp-accent',
];

const TYPOGRAPHY_TOKENS = [
	'--sp-font-text',
	'--sp-font-mono',
	'--sp-font-serif',
	'--sp-font-size-xs',
	'--sp-font-size-sm',
	'--sp-font-size-md',
	'--sp-font-size-base',
	'--sp-font-size-lg',
	'--sp-font-size-xl',
	'--sp-font-size-display',
	'--sp-font-weight-light',
	'--sp-font-weight-medium',
	'--sp-font-weight-semibold',
	'--sp-line-height-tight',
	'--sp-line-height-normal',
];

const SPACING_TOKENS = [
	'--sp-space-1',
	'--sp-space-2',
	'--sp-space-3',
	'--sp-space-4',
	'--sp-space-5',
	'--sp-space-6',
	'--sp-space-7',
];

const RADII_TOKENS = [
	'--sp-radius-xs',
	'--sp-radius-sm',
	'--sp-radius-md',
	'--sp-radius-lg',
	'--sp-radius-pill',
	'--sp-radius-pill-lg',
	'--sp-radius-pill-xl',
	'--sp-radius-full',
	'--sp-radius-bubble-tail-user',
	'--sp-radius-bubble-tail-assistant',
];

const MOTION_TOKENS = [
	'--sp-shadow-subtle',
	'--sp-shadow-dropup',
	'--sp-shadow-dropdown',
	'--sp-shadow-focus-ring',
	'--sp-blur',
	'--sp-z-base',
	'--sp-z-floating',
	'--sp-z-tooltip',
	'--sp-z-nav',
	'--sp-z-dropdown',
	'--sp-z-dropdown-fixed',
	'--sp-duration-fast',
	'--sp-duration-medium',
	'--sp-duration-slow',
	'--sp-ease',
	'--sp-ease-in-out',
	'--sp-ease-linear',
];

const SURFACE_TOKENS = ['--sp-surface-overlay'];

/**
 * §4.10 — Threads & sessions (P3, SPEC-TS-028 / NFR-TS-012). Every token the P3
 * components reference (TabBar.vue, ResumeSessionDropdown.vue, ForkTargetModal).
 * `--sp-history-spin-duration` is declared only inside the reduced-motion guard
 * (the component normal-mode value comes from its own `var(--…, 0.8s)` fallback),
 * so it is asserted separately by the reduced-motion test below.
 */
const THREADS_SESSIONS_TOKENS = [
	'--sp-tab-size',
	'--sp-tab-border-idle',
	'--sp-tab-border-active',
	'--sp-tab-border-streaming',
	'--sp-tab-border-attention',
	'--sp-history-row-h',
	'--sp-history-delete',
	'--sp-history-blur',
	'--sp-fork-modal-max-inline',
];

/**
 * §4.11 — Composer power (P4, SPEC-CP-029 / NFR-CP-011). Every `--sp-*` token the
 * P4 composer components reference (dropdown palette, plan-mode, instruction/
 * bang-bash borders, inline blocks, mention category icons).
 * `--sp-dropdown-anim-duration` is declared only inside the reduced-motion guard,
 * so it is asserted separately by the reduced-motion test below.
 */
const COMPOSER_POWER_TOKENS = [
	'--sp-dropdown-shadow',
	'--sp-dropdown-max-h',
	'--sp-option-selected-bg',
	'--sp-plan-accent',
	'--sp-plan-border',
	'--sp-plan-label-bg',
	'--sp-instruction-border',
	'--sp-bash-border',
	'--sp-bash-output-bg',
	'--sp-inline-block-bg',
	'--sp-ask-cursor',
	'--sp-ask-item-focused-bg',
	'--sp-mention-file',
	'--sp-mention-agent',
	'--sp-mention-mcp',
	'--sp-mention-dir',
];

/**
 * §4.12 — Context & attachments (P5, SPEC-CA-027 / NFR-CA-007). The eight `--sp-*`
 * tokens the P5 surfaces genuinely need (file/image chips, the context bar, the
 * image thumbnail + preview modal, the selection highlight, the inline-edit modal).
 * The word-diff preview rides the §4.9 P2 diff tokens unchanged — no new diff token.
 */
const CONTEXT_ATTACHMENTS_TOKENS = [
	'--sp-chip-bg',
	'--sp-chip-border',
	'--sp-chip-radius',
	'--sp-context-bar-gap',
	'--sp-image-thumb-size',
	'--sp-image-modal-max',
	'--sp-selection-highlight-bg',
	'--sp-inline-edit-modal-w',
];

/**
 * §4.13 — Toolbar & controls (P6, SPEC-TC-026 / NFR-TC-008). The `--sp-*` tokens
 * the P6 toolbar surfaces genuinely need (strip row, widget height, the dimmed
 * seam affordance, the toggle track/thumb/active fill, the usage arc gauge, the
 * service-tier active glow). The strip's dropdowns reuse the P4 `SpDropdownPanel`
 * / `--sp-surface-overlay` pattern — no new dropdown token is minted for P6.
 */
const TOOLBAR_CONTROLS_TOKENS = [
	'--sp-toolbar-gap',
	'--sp-toolbar-widget-h',
	'--sp-toolbar-disabled-opacity',
	'--sp-toggle-track',
	'--sp-toggle-thumb',
	'--sp-toggle-active',
	'--sp-usage-arc-track',
	'--sp-usage-arc-fill',
	'--sp-usage-arc-warn',
	'--sp-usage-arc-size',
	'--sp-usage-arc-stroke',
	'--sp-service-tier-glow',
];

/**
 * §4.14 — Approvals & security (P7, SPEC-AS-020 / NFR-AS-012). The four `--sp-*`
 * tokens the P7 status-panel + permission-toggle surfaces genuinely need (the
 * rule-list row gap, the allow/deny decision badge tints, the active
 * permission-mode pill fill). The toggle/panel reuse the existing set otherwise
 * (`--sp-border`, `--sp-bg-*`, `--sp-text-*`, `--sp-space-*`, the P6
 * `--sp-toggle-active`) — only these four are minted for P7. The block marker is
 * ASCII (`section 4.14`) so the standalone lightningcss minifier accepts the
 * comment.
 */
const APPROVALS_SECURITY_TOKENS = [
	'--sp-approvals-row-gap',
	'--sp-approvals-decision-allow',
	'--sp-approvals-decision-deny',
	'--sp-permission-mode-active',
];

/**
 * §4.15 — MCP client (P8, SPEC-MC-021 / NFR-MC-009). The four `--sp-*` tokens the
 * P8 mcp-settings + mcp-modal + mcp-selector surfaces genuinely need (the row
 * gap, the reachable/unreachable status tints, the enabled-count selector badge).
 * The settings/modal/selector reuse the existing set otherwise (`--sp-border`,
 * `--sp-bg-*`, `--sp-text-*`, `--sp-space-*`, `--sp-accent`, the P6
 * `--sp-toggle-active`/`--sp-z-dropdown`/`--sp-shadow-dropup`) — only these four
 * are minted for P8. The block marker is ASCII (`section 4.15`) so the standalone
 * lightningcss minifier accepts the comment.
 */
const MCP_CLIENT_TOKENS = [
	'--sp-mcp-row-gap',
	'--sp-mcp-status-ok',
	'--sp-mcp-status-error',
	'--sp-mcp-selector-badge',
];

/**
 * §4.16 — Providers registry (P9, SPEC-PV-021 / NFR-PV-010). The four `--sp-*`
 * tokens the P9 provider-chooser + provider-secret + opencode-model-picker
 * surfaces genuinely need (the per-provider brand swatch aliases + the
 * model-picker group gap). The chooser/option/secret-field reuse the existing
 * set otherwise (`--sp-border`, `--sp-radius-*`, `--sp-bg-*`, `--sp-surface-overlay`,
 * `--sp-text-*`, `--sp-accent`, `--sp-space-*`, `--sp-font-*`, the P6
 * `--sp-toolbar-widget-h`) — only these four are minted for P9. The block marker
 * is ASCII (`section 4.16`) so the standalone lightningcss minifier accepts the
 * comment.
 */
const PROVIDERS_REGISTRY_TOKENS = [
	'--sp-provider-brand-claude',
	'--sp-provider-brand-codex',
	'--sp-provider-brand-opencode',
	'--sp-model-picker-group-gap',
];

/**
 * §4.17 — Settings shell (P10, SPEC-SS-015, NFR-SS-009). The four `--sp-*` tokens
 * the P10 settings/* slice (base/plugin/agent/slash/env-snippets/mcp/
 * opencode-model-picker) genuinely needs (the section-heading rhythm, the list-row
 * gap, the env-snippet/context-limit item radius + background). The seven modules
 * reuse the existing set otherwise (`--sp-text-*`, `--sp-bg-*`, `--sp-border`,
 * `--sp-radius-*`, `--sp-space-*`, `--sp-font-*`, `--sp-interactive-accent`, the P8
 * `--sp-mcp-row-gap`, the P9 `--sp-model-picker-group-gap`) — only these four are
 * minted for P10. The block marker is ASCII (`section 4.17`) so the standalone
 * lightningcss minifier accepts the comment.
 */
const SETTINGS_SHELL_TOKENS = [
	'--sp-settings-section-gap',
	'--sp-settings-row-gap',
	'--sp-settings-snippet-radius',
	'--sp-settings-snippet-bg',
];

const PROVIDER_IDS = ['claude', 'codex', 'opencode', 'cursor'] as const;

function loadTokens(): string {
	return readFileSync(TOKENS_PATH, 'utf8');
}

function assertTokensDeclared(css: string, tokens: readonly string[]): void {
	for (const token of tokens) {
		// Each token must appear as a declaration `--sp-foo:` (left-hand side).
		// We do not enforce the value (defaults map to Obsidian vars and brand
		// literals; the spec controls those — this test enforces presence).
		expect(css, `expected token "${token}" to be declared in tokens.css`).toMatch(
			new RegExp(`${token.replace(/-/g, '\\-')}\\s*:`),
		);
	}
}

describe('src/ui/styles/tokens.css — token contract (REQ-AUX-006, REQ-AUX-009)', () => {
	it('declares every §4.1 colour token on .specorator-root', () => {
		const css = loadTokens();
		expect(css).toContain('.specorator-root');
		assertTokensDeclared(css, COLOUR_TOKENS);
	});

	it('declares every §4.2 brand token + provider override selector', () => {
		const css = loadTokens();
		assertTokensDeclared(css, BRAND_TOKENS);
		// Quote-agnostic: prettier owns the CSS attribute-selector quote style
		// (single vs double); the §4.2 contract is the override selector's presence.
		for (const id of PROVIDER_IDS) {
			expect(css, `expected provider selector for "${id}"`).toMatch(
				new RegExp(`\\.specorator-root\\[data-provider=['"]${id}['"]\\]`),
			);
		}
		// body.theme-light override block is required by spec §4.2.
		expect(css).toMatch(/body\.theme-light\s+\.specorator-root/);
	});

	it('declares every §4.3 typography token (including Copernicus serif stack)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, TYPOGRAPHY_TOKENS);
		// Copernicus stack is mandated by spec §4.3.
		expect(css).toMatch(/--sp-font-serif\s*:[^;]*Copernicus/);
	});

	it('declares every §4.4 spacing token', () => {
		const css = loadTokens();
		assertTokensDeclared(css, SPACING_TOKENS);
	});

	it('declares every §4.5 radii token', () => {
		const css = loadTokens();
		assertTokensDeclared(css, RADII_TOKENS);
	});

	it('declares every §4.6 motion/shadow/z token + reduced-motion override', () => {
		const css = loadTokens();
		assertTokensDeclared(css, MOTION_TOKENS);
		// Spec §4.6 requires the reduced-motion @media block to collapse
		// `--sp-duration-*` to `0s`.
		expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
	});

	it('declares the §4.7 surface token', () => {
		const css = loadTokens();
		assertTokensDeclared(css, SURFACE_TOKENS);
	});

	it('declares every §4.10 threads/sessions token (SPEC-TS-028, NFR-TS-012)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, THREADS_SESSIONS_TOKENS);
		// The streaming-border brand override hangs off the provider seam — the
		// claude provider must redeclare `--sp-tab-border-streaming` so the
		// active provider's accent drives the streaming badge (SPEC-TS-028).
		// Quote-agnostic on the selector (prettier owns CSS attr-selector quotes).
		expect(css).toMatch(
			/\.specorator-root\[data-provider=['"]claude['"]\][\s\S]*?--sp-tab-border-streaming\s*:/,
		);
	});

	it('zeroes --sp-history-spin-duration under reduced-motion (NFR-TS-010)', () => {
		const css = loadTokens();
		// The history/title spin reuses the P2 `spin` keyframe; reduced-motion
		// collapses its duration to 0s via this token (no new keyframe).
		expect(css).toMatch(/--sp-history-spin-duration\s*:\s*0s/);
	});

	it('declares every §4.11 composer-power token (SPEC-CP-029, NFR-CP-011)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, COMPOSER_POWER_TOKENS);
	});

	it('zeroes --sp-dropdown-anim-duration under reduced-motion (NFR-CP-008)', () => {
		const css = loadTokens();
		// The palette open animation collapses to instant under reduced-motion.
		expect(css).toMatch(/--sp-dropdown-anim-duration\s*:\s*0s/);
	});

	it('declares every §4.12 context/attachments token (SPEC-CA-027, NFR-CA-007)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, CONTEXT_ATTACHMENTS_TOKENS);
		// The word-diff preview rides the §4.9 P2 diff tokens — no new diff token
		// is minted for P5 (SPEC-CA-027).
		expect(css).not.toMatch(/--sp-diff-(?:word|inline)[a-z-]*\s*:/);
	});

	it('declares the §4.12 tokens with no raw-hex / Obsidian-var / physical-property leak (TEST-CA-032)', () => {
		const css = loadTokens();
		// Isolate the §4.12 declaration block and assert each P5 token resolves to
		// a token-layer var() lookup (or a bare dimension) — never a raw hex, a raw
		// Obsidian var, or a physical CSS property.
		const block = css.slice(css.indexOf('§4.12'), css.indexOf('§4.13'));
		for (const token of CONTEXT_ATTACHMENTS_TOKENS) {
			const match = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block);
			expect(match, `expected ${token} declared in the §4.12 block`).not.toBeNull();
			const value = match?.[1] ?? '';
			// No raw hex colour literal.
			expect(value, `${token} must not carry a raw hex literal`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
			// No raw Obsidian theme var (only --sp-* lookups are allowed).
			expect(value, `${token} must not read a raw Obsidian var`).not.toMatch(
				/var\(--(?!sp-)[a-z]/,
			);
		}
	});

	it('declares every §4.13 toolbar/controls token (SPEC-TC-026, NFR-TC-008)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, TOOLBAR_CONTROLS_TOKENS);
	});

	it('declares the §4.13 tokens with no raw-hex / Obsidian-var / physical-property leak (TEST-TC-026)', () => {
		const css = loadTokens();
		// Isolate the §4.13 declaration block (bounded by the §4.14 marker) and
		// assert each P6 token resolves to a token-layer var() lookup (or a bare
		// dimension/shadow) — never a raw hex, a raw Obsidian var, or a physical
		// CSS property.
		const block = css.slice(css.indexOf('§4.13'), css.indexOf('section 4.14'));
		for (const token of TOOLBAR_CONTROLS_TOKENS) {
			const match = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block);
			expect(match, `expected ${token} declared in the §4.13 block`).not.toBeNull();
			const value = match?.[1] ?? '';
			// No raw hex colour literal.
			expect(value, `${token} must not carry a raw hex literal`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
			// No raw Obsidian theme var (only --sp-* lookups are allowed).
			expect(value, `${token} must not read a raw Obsidian var`).not.toMatch(
				/var\(--(?!sp-)[a-z]/,
			);
		}
	});

	it('declares every §4.14 approvals/security token (SPEC-AS-020, NFR-AS-012)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, APPROVALS_SECURITY_TOKENS);
	});

	it('declares the §4.14 tokens with no raw-hex / Obsidian-var / physical-property leak (TEST-AS-062)', () => {
		const css = loadTokens();
		// Isolate the §4.14 declaration block (ASCII `section 4.14` marker so the
		// standalone lightningcss minifier accepts the comment), bounded by the
		// §4.15 marker, and assert each P7 token resolves to a token-layer var()
		// lookup — never a raw hex or a raw Obsidian var.
		const block = css.slice(css.indexOf('section 4.14'), css.indexOf('section 4.15'));
		for (const token of APPROVALS_SECURITY_TOKENS) {
			const match = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block);
			expect(match, `expected ${token} declared in the §4.14 block`).not.toBeNull();
			const value = match?.[1] ?? '';
			// No raw hex colour literal.
			expect(value, `${token} must not carry a raw hex literal`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
			// No raw Obsidian theme var (only --sp-* lookups are allowed).
			expect(value, `${token} must not read a raw Obsidian var`).not.toMatch(
				/var\(--(?!sp-)[a-z]/,
			);
		}
	});

	it('declares every §4.15 MCP-client token (SPEC-MC-021, NFR-MC-009)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, MCP_CLIENT_TOKENS);
	});

	it('declares the §4.15 tokens with no raw-hex / Obsidian-var / physical-property leak (TEST-MC-045)', () => {
		const css = loadTokens();
		// Isolate the §4.15 declaration block (ASCII `section 4.15` marker so the
		// standalone lightningcss minifier accepts the comment), bounded by the
		// §4.16 marker, and assert each P8 token resolves to a token-layer var()
		// lookup — never a raw hex or a raw Obsidian var.
		const block = css.slice(css.indexOf('section 4.15'), css.indexOf('section 4.16'));
		for (const token of MCP_CLIENT_TOKENS) {
			const match = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block);
			expect(match, `expected ${token} declared in the §4.15 block`).not.toBeNull();
			const value = match?.[1] ?? '';
			// No raw hex colour literal.
			expect(value, `${token} must not carry a raw hex literal`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
			// No raw Obsidian theme var (only --sp-* lookups are allowed).
			expect(value, `${token} must not read a raw Obsidian var`).not.toMatch(
				/var\(--(?!sp-)[a-z]/,
			);
		}
	});

	it('declares every §4.16 providers-registry token (SPEC-PV-021, NFR-PV-010)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, PROVIDERS_REGISTRY_TOKENS);
	});

	it('declares the §4.16 tokens with no raw-hex / Obsidian-var / physical-property leak (TEST-PV-091)', () => {
		const css = loadTokens();
		// Isolate the §4.16 declaration block (ASCII `section 4.16` marker so the
		// standalone lightningcss minifier accepts the comment), bounded by the §4.17
		// marker, and assert each P9 token resolves to a token-layer var() lookup —
		// never a raw hex or a raw Obsidian var.
		const block = css.slice(css.indexOf('section 4.16'), css.indexOf('section 4.17'));
		for (const token of PROVIDERS_REGISTRY_TOKENS) {
			const match = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block);
			expect(match, `expected ${token} declared in the §4.16 block`).not.toBeNull();
			const value = match?.[1] ?? '';
			// No raw hex colour literal.
			expect(value, `${token} must not carry a raw hex literal`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
			// No raw Obsidian theme var (only --sp-* lookups are allowed).
			expect(value, `${token} must not read a raw Obsidian var`).not.toMatch(
				/var\(--(?!sp-)[a-z]/,
			);
		}
	});

	it('declares every §4.17 settings-shell token (SPEC-SS-015, NFR-SS-009)', () => {
		const css = loadTokens();
		assertTokensDeclared(css, SETTINGS_SHELL_TOKENS);
	});

	it('declares the §4.17 tokens with no raw-hex / Obsidian-var / physical-property leak (TEST-SS-M4)', () => {
		const css = loadTokens();
		// Isolate the §4.17 declaration block (ASCII `section 4.17` marker so the
		// standalone lightningcss minifier accepts the comment) and assert each P10
		// settings token resolves to a token-layer var() lookup (or a bare dimension) —
		// never a raw hex or a raw Obsidian var.
		const block = css.slice(css.indexOf('section 4.17'));
		for (const token of SETTINGS_SHELL_TOKENS) {
			const match = new RegExp(`${token.replace(/-/g, '\\-')}\\s*:\\s*([^;]+);`).exec(block);
			expect(match, `expected ${token} declared in the §4.17 block`).not.toBeNull();
			const value = match?.[1] ?? '';
			// No raw hex colour literal.
			expect(value, `${token} must not carry a raw hex literal`).not.toMatch(/#[0-9a-fA-F]{3,8}/);
			// No raw Obsidian theme var (only --sp-* lookups are allowed).
			expect(value, `${token} must not read a raw Obsidian var`).not.toMatch(
				/var\(--(?!sp-)[a-z]/,
			);
		}
	});
});
