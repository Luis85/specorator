/**
 * T-ASM-080 — Static grep audit: forbidden credential surfaces never appear
 * in `src/**`.
 *
 * Covers TEST-ASM-052 (NFR-ASM-004). Walks every source file under `src/`
 * and asserts:
 *   1. The literal `'.credentials.json'` never appears anywhere — there is
 *      no reason for production code to mention Claude Code's credential
 *      file by name.
 *   2. The substring `~/.claude/` appears only inside argv-string
 *      assembly (the `buildSubprocessArgs` builder must invoke `claude -p`
 *      with the user's home tilde-prefix on macOS / Linux; matches are
 *      explicitly allow-listed below) or in a comment quoting the rule
 *      itself.
 *
 * The ESLint rule `local/no-claude-home-reads` (T-ASM-078) catches
 * structurally significant occurrences (string literals, concatenations,
 * `path.join(os.homedir(), '.claude')`). This grep test is the catch-all
 * for substrings the AST rule can't reach (comments, multi-line strings,
 * regex bodies) so a regression cannot slip through.
 */
import { describe, it, expect } from 'vitest'
import { promises as fs } from 'node:fs'
import { resolve, relative } from 'node:path'

// Vitest runs with cwd === project root, so anchor on that rather than
// `import.meta.url` (which is non-file scheme in the unit project).
const SRC_ROOT = resolve(process.cwd(), 'src')

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

async function readAllSourceFiles(): Promise<{ path: string; body: string }[]> {
  const files = await walk(SRC_ROOT)
  // Only inspect text source files — skip binaries/assets if any were ever
  // added under `src/`.
  const textExtensions = /\.(ts|js|vue|mjs|cjs|json|md|css)$/u
  const filtered = files.filter((f) => textExtensions.test(f))
  return Promise.all(
    filtered.map(async (path) => ({ path, body: await fs.readFile(path, 'utf8') })),
  )
}

describe('TEST-ASM-052 — static grep audit for credential surfaces (T-ASM-080)', () => {
  it('only documented self-citations are allowed to contain ".credentials.json"', async () => {
    const sources = await readAllSourceFiles()
    // Same audit-by-citation pattern as the `~/.claude/` test below — files
    // here must contain an NFR-ASM-004 or SPEC-ASM-001 §13.2 comment that
    // documents the file does NOT read the credentials file.
    const allowList = new Set<string>([
      'infrastructure/obsidian/ClaudeSubprocessAdapter.ts',
    ])
    const offending: string[] = []
    for (const { path, body } of sources) {
      if (!body.includes('.credentials.json')) continue
      const rel = relative(SRC_ROOT, path).replace(/\\/g, '/')
      if (allowList.has(rel)) continue
      offending.push(rel)
    }
    expect(
      offending,
      'No production source file may reference Claude Code\'s credential ' +
        'file by name unless it is on the allow-list with an NFR-ASM-004 ' +
        'self-citation.',
    ).toEqual([])
  })

  it('only documented self-citations are allowed to mention "~/.claude/"', async () => {
    const sources = await readAllSourceFiles()
    const offending: string[] = []
    // Allow-listed paths: production files whose comments cite NFR-ASM-004
    // verbatim to document that the file does NOT read from ~/.claude/.
    // The grep cannot distinguish code from comments cheaply, so the
    // allow-list takes the file path and we audit-by-citation: any addition
    // here requires a comment in that file that explicitly references
    // NFR-ASM-004 or SPEC-ASM-001 §13.2.
    const allowList = new Set<string>([
      'infrastructure/obsidian/ClaudeBinaryResolver.ts',
      'infrastructure/obsidian/ClaudeSubprocessAdapter.ts',
      'application/chat/SessionLogWriter.ts',
    ])
    for (const { path, body } of sources) {
      if (!body.includes('~/.claude/')) continue
      const rel = relative(SRC_ROOT, path).replace(/\\/g, '/')
      if (allowList.has(rel)) continue
      offending.push(rel)
    }
    expect(
      offending,
      'No production source file may mention the literal "~/.claude/" ' +
        'unless it is on the allow-list with an NFR-ASM-004 self-citation. ' +
        'Adding a file here requires a comment in that file that explicitly ' +
        'references NFR-ASM-004 or SPEC-ASM-001 §13.2.',
    ).toEqual([])
  })

  it('zero source files set CLAUDE_CODE_OAUTH_TOKEN in spawn env', async () => {
    const sources = await readAllSourceFiles()
    // Either the literal string or an environment-bag property with that
    // key (`env: { CLAUDE_CODE_OAUTH_TOKEN: ... }`) is forbidden. The
    // subscription transport relies on the user's `claude` CLI carrying its
    // OAuth state itself; the plugin must not tunnel it through env.
    const offending = sources.filter((s) =>
      s.body.includes('CLAUDE_CODE_OAUTH_TOKEN'),
    )
    expect(offending.map((s) => relative(SRC_ROOT, s.path))).toEqual([])
  })
})
