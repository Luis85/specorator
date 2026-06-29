import { extractStringArray, parseFrontmatter,setFrontmatterList } from '@/utils/frontmatter';

function tagsOf(content: string): string[] | undefined {
  const parsed = parseFrontmatter(content);
  return parsed ? extractStringArray(parsed.frontmatter, 'tags') : undefined;
}

describe('setFrontmatterList', () => {
  it('inserts a new key when absent', () => {
    const src = `---\ndescription: hi\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['a', 'b']);
    expect(tagsOf(out)).toEqual(['a', 'b']);
    expect(out).toContain('Body');
  });

  it('replaces an existing flow-list key', () => {
    const src = `---\ntags: [old]\ndescription: hi\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['new']);
    expect(tagsOf(out)).toEqual(['new']);
    expect(out).toContain('description: hi');
  });

  it('replaces an existing block-list key', () => {
    const src = `---\ntags:\n  - old1\n  - old2\nname: x\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['new']);
    expect(tagsOf(out)).toEqual(['new']);
    expect(out).toContain('name: x');
  });

  it('removes the key when values is empty', () => {
    const src = `---\ntags: [a]\nname: x\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', []);
    expect(tagsOf(out)).toBeUndefined();
    expect(out).toContain('name: x');
  });

  it('prepends a new frontmatter block when none exists and values are present', () => {
    const src = `No frontmatter here`;
    const out = setFrontmatterList(src, 'tags', ['a', 'b']);
    expect(tagsOf(out)).toEqual(['a', 'b']);
    expect(out).toContain('No frontmatter here');
    expect(out.startsWith('---\n')).toBe(true);
  });

  it('returns content unchanged when there is no frontmatter and no values', () => {
    const src = `No frontmatter here`;
    expect(setFrontmatterList(src, 'tags', [])).toBe(src);
  });

  it('block-list key followed by another key: replaces only the list, keeps the next key', () => {
    const src = `---\ntags:\n  - old1\n  - old2\nname: keep\n---\nBody`;
    const out = setFrontmatterList(src, 'tags', ['new']);
    expect(tagsOf(out)).toEqual(['new']);
    expect(out).toContain('name: keep');
  });
});
