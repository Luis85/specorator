import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TabComposerProjection } from '@/features/chat/tabs/tabComposer';
import { getTabCapabilities, getTabPermissionMode } from '@/features/chat/tabs/tabShared';
import type { TabData } from '@/features/chat/tabs/types';
import type { ComposerSnapshot } from '@/features/chat/ui/vue/composer/composerCallbacks';
import type SpecoratorPlugin from '@/main';

// The projection derives wrapperMode.planMode from these two helpers; stub them
// so the unit test needs no real provider/registry wiring.
vi.mock('@/features/chat/tabs/tabShared', () => ({
  getTabPermissionMode: vi.fn(() => 'normal'),
  getTabCapabilities: vi.fn(() => ({ supportsPlanMode: true })),
}));

function makeTab(overrides: { streaming?: boolean; value?: string; instruction?: boolean } = {}): TabData {
  return {
    state: { isStreaming: overrides.streaming ?? false },
    dom: { inputEl: { value: overrides.value ?? '' } },
    ui: {
      instructionModeManager: { isActive: () => overrides.instruction ?? false },
      bangBashModeManager: { isActive: () => false },
    },
  } as unknown as TabData;
}

describe('TabComposerProjection', () => {
  beforeEach(() => {
    vi.mocked(getTabPermissionMode).mockReturnValue('normal');
    vi.mocked(getTabCapabilities).mockReturnValue({ supportsPlanMode: true } as never);
  });

  it('pushes the current snapshot immediately on subscribe', () => {
    const projection = new TabComposerProjection(makeTab({ value: 'hi' }), {} as SpecoratorPlugin);
    const seen: ComposerSnapshot[] = [];
    projection.subscribe((s) => seen.push(s));
    expect(seen).toHaveLength(1);
    expect(seen[0].streaming.isStreaming).toBe(false);
    expect(seen[0].draftMeta.isEmpty).toBe(false);
    expect(seen[0].inputMode).toBe('none');
    expect(seen[0].toolbar.modelLabel).toBe('');
    expect(seen[0].chips.folders).toEqual([]);
  });

  it('projects the streaming flag and the empty-draft meta', () => {
    const streaming = new TabComposerProjection(makeTab({ value: 'x', streaming: true }), {} as SpecoratorPlugin);
    const empty = new TabComposerProjection(makeTab({ value: '   ' }), {} as SpecoratorPlugin);
    let s1: ComposerSnapshot | null = null; let s2: ComposerSnapshot | null = null;
    streaming.subscribe((s) => (s1 = s));
    empty.subscribe((s) => (s2 = s));
    expect(s1!.streaming.isStreaming).toBe(true);
    expect(s2!.draftMeta.isEmpty).toBe(true);
  });

  it('projects wrapperMode.planMode from permission mode gated by plan support', () => {
    vi.mocked(getTabPermissionMode).mockReturnValue('plan');
    let on: ComposerSnapshot | null = null;
    new TabComposerProjection(makeTab(), {} as SpecoratorPlugin).subscribe((s) => (on = s));
    expect(on!.wrapperMode.planMode).toBe(true);

    vi.mocked(getTabCapabilities).mockReturnValue({ supportsPlanMode: false } as never);
    let off: ComposerSnapshot | null = null;
    new TabComposerProjection(makeTab(), {} as SpecoratorPlugin).subscribe((s) => (off = s));
    expect(off!.wrapperMode.planMode).toBe(false);
  });

  it('projects wrapperMode.instructionMode from the mode managers', () => {
    let snap: ComposerSnapshot | null = null;
    new TabComposerProjection(makeTab({ instruction: true }), {} as SpecoratorPlugin).subscribe((s) => (snap = s));
    expect(snap!.wrapperMode.instructionMode).toBe(true);
    expect(snap!.wrapperMode.bangBashMode).toBe(false);
  });

  it('projects the active input mode from the mode managers', () => {
    const projection = new TabComposerProjection(makeTab({ instruction: true }), {} as SpecoratorPlugin);
    let snap: ComposerSnapshot | null = null;
    projection.subscribe((s) => (snap = s));
    expect(snap!.inputMode).toBe('instruction');
    expect(snap!.draftMeta.activeMode).toBe('instruction');
  });

  it('emit fans to every observer; disposer removes it', () => {
    const projection = new TabComposerProjection(makeTab(), {} as SpecoratorPlugin);
    const a = vi.fn(); const b = vi.fn();
    const disposeA = projection.subscribe(a);
    projection.subscribe(b);
    a.mockClear(); b.mockClear();
    projection.emit();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    disposeA();
    a.mockClear();
    projection.emit();
    expect(a).not.toHaveBeenCalled();
  });
});
