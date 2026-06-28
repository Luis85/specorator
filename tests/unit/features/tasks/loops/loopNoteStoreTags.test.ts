import { LoopNoteStore } from '@/features/tasks/loops/LoopNoteStore';

const store = new LoopNoteStore();

describe('LoopNoteStore tags', () => {
  it('round-trips tags through build → parse', () => {
    const md = store.build({
      name: 'TDD', useWhen: 'w', approach: 'a', steps: 's', verify: 'v', notes: 'n', tags: ['testing', 'quality'],
    });
    expect(md).toContain('tags: ["testing", "quality"]');
    const parsed = store.parse('loops/tdd.md', md);
    expect(parsed.tags).toEqual(['testing', 'quality']);
  });

  it('omits the tags line when none provided', () => {
    const md = store.build({ name: 'X', useWhen: '', approach: 'a', steps: '', verify: '', notes: '' });
    expect(md).not.toContain('tags:');
    expect(store.parse('loops/x.md', md).tags).toBeUndefined();
  });
});
