/**
 * T-MHP-001 — Baseline metrics for NFR-MHP-001/-002/-003.
 *
 * Captured BEFORE any new code lands for feature `mcp-host-side-proposals`.
 * The numbers feed the relative budgets in specs/mcp-host-side-proposals/requirements.md
 * (NFR-MHP-001, NFR-MHP-002, NFR-MHP-003 — see also CLAR-MHP-018).
 *
 * Run:
 *   npx vitest bench tests/__bench__/mhp-baseline.bench.ts --run
 *
 * Not part of `npm run test`. Separate by design (benches are non-deterministic and
 * slower than unit tests).
 */

import { bench, describe } from 'vitest'
import { spawn } from 'node:child_process'
import { ProposalStore } from '@/infrastructure/obsidian/ProposalStore'

// --- helpers -----------------------------------------------------------------

/**
 * Build a ProposalStore pre-populated with `n` pending entries.
 * The mutate callback is a no-op (Promise.resolve()) — it is never invoked during
 * `getAll()`, so callback cost does not pollute B1.
 */
function makeStoreWithPending(n: number): ProposalStore {
  const store = new ProposalStore()
  for (let i = 0; i < n; i++) {
    store.queue(`tool_${i % 8}`, { path: `notes/file-${i}.md`, content: `payload ${i}` }, () =>
      Promise.resolve(),
    )
  }
  return store
}

/**
 * The 8 existing write-tool callback shapes (taken verbatim from the call sites
 * in `src/infrastructure/obsidian/mcp/register*Tools.ts`). The mutate function
 * is a no-op so we measure ONLY the `ProposalStore.queue` overhead (entry
 * construction + Map.set + UUID generation). Production callbacks call into the
 * vault — that is measured downstream by the integration suite, not here.
 *
 * LoggerPort is intentionally not wired: the queue path itself never touches
 * the logger; only the mutate function would, and we mock it as no-op.
 */
const WRITE_TOOL_SHAPES: ReadonlyArray<{ name: string; params: unknown }> = [
  { name: 'vault_write_note', params: { path: 'notes/a.md', content: 'hello' } },
  { name: 'vault_append_to_note', params: { path: 'notes/a.md', content: 'tail' } },
  { name: 'frontmatter_set_field', params: { path: 'notes/a.md', field: 'tag', value: 'x' } },
  {
    name: 'frontmatter_set_many',
    params: { path: 'notes/a.md', fields: { a: 1, b: 2, c: 3 } },
  },
  { name: 'bases_update_record', params: { path: 'bases/a.base', fields: { col: 'v' } } },
  {
    name: 'canvas_add_text_node',
    params: { path: 'canvas/a.canvas', node: { x: 0, y: 0, w: 100, h: 100, text: 't' } },
  },
  {
    name: 'links_add_to_note',
    params: { path: 'notes/a.md', target: 'notes/b.md', displayText: 'B' },
  },
  { name: 'workflow_create_artifact', params: { slug: 'demo', stage: 'idea' } },
]

const NO_OP_MUTATE = (): Promise<void> => Promise.resolve()

// --- B1: ProposalStore.getAll() with 100 pending entries ---------------------

describe('B1 — ProposalStore.getAll() p95 / NFR-MHP-001 baseline', () => {
  // Pre-populate once. Vitest's `bench` iterates many times; rebuilding the
  // store every iteration would measure construction, not getAll().
  const store = makeStoreWithPending(100)

  bench(
    'ProposalStore.getAll() with 100 pending entries',
    () => {
      // Consume the result so the engine can't dead-code-eliminate it.
      const list = store.getAll()
      if (list.length !== 100) throw new Error(`unexpected length: ${list.length}`)
    },
    { iterations: 1000 },
  )
})

// --- B2: ProposalStore.queue() across 8 write-tool callback shapes -----------

describe('B2 — ProposalStore.queue() p95 / NFR-MHP-002 baseline (pre-AuditLogWriter)', () => {
  // Each iteration cycles through one of the 8 shapes; vitest reports a single
  // p95 across all 1000 calls, which is the per-iteration average across shapes.
  let store = new ProposalStore()
  let i = 0

  bench(
    'ProposalStore.queue() averaged across 8 write-tool shapes',
    () => {
      const shape = WRITE_TOOL_SHAPES[i % WRITE_TOOL_SHAPES.length]
      store.queue(shape.name, shape.params, NO_OP_MUTATE)
      i++
      // Periodically reset to avoid an unbounded Map skewing later iterations.
      if (i % 256 === 0) store = new ProposalStore()
    },
    { iterations: 1000 },
  )
})

// --- B3: obsidian-cli bare subprocess spawn latency (SKIPPED on CI/dev) ------

const OBSIDIAN_CLI = process.env.OBSIDIAN_CLI_PATH ?? 'obsidian-cli'
const OBSIDIAN_CLI_AVAILABLE = (() => {
  // Cheap availability probe: try to spawn `obsidian-cli --version` synchronously.
  // We do NOT want the bench to fail on machines without the binary.
  try {
    // `bench.skipIf` is evaluated at registration time; we cannot truly block on
    // an async probe here. Default to false unless OBSIDIAN_CLI_PATH is explicitly
    // set — that env var is the documented opt-in. Best-effort spawn probe below
    // just exercises the binary so a misconfigured PATH surfaces early.
    const probe = spawn(OBSIDIAN_CLI, ['--version'], { stdio: 'ignore' })
    probe.on('error', () => {
      /* swallow — handled by env-var gate below */
    })
    return process.env.OBSIDIAN_CLI_PATH !== undefined
  } catch {
    return false
  }
})()

describe('B3 — obsidian-cli bare subprocess spawn p95 / NFR-MHP-003 baseline', () => {
  if (!OBSIDIAN_CLI_AVAILABLE) {
    // The bench harness intentionally surfaces this skip message on stdout so
    // the user knows how to opt into the B3 measurement on their TestVault.
    // eslint-disable-next-line obsidianmd/rule-custom-message
    console.log(
      [
        '[B3 SKIPPED] obsidian-cli binary not found.',
        '            Set OBSIDIAN_CLI_PATH=<absolute path to obsidian-cli> to enable.',
        '            Deferred to runtime measurement in TestVault — the user runs this',
        '            manually via `npx vitest bench tests/__bench__/mhp-baseline.bench.ts --run`',
        '            with OBSIDIAN_CLI_PATH set against a real install.',
      ].join('\n'),
    )
    bench.skip('obsidian-cli spawn latency (skipped: binary unavailable)', () => {
      // no-op placeholder so the registration is visible in bench output
    })
    return
  }

  bench(
    'obsidian-cli --version spawn → stdout-closed',
    async () => {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(OBSIDIAN_CLI, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
        child.stdout.on('data', () => {
          /* drain */
        })
        child.stderr.on('data', () => {
          /* drain */
        })
        child.on('error', reject)
        child.on('close', () => {
          resolve()
        })
      })
    },
    { iterations: 100 },
  )
})
