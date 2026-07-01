import type { LoopDefinition } from '@/features/tasks/loops/loopTypes';
import { renderLoopPromptText } from '@/features/tasks/loops/renderLoopPromptText';

const loop: LoopDefinition = {
  path: 'x.md', id: 'tdd', name: 'TDD',
  useWhen: 'when building features', approach: 'red-green', steps: '1. test', verify: 'all green', notes: 'be honest',
};

describe('renderLoopPromptText', () => {
  it('includes Approach/Steps/Verify/Notes and the loop name', () => {
    const out = renderLoopPromptText(loop);
    expect(out).toContain('## Loop: TDD');
    expect(out).toContain('### Approach');
    expect(out).toContain('red-green');
    expect(out).toContain('### Steps');
    expect(out).toContain('### Verify');
    expect(out).toContain('### Notes');
  });

  it('never includes the Use-when guidance', () => {
    expect(renderLoopPromptText(loop)).not.toContain('when building features');
  });

  it('omits empty sections', () => {
    const out = renderLoopPromptText({ ...loop, notes: '', verify: '' });
    expect(out).not.toContain('### Notes');
    expect(out).not.toContain('### Verify');
  });
});
