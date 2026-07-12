import { render } from '@testing-library/vue';
import { describe, expect, it } from 'vitest';

import ToolContentLines from '@/features/chat/ui/vue/transcript/blocks/ToolContentLines.vue';

/**
 * Closes the apply_patch gap `ToolContentLines.vue` left after Task 5:
 * reproduces `ToolCallRenderer.ts`'s `renderApplyPatchDiffSections` (via the
 * shared `DiffView`) for the diff-bearing branches. Does not attempt full
 * parity with `renderApplyPatchExpanded`'s other fallback paths (change
 * list / raw patch text / free-text result parsing) — see the deferred-gap
 * note in `ToolContentLines.vue`.
 */
const PATCH_UPDATE = `*** Begin Patch
*** Update File: src/a.ts
@@
-old line
+new line
*** End Patch`;

const PATCH_ADD = `*** Begin Patch
*** Add File: src/new.ts
+line one
+line two
*** End Patch`;

describe('ToolContentLines apply_patch branch', () => {
  it('renders one .specorator-tool-patch-section per file with a diff row + DiffView content', () => {
    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: { patch: PATCH_UPDATE } },
    });

    const sections = container.querySelectorAll('.specorator-tool-patch-section');
    expect(sections).toHaveLength(1);

    const diffRow = sections[0].querySelector('.specorator-write-edit-diff-row');
    expect(diffRow).not.toBeNull();
    const diffEl = diffRow?.querySelector('.specorator-write-edit-diff');
    expect(diffEl).not.toBeNull();

    const lines = diffEl?.querySelectorAll('.specorator-diff-line');
    expect(lines?.length).toBeGreaterThan(0);
    expect(diffEl?.querySelector('.specorator-diff-delete')?.querySelector('.specorator-diff-text')?.textContent).toBe(
      'old line'
    );
    expect(diffEl?.querySelector('.specorator-diff-insert')?.querySelector('.specorator-diff-text')?.textContent).toBe(
      'new line'
    );
  });

  it('renders multiple file sections for a multi-file patch', () => {
    const multiFilePatch = `*** Begin Patch
*** Update File: src/a.ts
@@
-old a
+new a
*** Add File: src/b.ts
+brand new file
*** End Patch`;

    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: { patch: multiFilePatch } },
    });

    expect(container.querySelectorAll('.specorator-tool-patch-section')).toHaveLength(2);
  });

  it('renders "File deleted" for a delete operation with no textual diff', () => {
    const deletePatch = `*** Begin Patch
*** Delete File: src/gone.ts
*** End Patch`;

    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: { patch: deletePatch } },
    });

    const section = container.querySelector('.specorator-tool-patch-section') as HTMLElement;
    expect(section.querySelector('.specorator-tool-empty')?.textContent).toBe('File deleted');
    expect(section.querySelector('.specorator-write-edit-diff')).toBeNull();
  });

  it('renders "No textual diff available" for an update with no diff lines', () => {
    const noOpPatch = `*** Begin Patch
*** Update File: src/unchanged.ts
*** Move to: src/renamed.ts
*** End Patch`;

    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: { patch: noOpPatch } },
    });

    const section = container.querySelector('.specorator-tool-patch-section') as HTMLElement;
    expect(section.querySelector('.specorator-tool-empty')?.textContent).toBe('No textual diff available');
  });

  it('falls back to input.changes when patch text does not parse into diffs', () => {
    const { container } = render(ToolContentLines, {
      props: {
        name: 'apply_patch',
        input: {
          changes: [
            { path: 'src/c.ts', kind: 'update', diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new' },
          ],
        },
      },
    });

    const sections = container.querySelectorAll('.specorator-tool-patch-section');
    expect(sections).toHaveLength(1);
    expect(sections[0].querySelector('.specorator-write-edit-diff')).not.toBeNull();
  });

  it('caps a large all-insert new file section using the shared new-file display cap', () => {
    const bigAdd = `*** Begin Patch\n*** Add File: src/big.ts\n${Array.from(
      { length: 25 },
      (_, i) => `+line ${i}`
    ).join('\n')}\n*** End Patch`;

    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: { patch: bigAdd } },
    });

    const section = container.querySelector('.specorator-tool-patch-section') as HTMLElement;
    expect(section.querySelectorAll('.specorator-diff-line')).toHaveLength(20);
    expect(section.querySelector('.specorator-diff-separator')?.textContent).toBe('... 5 more lines');
  });

  it('renders "No result" when there is no patch, no changes, and no result', () => {
    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: {} },
    });

    expect(container.querySelector('.specorator-tool-empty')?.textContent).toBe('No result');
    expect(container.querySelector('.specorator-tool-patch-section')).toBeNull();
  });

  it('does not gate on an empty result the way the generic default branch does (apply_patch bypasses the !result "No result" short-circuit when diffs are present)', () => {
    const { container } = render(ToolContentLines, {
      props: { name: 'apply_patch', input: { patch: PATCH_ADD }, result: undefined },
    });

    expect(container.querySelector('.specorator-tool-patch-section')).not.toBeNull();
    expect(container.querySelector('.specorator-tool-empty')).toBeNull();
  });
});
