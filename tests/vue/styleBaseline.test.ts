import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Anchored to this file, not cwd; under jsdom import.meta.url is not a
// file: URL, so the fileURLToPath idiom is unavailable in this lane.
const ROOT = resolve(__dirname, '../..');
const VUE_STYLE_DIR = join(ROOT, 'src', 'style', 'vue');
const LIBRARY_DIR = join(ROOT, 'src', 'features', 'library');

/** Recursively collect files below dir with one of the given extensions. */
function collect(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collect(abs, exts, acc);
    else if (exts.some((e) => entry.name.endsWith(e))) acc.push(abs);
  }
  return acc;
}

/** Extract the CSS of every <style> block in an SFC. */
function sfcStyleBlocks(vuePath: string): string[] {
  const source = readFileSync(vuePath, 'utf8');
  return [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
}

/** Strip CSS comments so a mention in prose can't trip the guard. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('Vue style baseline: token guard', () => {
  it('tokens.css defines only --sp-* properties, each mapped from exactly one Obsidian var', () => {
    const css = stripComments(readFileSync(join(VUE_STYLE_DIR, 'tokens.css'), 'utf8'));
    const declarations = [...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)];
    expect(declarations.length).toBeGreaterThan(0);
    for (const [, prop, value] of declarations) {
      expect(prop, `custom property ${prop}`).toMatch(/^--sp-[\w-]+$/);
      // Exactly `var(--<obsidian-var>)` — no raw colors, sizes, or fallbacks.
      expect(value.trim(), `${prop} value`).toMatch(/^var\(--(?!sp-)[\w-]+\)$/);
    }
    // Exclusivity: token mappings are ALL tokens.css may contain. Raw CSS
    // (e.g. `background: #fff`) surfaces as a non---sp- property ident; a
    // var() anywhere outside a matched declaration as a count mismatch.
    const propIdents = [...css.matchAll(/[{;]\s*([\w-]+)\s*:/g)].map((m) => m[1]);
    expect(propIdents.filter((p) => !p.startsWith('--sp-'))).toEqual([]);
    expect((css.match(/var\(/g) ?? []).length).toBe(declarations.length);
  });

  it('every non-token, non-host Vue stylesheet and SFC style block references only --sp-* vars', () => {
    // Host sheets are carved out (spec Tier 1): they style workspace chrome
    // OUTSIDE `.specorator-vue`, where `--sp-*` may not resolve.
    const sheets = collect(VUE_STYLE_DIR, ['.css'])
      .filter((p) => basename(p) !== 'tokens.css' && !basename(p).endsWith('-host.css'))
      .map((p) => ({ id: p, css: readFileSync(p, 'utf8') }));
    expect(sheets.length).toBeGreaterThan(0);
    const vueFiles = collect(LIBRARY_DIR, ['.vue']);
    // External style blocks would escape sfcStyleBlocks' sweep entirely.
    for (const p of vueFiles) {
      expect(
        readFileSync(p, 'utf8').match(/<style[^>]*\bsrc=/),
        `${p} must not use an external <style src>`,
      ).toBeNull();
    }
    const blocks = vueFiles.flatMap((p) =>
      sfcStyleBlocks(p).map((css, i) => ({ id: `${p}#style[${i}]`, css })),
    );
    for (const { id, css } of [...sheets, ...blocks]) {
      const refs = [...stripComments(css).matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
      const offenders = refs.filter((r) => !r.startsWith('--sp-'));
      expect(offenders, `${id} must consume only --sp-* tokens`).toEqual([]);
    }
  });
});
