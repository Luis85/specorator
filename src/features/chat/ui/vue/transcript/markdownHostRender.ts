import type { App, Component } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';

import { processFileLinks } from '../../../../../utils/fileLink';
import { replaceImageEmbedsWithHtml } from '../../../../../utils/imageEmbed';
import { escapeMathDelimitersForStreaming } from '../../../../../utils/markdownMath';
import { formatCodeBlocks } from './codeBlockFormatter';

export interface RenderMarkdownArgs {
  app: App;
  component: Component;
  el: HTMLElement;
  markdown: string;
  mediaFolder: string;
  deferMath?: boolean;
}

/** Obsidian async markdown render + post-process. Mirror of the old
 *  MessageRenderer.renderContent — DO NOT change behavior. */
export async function renderMarkdownInto(args: RenderMarkdownArgs): Promise<void> {
  const { app, component, el, markdown, mediaFolder, deferMath } = args;
  el.empty();

  try {
    const renderMarkdown = deferMath ? escapeMathDelimitersForStreaming(markdown) : markdown;
    // Normalize embeds before MarkdownRenderer consumes them.
    const processedMarkdown = replaceImageEmbedsWithHtml(renderMarkdown, app, { mediaFolder });
    await MarkdownRenderer.render(app, processedMarkdown, el, '', component);

    // Wrap pre elements and move buttons outside scroll area
    formatCodeBlocks(el);

    // Wikilinks and vault paths in assistant prose (Cursor often emits absolute paths in inline code).
    processFileLinks(app, el);
  } catch {
    el.createDiv({
      cls: 'specorator-render-error',
      text: 'Failed to render message content.',
    });
  }
}
