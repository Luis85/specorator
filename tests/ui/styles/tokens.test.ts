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
});
