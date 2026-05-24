/**
 * T-MHP-006 — `ActiveFeatureResolver` zero/one/multiple test.
 *
 * Satisfies: REQ-MHP-041; TEST-MHP-043; EC-MHP-012, EC-MHP-013.
 * Spec: SPEC-MHP-037.
 *
 * Resolver returns one of:
 *   { kind: 'zero' } | { kind: 'one', slug } | { kind: 'multiple', slugs }
 * It scans `${specsFolder}/*` for `workflow-state.md` files whose YAML
 * frontmatter `status: active`.
 *
 * Per SPEC-MHP-037: the resolver returns the `multiple` kind; the caller
 * is responsible for emitting `LoggerPort.warn`. The resolver itself does
 * not warn. We assert both invariants here.
 *
 * TDD: this test MUST fail before
 * `src/infrastructure/feature/ActiveFeatureResolver.ts` lands.
 */
import { describe, it, expect } from 'vitest'
import { ActiveFeatureResolver } from '@/infrastructure/feature/ActiveFeatureResolver'
import { fakeModulePorts } from '../../__fakes__/fake-ports'

function workflowStateMd(status: 'active' | 'draft' | 'complete'): string {
  return [
    '---',
    'feature: x',
    `status: ${status}`,
    '---',
    '',
    '# Workflow state',
    '',
  ].join('\n')
}

describe('ActiveFeatureResolver (SPEC-MHP-037 / REQ-MHP-041)', () => {
  it('returns { kind: "zero" } when no specs/<slug>/workflow-state.md has status: active', async () => {
    const ports = fakeModulePorts()
    await ports.vault.createFolder('specs/alpha')
    await ports.vault.writeFile(
      'specs/alpha/workflow-state.md',
      workflowStateMd('draft'),
    )
    await ports.vault.createFolder('specs/beta')
    await ports.vault.writeFile(
      'specs/beta/workflow-state.md',
      workflowStateMd('complete'),
    )

    const resolver = new ActiveFeatureResolver({
      vault: ports.vault,
      specsFolder: 'specs',
      logger: ports.logger,
    })

    const result = await resolver.resolve()
    expect(result).toEqual({ kind: 'zero' })

    // Per SPEC-MHP-037 EC-MHP-012: no warn on zero matches
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('returns { kind: "one", slug } when exactly one workflow-state has status: active', async () => {
    const ports = fakeModulePorts()
    await ports.vault.createFolder('specs/alpha')
    await ports.vault.writeFile(
      'specs/alpha/workflow-state.md',
      workflowStateMd('draft'),
    )
    await ports.vault.createFolder('specs/beta')
    await ports.vault.writeFile(
      'specs/beta/workflow-state.md',
      workflowStateMd('active'),
    )

    const resolver = new ActiveFeatureResolver({
      vault: ports.vault,
      specsFolder: 'specs',
      logger: ports.logger,
    })

    const result = await resolver.resolve()
    expect(result).toEqual({ kind: 'one', slug: 'beta' })
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('TEST-MHP-043 / EC-MHP-013: returns { kind: "multiple", slugs } when ≥ 2 workflow-states have status: active', async () => {
    const ports = fakeModulePorts()
    await ports.vault.createFolder('specs/alpha')
    await ports.vault.writeFile(
      'specs/alpha/workflow-state.md',
      workflowStateMd('active'),
    )
    await ports.vault.createFolder('specs/beta')
    await ports.vault.writeFile(
      'specs/beta/workflow-state.md',
      workflowStateMd('active'),
    )
    await ports.vault.createFolder('specs/gamma')
    await ports.vault.writeFile(
      'specs/gamma/workflow-state.md',
      workflowStateMd('draft'),
    )

    const resolver = new ActiveFeatureResolver({
      vault: ports.vault,
      specsFolder: 'specs',
      logger: ports.logger,
    })

    const result = await resolver.resolve()
    expect(result.kind).toBe('multiple')
    if (result.kind !== 'multiple') return
    expect(result.slugs.sort()).toEqual(['alpha', 'beta'])

    // SPEC-MHP-037: the resolver itself does not emit warn — that is the
    // caller's (auto-accept algorithm) responsibility per REQ-MHP-041.
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('returns { kind: "zero" } when the specs folder is empty', async () => {
    const ports = fakeModulePorts()
    await ports.vault.createFolder('specs')

    const resolver = new ActiveFeatureResolver({
      vault: ports.vault,
      specsFolder: 'specs',
      logger: ports.logger,
    })

    const result = await resolver.resolve()
    expect(result).toEqual({ kind: 'zero' })
  })

  it('tolerates spec folders missing workflow-state.md without throwing', async () => {
    const ports = fakeModulePorts()
    await ports.vault.createFolder('specs/alpha') // no workflow-state.md
    await ports.vault.createFolder('specs/beta')
    await ports.vault.writeFile(
      'specs/beta/workflow-state.md',
      workflowStateMd('active'),
    )

    const resolver = new ActiveFeatureResolver({
      vault: ports.vault,
      specsFolder: 'specs',
      logger: ports.logger,
    })

    const result = await resolver.resolve()
    expect(result).toEqual({ kind: 'one', slug: 'beta' })
  })
})
