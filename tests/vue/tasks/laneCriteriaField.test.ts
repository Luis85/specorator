import { fireEvent, render } from '@testing-library/vue';
import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import LaneCriteriaField from '@/features/tasks/ui/vue/components/LaneCriteriaField.vue';

function textarea(container: Element): HTMLTextAreaElement {
  return container.querySelector('textarea') as HTMLTextAreaElement;
}

describe('LaneCriteriaField', () => {
  it('seeds the textarea from the initial lines', () => {
    const { container } = render(LaneCriteriaField, { props: { label: 'DoR', lines: ['one', 'two'] } });
    expect(textarea(container).value).toBe('one\ntwo');
  });

  it('emits the trimmed, non-empty line list on input', async () => {
    const onCommit = vi.fn();
    const { container } = render(LaneCriteriaField, {
      props: { label: 'DoR', lines: [], onCommit },
    });
    await fireEvent.update(textarea(container), '  a  \n\n b \n');
    expect(onCommit).toHaveBeenLastCalledWith(['a', 'b']);
  });

  it('re-seeds the textarea when the parent replaces the lines (Reset to defaults)', async () => {
    const { container, rerender } = render(LaneCriteriaField, {
      props: { label: 'DoR', lines: ['stale-one', 'stale-two'] },
    });
    expect(textarea(container).value).toBe('stale-one\nstale-two');
    // Parent replaces the lines (e.g. reset reused this lane's id, so no remount).
    await rerender({ label: 'DoR', lines: ['fresh'] });
    await nextTick();
    expect(textarea(container).value).toBe('fresh');
  });

  it('does NOT clobber the local draft when the parent echoes the user’s own edit', async () => {
    const { container, rerender } = render(LaneCriteriaField, {
      props: { label: 'DoR', lines: [] },
    });
    // User types a line with an in-progress trailing blank (mid-keystroke).
    await fireEvent.update(textarea(container), 'typed\n');
    // The parent commits the parsed echo (['typed']) back down as props.lines.
    await rerender({ label: 'DoR', lines: ['typed'] });
    await nextTick();
    // The trailing blank the user is still on must survive — no re-seed.
    expect(textarea(container).value).toBe('typed\n');
  });
});
