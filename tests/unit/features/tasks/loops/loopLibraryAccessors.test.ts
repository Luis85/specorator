import { loopLibraryAccessors } from '../../../../../src/features/tasks/loops/loopLibraryAccessors';
import type { LoopDefinition } from '../../../../../src/features/tasks/loops/loopTypes';

function makeLoop(overrides: Partial<LoopDefinition> = {}): LoopDefinition {
  return {
    path: 'l/a.md',
    id: 'a',
    name: 'A loop',
    useWhen: '',
    approach: '',
    steps: '',
    verify: '',
    notes: '',
    ...overrides,
  };
}

describe('loopLibraryAccessors', () => {
  it('getDescription concatenates description and useWhen', () => {
    const loop = makeLoop({ description: 'desc', useWhen: 'when' });
    expect(loopLibraryAccessors.getDescription(loop)).toBe('desc when');
  });

  it('getDescription tolerates absent description and useWhen', () => {
    // Externally-authored notes can bypass the editor's guarantees.
    const loop = makeLoop({ description: undefined, useWhen: undefined as unknown as string });
    expect(loopLibraryAccessors.getDescription(loop)).toBe(' ');
  });

  it('getName, getTags, and getUpdatedAt read with fallbacks', () => {
    expect(loopLibraryAccessors.getName(makeLoop())).toBe('A loop');
    expect(loopLibraryAccessors.getTags(makeLoop())).toEqual([]);
    expect(loopLibraryAccessors.getTags(makeLoop({ tags: ['x'] }))).toEqual(['x']);
    expect(loopLibraryAccessors.getUpdatedAt(makeLoop())).toBe(0);
    expect(loopLibraryAccessors.getUpdatedAt(makeLoop({ updatedAt: 5 }))).toBe(5);
  });
});
