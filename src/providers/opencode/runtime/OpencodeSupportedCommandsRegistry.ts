import type { SlashCommand } from '../../../core/types';

/**
 * Holds the runtime-discovered slash commands for an OpenCode session plus the
 * short-lived waiters that block on first discovery. `getSupportedCommands`
 * resolves immediately once commands are known, or waits (bounded by a timeout)
 * for the session-load notification to deliver them. Lifted out of
 * `OpencodeChatRuntime` as a self-contained two-field state machine.
 */
export class OpencodeSupportedCommandsRegistry {
  private commands: SlashCommand[] = [];
  private readonly waiters: Array<(commands: SlashCommand[]) => void> = [];

  hasAny(): boolean {
    return this.commands.length > 0;
  }

  /** A defensive copy of the current commands. */
  current(): SlashCommand[] {
    return [...this.commands];
  }

  /** Replaces the command set and resolves any pending waiters. */
  set(commands: SlashCommand[]): void {
    this.commands = commands.map((command) => ({ ...command }));
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter(this.commands);
    }
  }

  /**
   * Resolves with the current commands once they are known, or after `timeoutMs`
   * with whatever is known then (possibly empty).
   */
  waitForCommands(timeoutMs = 250): Promise<SlashCommand[]> {
    if (this.commands.length > 0) {
      return Promise.resolve([...this.commands]);
    }

    return new Promise<SlashCommand[]>((resolve) => {
      const waiter = (commands: SlashCommand[]) => {
        window.clearTimeout(timeoutId);
        resolve([...commands]);
      };
      const timeoutId = window.setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        resolve([...this.commands]);
      }, timeoutMs);

      this.waiters.push(waiter);
    });
  }
}
