/**
 * T-OCM-012 — `MockObsidianCliPort`. Coverage-counted (src/infrastructure/mock/**).
 * Exercises every method + the not-configured branch.
 */
import { describe, it, expect } from 'vitest'
import { MockObsidianCliPort } from '@/infrastructure/mock/MockObsidianCliPort'
import { ObsidianCliError } from '@/domain/ports'

describe('MockObsidianCliPort', () => {
  it('records calls and returns benign defaults when unscripted', async () => {
    const cli = new MockObsidianCliPort()

    const run = await cli.run('daily', ['x=1'])
    const json = await cli.runJson('search', ['query=foo'])

    expect(run.ok).toBe(true)
    if (run.ok) expect(run.value).toEqual({ stdout: '', stderr: '', exitCode: 0 })
    expect(json.ok).toBe(true)
    if (json.ok) expect(json.value).toEqual({})

    expect(cli.calls).toEqual([
      { command: 'daily', args: ['x=1'], json: false },
      { command: 'search', args: ['query=foo'], json: true },
    ])
  })

  it('returns scripted JSON and raw responses', async () => {
    const cli = new MockObsidianCliPort()
    cli.setJson('search', { matches: ['a'] }).setRun('append', { stdout: 'ok', stderr: '', exitCode: 0 })

    const json = await cli.runJson('search')
    const run = await cli.run('append')

    expect(json.ok && json.value).toEqual({ matches: ['a'] })
    expect(run.ok && run.value).toEqual({ stdout: 'ok', stderr: '', exitCode: 0 })
  })

  it('returns scripted errors', async () => {
    const cli = new MockObsidianCliPort()
    cli
      .setJsonError('read', new ObsidianCliError('invalid-json', 'bad'))
      .setRunError('append', new ObsidianCliError('nonzero-exit', 'boom', { exitCode: 1 }))

    const json = await cli.runJson('read')
    const run = await cli.run('append')

    expect(json.ok).toBe(false)
    if (!json.ok) expect(json.error.code).toBe('invalid-json')
    expect(run.ok).toBe(false)
    if (!run.ok) expect(run.error.code).toBe('nonzero-exit')
  })

  it('returns not-configured for both methods when unavailable', async () => {
    const cli = new MockObsidianCliPort()
    cli.available = false

    const run = await cli.run('daily')
    const json = await cli.runJson('daily')

    expect(run.ok).toBe(false)
    if (!run.ok) expect(run.error.code).toBe('not-configured')
    expect(json.ok).toBe(false)
    if (!json.ok) expect(json.error.code).toBe('not-configured')
  })
})
