import { MockMarkdownRenderPort } from '@/infrastructure/mock/MockMarkdownRenderPort';

/**
 * GitHub Pages / standalone-build `MarkdownRenderPort` (WP-4 markdown
 * hardening). The GitHub Pages demo has no Obsidian runtime, so we share
 * the same pure-parser-backed adapter the unit tests use — Obsidian's
 * `MarkdownRenderer` is only available behind `ObsidianMarkdownRenderAdapter`
 * in the plugin build.
 *
 * Kept as a separate class (delegating to `MockMarkdownRenderPort`) so the
 * three-bridge symmetry is preserved (`MockBridge` /
 * `LocalStorageBridge` / `ObsidianBridge` each ship a paired
 * `*MarkdownRenderPort`).
 */
export class LocalStorageMarkdownRenderPort extends MockMarkdownRenderPort {}
