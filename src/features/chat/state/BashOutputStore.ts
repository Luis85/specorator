/** A single bang-bash command's output row (moved verbatim from StatusPanel.ts,
 *  now owned engine-side so it survives conversation switch + Vue remount). */
export interface PanelBashOutput {
  id: string;
  command: string;
  status: 'running' | 'completed' | 'error';
  output: string;
  exitCode?: number;
}

const MAX_BASH_OUTPUTS = 50;

/**
 * Engine-side owner of a tab's bang-bash outputs. Bounded FIFO-50 insertion-ordered
 * map; the bang-bash `onSubmit` writes here and the `TabChromeProjection` reads
 * `list()`. `onChange` fires the projection emit (mirror of ComposerDropdownCoordinator).
 * Truth stays in the engine; Vue only renders + owns view-local collapse state.
 */
export class BashOutputStore {
  private readonly outputs = new Map<string, PanelBashOutput>();

  constructor(private readonly onChange: () => void) {}

  add(info: PanelBashOutput): void {
    this.outputs.set(info.id, info);
    while (this.outputs.size > MAX_BASH_OUTPUTS) {
      let oldest: string | undefined;
      for (const key of this.outputs.keys()) { oldest = key; break; }
      if (oldest === undefined) break;
      this.outputs.delete(oldest);
    }
    this.onChange();
  }

  update(id: string, updates: Partial<Omit<PanelBashOutput, 'id' | 'command'>>): void {
    const existing = this.outputs.get(id);
    if (!existing) return;
    this.outputs.set(id, { ...existing, ...updates });
    this.onChange();
  }

  clear(): void {
    this.outputs.clear();
    this.onChange();
  }

  list(): PanelBashOutput[] {
    return [...this.outputs.values()];
  }

  latest(): PanelBashOutput | null {
    return this.list().at(-1) ?? null;
  }
}
