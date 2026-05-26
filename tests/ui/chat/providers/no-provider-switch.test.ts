/**
 * T-PV-031 (RED) — the no-`switch(providerId)` invariant over the provider-aware UI
 * (TEST-PV-013 widget leg).
 *
 * SPEC-PV-029, NFR-PV-014, REQ-PV-013. Provider-varying behaviour gates on the
 * CAPABILITY BAG, never on the provider id. This source-level guard asserts the
 * toolbar widgets + the provider components contain no `switch (providerId)` /
 * `if (provider === …)` branch — adding a provider needs registry data + a runtime
 * impl, no new UI branch.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcUi = resolve(here, '../../../../src/ui');

const GUARDED_FILES = [
	'chat/toolbar/ModelSelector.vue',
	'chat/toolbar/ThinkingSelector.vue',
	'chat/toolbar/ServiceTierToggle.vue',
	'chat/providers/ProviderChooser.vue',
	'chat/providers/ProviderOption.vue',
	'chat/providers/ProviderSecretField.vue',
];

// A `switch (providerId)` or `if (providerId === '…')` / `provider === '…'` branch.
const SWITCH_RE = /switch\s*\(\s*provider(Id)?\s*\)/;
const EQUALITY_RE = /provider(Id)?\s*===\s*['"]/;

/** Strip block + line comments so a doc-comment mention of the pattern never trips the guard. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

describe('no switch(providerId) in the provider-aware UI (SPEC-PV-029)', () => {
	for (const rel of GUARDED_FILES) {
		it(`${rel} has no switch(providerId) / provider-id equality branch (TEST-PV-013)`, () => {
			const source = stripComments(readFileSync(resolve(srcUi, rel), 'utf8'));
			expect(SWITCH_RE.test(source), `switch(providerId) found in ${rel}`).toBe(false);
			expect(EQUALITY_RE.test(source), `provider-id equality branch found in ${rel}`).toBe(false);
		});
	}
});
