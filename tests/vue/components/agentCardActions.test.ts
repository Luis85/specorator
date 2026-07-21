import { fireEvent, render, screen } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import AgentCardActions from '@/features/library/vue/components/AgentCardActions.vue';

describe('AgentCardActions', () => {
  it('emits start-chat / clone / delete from the three buttons', async () => {
    const { emitted } = render(AgentCardActions, { props: { busy: false } });
    await fireEvent.click(screen.getByRole('button', { name: 'Start chat' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(emitted()['start-chat']).toHaveLength(1);
    expect(emitted().clone).toHaveLength(1);
    expect(emitted().delete).toHaveLength(1);
  });

  it('busy disables every action and marks aria-busy on all three', () => {
    render(AgentCardActions, { props: { busy: true } });
    for (const name of ['Start chat', 'Duplicate', 'Delete']) {
      const btn = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      expect(btn.getAttribute('aria-busy')).toBe('true');
    }
  });

  it('omits aria-busy entirely while idle (no stale busy hint)', () => {
    render(AgentCardActions, { props: { busy: false } });
    const btn = screen.getByRole('button', { name: 'Start chat' });
    expect(btn.hasAttribute('aria-busy')).toBe(false);
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});
