/**
 * @jest-environment jsdom
 */
import type { SlashCommand } from '@/core/types';
import { OpencodeSupportedCommandsRegistry } from '@/providers/opencode/runtime/OpencodeSupportedCommandsRegistry';

function cmd(name: string): SlashCommand {
  return { name, description: name } as SlashCommand;
}

describe('OpencodeSupportedCommandsRegistry', () => {
  it('starts empty', () => {
    const registry = new OpencodeSupportedCommandsRegistry();
    expect(registry.hasAny()).toBe(false);
    expect(registry.current()).toEqual([]);
  });

  it('stores a defensive copy of the commands', () => {
    const registry = new OpencodeSupportedCommandsRegistry();
    const source = [cmd('plan')];
    registry.set(source);
    source.push(cmd('build'));
    expect(registry.current()).toHaveLength(1);
    expect(registry.current()).not.toBe(registry.current());
  });

  it('resolves waitForCommands immediately when commands are already known', async () => {
    const registry = new OpencodeSupportedCommandsRegistry();
    registry.set([cmd('plan')]);
    await expect(registry.waitForCommands()).resolves.toEqual([cmd('plan')]);
  });

  it('resolves a pending waiter as soon as set() delivers commands', async () => {
    const registry = new OpencodeSupportedCommandsRegistry();
    const pending = registry.waitForCommands(10_000);
    registry.set([cmd('plan')]);
    await expect(pending).resolves.toEqual([cmd('plan')]);
  });

  it('resolves with whatever is known after the timeout elapses', async () => {
    jest.useFakeTimers();
    try {
      const registry = new OpencodeSupportedCommandsRegistry();
      const pending = registry.waitForCommands(250);
      jest.advanceTimersByTime(250);
      await expect(pending).resolves.toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
});
