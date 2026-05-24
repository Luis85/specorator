/**
 * T-MHP-074 / T-MHP-075 — Permanent deny-list of `obsidian-cli` commands
 * (REQ-MHP-014, REQ-MHP-015; ADR-019 §2).
 *
 * These command names are unreachable through any MCP tool — including the
 * `obsidian_cli_read_command` escape hatch (REQ-MHP-015) and any typed
 * registrar. The list is hard-coded server-side and not user-editable.
 *
 * `dev:cdp` is intentionally NOT in this list — ADR-019 §3 carves DevTools
 * tools out of the permanent deny when their per-tool toggle is on
 * (CLAR-MHP-004 user override). DevTools registration is gated by
 * `DevToolsToolRegistrar` (T-MHP-081).
 */
export const PERMANENT_DENY_LIST: readonly string[] = [
  'eval',
  'plugin:install',
  'plugin:uninstall',
  'plugin:enable',
  'plugin:disable',
  'plugin:reload',
  'plugins:restrict',
  'theme:install',
  'theme:uninstall',
  'theme:set',
  'snippet:enable',
  'snippet:disable',
  'sync:on',
  'sync:off',
  'publish:add',
  'publish:remove',
  'publish:open',
  'command',
  'restart',
  'reload',
  'vault:open',
  'workspace:load',
  'tab:open',
  'delete',
]
