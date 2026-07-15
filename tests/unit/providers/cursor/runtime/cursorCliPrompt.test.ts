import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  CURSOR_CLI_INLINE_PROMPT_MAX_CHARS,
  resolveCursorCliPromptArg,
} from '@/providers/cursor/runtime/cursorCliPrompt';

describe('resolveCursorCliPromptArg', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it('returns short prompts inline', () => {
    const prompt = 'hello';
    expect(resolveCursorCliPromptArg(prompt)).toEqual({ arg: prompt });
  });

  it('spills long prompts to a temp file referenced with @path', () => {
    const prompt = 'x'.repeat(CURSOR_CLI_INLINE_PROMPT_MAX_CHARS + 1);
    const resolved = resolveCursorCliPromptArg(prompt);
    if (resolved.cleanup) {
      cleanups.push(resolved.cleanup);
    }

    expect(resolved.arg.startsWith('@')).toBe(true);
    const filePath = resolved.arg.slice(1);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(prompt);
  });

  it('cleans up the temp directory', () => {
    const prompt = 'y'.repeat(CURSOR_CLI_INLINE_PROMPT_MAX_CHARS + 1);
    const resolved = resolveCursorCliPromptArg(prompt);
    const filePath = resolved.arg.slice(1);
    const dir = path.dirname(filePath);

    expect(resolved.cleanup).toBeDefined();
    resolved.cleanup?.();
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('uses the OS temp directory', () => {
    const prompt = 'z'.repeat(CURSOR_CLI_INLINE_PROMPT_MAX_CHARS + 1);
    const resolved = resolveCursorCliPromptArg(prompt);
    if (resolved.cleanup) {
      cleanups.push(resolved.cleanup);
    }

    const filePath = resolved.arg.slice(1);
    expect(filePath.startsWith(os.tmpdir())).toBe(true);
  });
});
