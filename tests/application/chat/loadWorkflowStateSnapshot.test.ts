/**
 * T-ASM-025 — Tests for loadWorkflowStateSnapshot().
 * Satisfies REQ-ASM-012 (TEST-ASM-019) and REQ-ASM-015 (TEST-ASM-022).
 *
 * Spec source: specs/agent-sidepanel-mvp/spec.md §6.2.
 *   loadWorkflowStateSnapshot(feature, vault, logger, specsFolder): Promise<WorkflowStateSnapshot | null>
 *   Reads <specsFolder>/<feature>/workflow-state.md via VaultPort.readFile,
 *   parses YAML frontmatter, returns { feature, stage, status }.
 *   On any read/parse failure, calls logger.warn(...) once and returns null.
 *   Never throws. No NotificationPort invocation on any branch.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { loadWorkflowStateSnapshot } from '@/application/chat/assembleSystemPrompt'
import { fakeModulePorts, type FakePorts } from '../../__fakes__/fake-ports'

const VALID_FRONTMATTER = [
  '---',
  'id: 01HXXXX',
  'slug: foo',
  'feature: "Foo feature"',
  'area: "FOO"',
  'status: accepted',
  'currentStep: 4',
  'current_stage: design',
  'last_updated: 2026-05-14',
  'last_agent: ""',
  'artifacts:',
  '  idea: complete',
  '  research: complete',
  '  requirements: complete',
  '  design: in-progress',
  'createdAt: 2026-05-01T00:00:00.000Z',
  'updatedAt: 2026-05-14T00:00:00.000Z',
  '---',
  '',
].join('\n')

describe('REQ-ASM-012, REQ-ASM-015: loadWorkflowStateSnapshot()', () => {
  let ports: FakePorts

  beforeEach(() => {
    ports = fakeModulePorts()
  })

  // TEST-ASM-019 — happy path
  it('returns { feature, stage, status } from valid workflow-state.md frontmatter', async () => {
    await ports.vault.writeFile('specs/foo/workflow-state.md', VALID_FRONTMATTER)

    const snapshot = await loadWorkflowStateSnapshot('foo', ports.vault, ports.logger, 'specs')

    expect(snapshot).toEqual({ feature: 'foo', stage: 'design', status: 'accepted' })
    expect(ports.logger.warn).not.toHaveBeenCalled()
  })

  it('honours a custom specsFolder when reading the workflow-state file', async () => {
    await ports.vault.writeFile('features/bar/workflow-state.md', VALID_FRONTMATTER.replace('slug: foo', 'slug: bar'))

    const snapshot = await loadWorkflowStateSnapshot('bar', ports.vault, ports.logger, 'features')

    expect(snapshot).not.toBeNull()
    expect(snapshot?.feature).toBe('bar')
    expect(snapshot?.stage).toBe('design')
    expect(snapshot?.status).toBe('accepted')
  })

  // Missing-file branch (REQ-ASM-015) — TEST-ASM-022 sibling
  it('returns null and warns exactly once when the workflow-state file does not exist', async () => {
    const snapshot = await loadWorkflowStateSnapshot('missing', ports.vault, ports.logger, 'specs')

    expect(snapshot).toBeNull()
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)
  })

  // TEST-ASM-022 — malformed YAML
  it('returns null and warns exactly once when frontmatter is malformed', async () => {
    await ports.vault.writeFile(
      'specs/foo/workflow-state.md',
      '---\nnot a yaml document at all\nmissing required keys\n---\n',
    )

    const snapshot = await loadWorkflowStateSnapshot('foo', ports.vault, ports.logger, 'specs')

    expect(snapshot).toBeNull()
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)
  })

  it('returns null and warns when the file has no frontmatter delimiters at all', async () => {
    await ports.vault.writeFile('specs/foo/workflow-state.md', '# just a heading, no yaml block\n')

    const snapshot = await loadWorkflowStateSnapshot('foo', ports.vault, ports.logger, 'specs')

    expect(snapshot).toBeNull()
    expect(ports.logger.warn).toHaveBeenCalledTimes(1)
  })

  it('never throws on any branch', async () => {
    await expect(
      loadWorkflowStateSnapshot('does-not-exist', ports.vault, ports.logger, 'specs'),
    ).resolves.toBeNull()
  })

  // REQ-ASM-015 — no notification on any failure branch
  it('does not invoke NotificationPort on the missing-file branch', async () => {
    await loadWorkflowStateSnapshot('missing', ports.vault, ports.logger, 'specs')
    // MockBridge records notices via showError/showWarning/showSuccess/showInfo;
    // the underlying bridge exposes the captured list.
    expect(ports.bridge.notices).toEqual([])
  })

  it('does not invoke NotificationPort on the malformed-frontmatter branch', async () => {
    await ports.vault.writeFile('specs/foo/workflow-state.md', '---\nbroken\n---\n')

    await loadWorkflowStateSnapshot('foo', ports.vault, ports.logger, 'specs')

    expect(ports.bridge.notices).toEqual([])
  })

  it('does not invoke NotificationPort on the happy path', async () => {
    await ports.vault.writeFile('specs/foo/workflow-state.md', VALID_FRONTMATTER)

    await loadWorkflowStateSnapshot('foo', ports.vault, ports.logger, 'specs')

    expect(ports.bridge.notices).toEqual([])
  })

  // Reads exclusively through VaultPort — no direct fs calls.
  // This is enforced structurally: the function only accepts a VaultPort,
  // and our fake VaultPort does not touch the real filesystem. We assert it
  // here as a behavioural smoke test that swapping the port swaps the source.
  it('reads through VaultPort only — does not bypass the port abstraction', async () => {
    await ports.vault.writeFile('specs/foo/workflow-state.md', VALID_FRONTMATTER)

    const snapshot = await loadWorkflowStateSnapshot('foo', ports.vault, ports.logger, 'specs')

    expect(snapshot).not.toBeNull()
    // If the function used a real fs, this in-memory file would not be visible.
    expect(snapshot?.feature).toBe('foo')
  })
})
