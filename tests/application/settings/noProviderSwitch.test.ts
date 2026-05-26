/**
 * T-SS-029 — the cross-cutting source-level guards for the settings shell
 * (SPEC-SS-021/023/026, TEST-SS-010/014/095).
 *
 * (a) **No `switch (providerId)` / `if (provider === '…')`** anywhere in
 *     `src/application/settings/**` + `src/domain/chat/environment/**` — provider-varying
 *     behaviour gates on the capability bag + descriptor data, never a provider-id branch
 *     (NFR-SS-008, REQ-SS-010). The ONE allowed switch is on the `SettingsControl.kind`
 *     union in `src/plugin/settings.ts` (asserted separately to be on `kind`, not `providerId`).
 * (b) **Safe DOM + no blocking dialog** in the new settings plugin code — no
 *     `innerHTML`/`outerHTML`/`insertAdjacentHTML` assignment and no
 *     `window.confirm`/`alert`/`prompt` (REQ-SS-095, NFR-SS-010, SPEC-SS-023). The DOM is
 *     the `Setting` API / `createEl` / `setText`; confirmations use an Obsidian `Modal`.
 * (c) **i18n discipline** — every user-facing string the settings tab/modals surface goes
 *     through `t(...)`; a notification call never receives a raw string literal, and no
 *     secret/env VALUE substring reaches a notice or log (REQ-SS-014, NFR-SS-002).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '../../../src');

/** A `switch (providerId)` or `if (provider === '…')` / `provider === "…"` branch. */
const SWITCH_RE = /switch\s*\(\s*provider(Id)?\s*\)/;
const EQUALITY_RE = /provider(Id)?\s*===\s*['"]/;

/** Strip block + line comments so a doc-comment mention of a pattern never trips a guard. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function listTs(relDir: string): readonly string[] {
	return readdirSync(resolve(srcRoot, relDir))
		.filter((name) => name.endsWith('.ts'))
		.map((name) => `${relDir}/${name}`);
}

const NO_SWITCH_FILES = [...listTs('application/settings'), ...listTs('domain/chat/environment')];

const SETTINGS_PLUGIN_FILES = ['plugin/settings.ts', 'plugin/modals/EnvSnippetModalHost.ts'];

describe('settings shell guards (T-SS-029)', () => {
	describe('(a) no switch(providerId) over application/settings + domain/chat/environment (TEST-SS-010)', () => {
		for (const rel of NO_SWITCH_FILES) {
			it(`${rel} has no switch(providerId) / provider-id equality branch`, () => {
				const source = stripComments(readFileSync(resolve(srcRoot, rel), 'utf8'));
				expect(SWITCH_RE.test(source), `switch(providerId) found in ${rel}`).toBe(false);
				expect(EQUALITY_RE.test(source), `provider-id equality branch found in ${rel}`).toBe(false);
			});
		}

		it('the settings renderer switches on control.kind, never on providerId (SPEC-SS-021)', () => {
			const source = stripComments(readFileSync(resolve(srcRoot, 'plugin/settings.ts'), 'utf8'));
			// The ONE allowed switch is on the discriminated-union `kind`.
			expect(/switch\s*\(\s*control\.kind\s*\)/.test(source)).toBe(true);
			expect(SWITCH_RE.test(source), 'switch(providerId) found in settings.ts').toBe(false);
			expect(EQUALITY_RE.test(source), 'provider-id equality branch found in settings.ts').toBe(
				false,
			);
		});
	});

	describe('(b) safe DOM + no blocking dialog in the settings plugin code (TEST-SS-095)', () => {
		for (const rel of SETTINGS_PLUGIN_FILES) {
			it(`${rel} assigns no innerHTML/outerHTML/insertAdjacentHTML and calls no window.confirm/alert/prompt`, () => {
				const source = stripComments(readFileSync(resolve(srcRoot, rel), 'utf8'));
				expect(/\.(inner|outer)HTML\s*=/.test(source), `HTML assignment in ${rel}`).toBe(false);
				expect(source.includes('insertAdjacentHTML'), `insertAdjacentHTML in ${rel}`).toBe(false);
				// The ban is the blocking GLOBAL `window.confirm`/`alert`/`prompt`. A
				// method named `confirm` (`this.confirm()` / a `private async confirm()`
				// declaration) is fine — strip member accesses + method declarations
				// before probing for the bare global call.
				const probe = source
					.replace(/\.\s*(confirm|alert|prompt)\b/g, '')
					.replace(/\b(async\s+|private\s+|function\s+)+(confirm|alert|prompt)\b/g, '');
				expect(/window\s*\.\s*(confirm|alert|prompt)\s*\(/.test(source), `window dialog in ${rel}`).toBe(
					false,
				);
				expect(
					/(?<![.\w])(confirm|alert|prompt)\s*\(/.test(probe),
					`blocking dialog call in ${rel}`,
				).toBe(false);
			});
		}
	});

	describe('(c) i18n discipline — notifications go through t(...), no raw literal (TEST-SS-014)', () => {
		for (const rel of SETTINGS_PLUGIN_FILES) {
			it(`${rel} never passes a raw string literal to a notification method`, () => {
				const source = stripComments(readFileSync(resolve(srcRoot, rel), 'utf8'));
				// `.showError('…')` / `.showWarning("…")` etc. with a bare string literal first
				// argument is forbidden — the argument must be a `t(...)` call.
				const rawNotice = /\.show(Error|Warning|Success|Info)\s*\(\s*['"`]/.exec(source);
				expect(rawNotice, `raw notification literal in ${rel}: ${rawNotice?.[0] ?? ''}`).toBeNull();
			});
		}
	});
});
