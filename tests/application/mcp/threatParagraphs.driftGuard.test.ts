/**
 * T-MHP-088 — Threat-paragraph drift-guard (RISK-MHP-015, TEST-MHP-055).
 *
 * Asserts every value in `THREAT_PARAGRAPHS_MHP` is byte-equal to the
 * corresponding paragraph block in `docs/adr/ADR-019-mcp-tier-policy-and-
 * devtools-opt-in.md` §"Part 4 — Threat paragraphs (verbatim user-facing
 * copy)". When ADR-019 Part 4 is edited, this test fails until the runtime
 * constant in `src/application/mcp/threatParagraphs.ts` is updated in the
 * same PR (and vice versa).
 *
 * Normalisation: ADR-019 uses Markdown-bold (`**Heading.**`), curly typographic
 * apostrophes, and explicit line wraps; the runtime constant uses straight
 * apostrophes, no Markdown emphasis, and `\n\n` paragraph breaks. The
 * `normalise` helper strips Markdown bold markers, collapses each paragraph's
 * intra-line whitespace, normalises curly apostrophes to straight, and joins
 * paragraphs with `\n\n` so the comparison is content-only.
 *
 * Satisfies: RISK-MHP-015, REQ-MHP-016, TEST-MHP-055.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  THREAT_PARAGRAPHS_MHP,
  type DevToolsToolId,
} from '@/application/mcp/threatParagraphs'

const ADR_PATH = resolve(
  __dirname,
  '../../../docs/adr/ADR-019-mcp-tier-policy-and-devtools-opt-in.md',
)

const TOOL_IDS: ReadonlyArray<DevToolsToolId> = [
  'dev:screenshot',
  'dev:errors',
  'dev:console',
  'dev:dom',
  'dev:cdp',
  'dev:debug',
  'dev:mobile',
  'devtools',
]

/**
 * Normalise whitespace + Markdown emphasis + typographic apostrophes + inline
 * backtick code spans so the ADR's Markdown rendering matches the runtime
 * constant's plain-text form. The check is intentionally content-only — any
 * change to substantive copy still trips the assertion; only the
 * non-substantive Markdown decoration is filtered.
 */
function normalise(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .split(/\n\s*\n/)
    .map((para) =>
      para
        // Strip bold/italic emphasis markers but preserve inner text.
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Strip inline code-span backticks (e.g. `dev:cdp` → dev:cdp).
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((p) => p.length > 0)
    .join('\n\n')
}

/**
 * Extract the four-paragraph block for a given tool id from ADR-019 Part 4.
 *
 * Each tool section begins with a Markdown heading `#### \`<id>\` (...-risk)`
 * and ends at the next `####` or `##` heading. The four labelled paragraphs
 * (`What it can access`, `Abuse vector`, `Mitigation provided by this
 * feature`, `What remains the user's responsibility`) are concatenated; for
 * `dev:cdp` we also retain the trailing fifth paragraph that names the
 * always-prompts invariant — the runtime constant carries the same trailing
 * sentence per REQ-MHP-020 / Part B §S07.
 */
function extractAdrBlock(adr: string, toolId: DevToolsToolId): string {
  const heading = `#### \`${toolId}\``
  const start = adr.indexOf(heading)
  if (start === -1) throw new Error(`ADR-019: missing section for ${toolId}`)
  const after = adr.slice(start + heading.length)
  const nextHeading = after.search(/\n#### |\n## /)
  const block = nextHeading === -1 ? after : after.slice(0, nextHeading)
  // Drop the parenthesised `(low-risk)` / `(high-risk)` qualifier line at the
  // top of the section; keep everything from the first paragraph onward.
  const firstParaIdx = block.indexOf('\n\n')
  return firstParaIdx === -1 ? block : block.slice(firstParaIdx + 2)
}

describe('threatParagraphs — ADR-019 §4 drift-guard (RISK-MHP-015, TEST-MHP-055)', () => {
  const adr = readFileSync(ADR_PATH, 'utf8')

  /**
   * `dev:cdp` carries one extra paragraph in the runtime constant — the
   * always-prompts sentence mandated by REQ-MHP-020 / Part B §S07. ADR-019
   * §4 does not include that sentence (Part B is the canonical source for
   * the per-tool consent-modal trailing copy). The drift-guard accepts the
   * sentence as the only permitted superset; everything else must match
   * byte-for-byte after normalisation.
   */
  const CDP_TRAILING =
    'Even with this toggle on, every dev:cdp invocation always prompts for approval.'

  it.each(TOOL_IDS)(
    'THREAT_PARAGRAPHS_MHP["%s"] matches ADR-019 Part 4 (normalised)',
    (toolId) => {
      let fromConstant = normalise(THREAT_PARAGRAPHS_MHP[toolId])
      const fromAdr = normalise(extractAdrBlock(adr, toolId))
      if (toolId === 'dev:cdp') {
        const suffix = `\n\n${CDP_TRAILING}`
        expect(fromConstant.endsWith(suffix)).toBe(true)
        fromConstant = fromConstant.slice(0, -suffix.length)
      }
      expect(fromConstant).toBe(fromAdr)
    },
  )

  it('every DevToolsToolId has a threat paragraph constant', () => {
    for (const id of TOOL_IDS) {
      expect(typeof THREAT_PARAGRAPHS_MHP[id]).toBe('string')
      expect(THREAT_PARAGRAPHS_MHP[id].length).toBeGreaterThan(0)
    }
  })

  it('dev:cdp constant includes the verbatim "always prompts" sentence (REQ-MHP-020)', () => {
    expect(THREAT_PARAGRAPHS_MHP['dev:cdp']).toContain(
      'every dev:cdp invocation always prompts for approval',
    )
  })
})
