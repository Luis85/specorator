/**
 * T-MHP-007 — `ActiveFeatureResolver` scans specs/<slug>/workflow-state.md
 * frontmatter for `status: active`.
 *
 * Spec: SPEC-MHP-037.
 * Satisfies: REQ-MHP-041; covers EC-MHP-012, EC-MHP-013.
 *
 * Per SPEC-MHP-037 the resolver returns the `multiple` kind; the caller
 * (auto-accept algorithm) is responsible for emitting `LoggerPort.warn`.
 * The resolver tolerates missing `workflow-state.md` files (folders that
 * predate the workflow-state convention are simply ignored). Cache-less
 * in v1 — the implementation-log entry records the decision.
 */
import type { LoggerPort } from '@/domain/ports/LoggerPort'
import type { VaultPort } from '@/domain/ports/VaultPort'
import { tryAsync } from '@/domain/shared/tryAsync'

const WORKFLOW_STATE_FILE = 'workflow-state.md'

export type ActiveFeatureResolution =
  | { kind: 'zero' }
  | { kind: 'one'; slug: string }
  | { kind: 'multiple'; slugs: string[] }

export interface ActiveFeatureResolverDeps {
  readonly vault: VaultPort
  readonly specsFolder: string
  readonly logger: LoggerPort
}

function stripSurroundingQuotes(value: string): string {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' || first === "'") && first === last) return value.slice(1, -1)
  return value
}

function extractStatusLineValue(line: string): string | undefined {
  if (line === '' || line.startsWith('#')) return undefined
  const colon = line.indexOf(':')
  if (colon === -1) return undefined
  if (line.slice(0, colon).trim() !== 'status') return undefined
  return stripSurroundingQuotes(line.slice(colon + 1).trim())
}

/**
 * Frontmatter probe: looks for a `status: <value>` line inside the leading
 * `---` … `---` YAML block. Avoids dragging in a YAML parser for a
 * single-field read; the matcher tolerates surrounding quotes and trailing
 * whitespace.
 */
function frontmatterStatus(source: string): string | undefined {
  if (!source.startsWith('---')) return undefined
  const end = source.indexOf('\n---', 3)
  if (end === -1) return undefined
  for (const rawLine of source.slice(3, end).split('\n')) {
    const value = extractStatusLineValue(rawLine.trim())
    if (value !== undefined) return value
  }
  return undefined
}

export class ActiveFeatureResolver {
  readonly #vault: VaultPort
  readonly #specsFolder: string
  readonly #logger: LoggerPort

  constructor(deps: ActiveFeatureResolverDeps) {
    this.#vault = deps.vault
    this.#specsFolder = deps.specsFolder
    this.#logger = deps.logger
  }

  async resolve(): Promise<ActiveFeatureResolution> {
    const slugsResult = await tryAsync(() => this.#vault.listFolders(this.#specsFolder))
    if (!slugsResult.ok) {
      this.#logger.debug('ActiveFeatureResolver: specs folder not listable', {
        specsFolder: this.#specsFolder,
        error: slugsResult.error.message,
      })
      return { kind: 'zero' }
    }

    const active: string[] = []
    for (const slug of slugsResult.value) {
      const path = `${this.#specsFolder}/${slug}/${WORKFLOW_STATE_FILE}`
      const read = await tryAsync(() => this.#vault.readFile(path))
      if (!read.ok) continue
      if (frontmatterStatus(read.value) === 'active') active.push(slug)
    }

    if (active.length === 0) return { kind: 'zero' }
    if (active.length === 1) return { kind: 'one', slug: active[0] }
    return { kind: 'multiple', slugs: active }
  }
}
