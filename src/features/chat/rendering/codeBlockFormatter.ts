/**
 * Post-processes Obsidian-rendered markdown: wraps each `<pre>` in a scroll
 * container, adds a clickable language label that copies the block, and moves
 * Obsidian's copy button into the wrapper. Pure DOM transform over the rendered
 * subtree — lifted out of `MessageRenderer.renderContent`.
 */
export function formatCodeBlocks(el: HTMLElement): void {
  el.querySelectorAll('pre').forEach((pre) => {
    // Skip if already wrapped
    if (pre.parentElement?.classList.contains('specorator-code-wrapper')) return;

    const wrapper = createEl('div', { cls: 'specorator-code-wrapper' });
    pre.parentElement?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const code = pre.querySelector('code[class*="language-"]');
    if (code) {
      const match = code.className.match(/language-(\w+)/);
      if (match) {
        wrapper.classList.add('has-language');
        const label = createEl('span', {
          cls: 'specorator-code-lang-label',
          text: match[1],
        });
        wrapper.appendChild(label);
        label.addEventListener('click', () => {
          const originalLabel = match[1];
          if (!originalLabel) return;
          void navigator.clipboard
            .writeText(code.textContent || '')
            .then(() => {
              label.setText('Copied!');
              window.setTimeout(() => label.setText(originalLabel), 1500);
            })
            .catch(() => {
              // Clipboard API may fail in non-secure contexts
            });
        });
      }
    }

    // Move Obsidian's copy button outside pre into wrapper
    const copyBtn = pre.querySelector('.copy-code-button');
    if (copyBtn) {
      wrapper.appendChild(copyBtn);
    }
  });
}
