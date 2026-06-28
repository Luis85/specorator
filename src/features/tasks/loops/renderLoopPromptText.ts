import type { LoopDefinition } from './loopTypes';

/**
 * Render a loop as standalone playbook prompt text for seeding the composer.
 * Mirrors the work-order loop block (Approach / Steps / Verify / Notes — never
 * `useWhen`, which is selection-only) but without work-order framing: the user
 * appends their task before sending.
 */
export function renderLoopPromptText(loop: LoopDefinition): string {
  const parts: string[] = [
    `## Loop: ${loop.name}`,
    'Follow this loop: apply its approach, work the steps, and satisfy its verify condition.',
  ];
  const sub = (heading: string, value: string): void => {
    const trimmed = value.trim();
    if (trimmed) parts.push(`\n### ${heading}\n${trimmed}`);
  };
  sub('Approach', loop.approach);
  sub('Steps', loop.steps);
  sub('Verify', loop.verify);
  sub('Notes', loop.notes);
  return parts.join('\n');
}
