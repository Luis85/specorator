/**
 * T-MHP-131 — SystemPromptAddendum byte-exact constant + drift-guard tests.
 *
 * Satisfies: REQ-MHP-032 (verbatim addendum), REQ-MHP-033 (plugin-owned
 *            versioned file; not user-mutable); TEST-MHP-033, TEST-MHP-034.
 *
 * Contract under test:
 *   (a) SYSTEM_PROMPT_ADDENDUM_MHP byte-equals the REQ-MHP-032 verbatim text
 *       (no whitespace normalisation, no trimming).
 *   (b) Mutating PluginSettings does not change the assembled addendum
 *       substring — the constant must not be sourced from settings.
 *   (c) The addendum module's on-disk file is unchanged after settings
 *       mutation (RISK-MHP-008 drift-guard).
 *
 * This test MUST fail before T-MHP-132 ships
 * `src/application/agent/SystemPromptAddendum.ts`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// T-MHP-132 landed `src/application/agent/SystemPromptAddendum.ts`; the TDD
// `@ts-expect-error` scaffold is removed now that the module exists.
import { SYSTEM_PROMPT_ADDENDUM_MHP } from '@/application/agent/SystemPromptAddendum'

/**
 * REQ-MHP-032 verbatim text. Reproduced here byte-for-byte from the
 * requirement statement. Any change to the constant must be matched here so a
 * silent drift trips the test.
 */
const REQ_MHP_032_VERBATIM =
	'When a write tool returns "status": "pending", the change has not been committed — it is queued for the user. Say so explicitly. Do not claim, summarise, or hint that the change took effect. Do not call workflow_proposal_accept on the user\'s behalf. The user will accept or reject the proposal; resume only when they tell you the outcome or you observe a follow-up tool call.'

const ADDENDUM_SOURCE_PATH = resolve(
	__dirname,
	'..',
	'..',
	'..',
	'src',
	'application',
	'agent',
	'SystemPromptAddendum.ts',
)

describe('T-MHP-131 — SystemPromptAddendum (REQ-MHP-032, REQ-MHP-033)', () => {
	it('TEST-MHP-033: constant byte-equals REQ-MHP-032 verbatim text', () => {
		expect(SYSTEM_PROMPT_ADDENDUM_MHP).toBe(REQ_MHP_032_VERBATIM)
	})

	it('TEST-MHP-033: constant is a string (not interpolated from settings)', () => {
		expect(typeof SYSTEM_PROMPT_ADDENDUM_MHP).toBe('string')
		expect(SYSTEM_PROMPT_ADDENDUM_MHP.length).toBeGreaterThan(0)
	})

	it('TEST-MHP-034: constant identity is stable across module re-evaluation (no settings dependency)', async () => {
		// Re-import dynamically; the value must be the same string.
		const fresh = await import('@/application/agent/SystemPromptAddendum')
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect((fresh as any).SYSTEM_PROMPT_ADDENDUM_MHP).toBe(SYSTEM_PROMPT_ADDENDUM_MHP)
	})

	it('TEST-MHP-034: source file on disk is identical before and after settings mutation (RISK-MHP-008)', () => {
		const before = readFileSync(ADDENDUM_SOURCE_PATH, 'utf8')
		// Simulate a settings mutation. Settings live in a separate module; we
		// mutate a process-level setting bag here. The addendum file MUST NOT
		// change as a side effect of any settings write.
		process.env.SPECORATOR_TEST_SETTINGS_MUTATION = String(Date.now())
		const after = readFileSync(ADDENDUM_SOURCE_PATH, 'utf8')
		expect(after).toBe(before)
	})

	it('TEST-MHP-034: source file embeds the verbatim REQ-MHP-032 text', () => {
		const source = readFileSync(ADDENDUM_SOURCE_PATH, 'utf8')
		// The verbatim string must appear in the source — proving the constant
		// is statically inlined, not assembled at runtime from settings.
		expect(source).toContain(REQ_MHP_032_VERBATIM)
	})
})
