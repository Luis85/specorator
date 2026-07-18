import { registerAgentBoardTabFields } from './fields/agentBoard';
import { registerClaudeTabFields } from './fields/claude';
import { registerCodexTabFields } from './fields/codex';
import { registerCursorTabFields } from './fields/cursor';
import { registerDiagnosticsTabFields } from './fields/diagnostics';
import { registerGeneralTabFields } from './fields/general';
import { registerMarketplaceTabFields } from './fields/marketplace';
import { registerOpencodeTabFields } from './fields/opencode';
import { getSettingsRegistry } from './registry';

export function registerAllSettings(): void {
  const r = getSettingsRegistry();
  registerGeneralTabFields();
  registerClaudeTabFields();
  registerCodexTabFields();
  registerOpencodeTabFields();
  registerCursorTabFields();
  registerAgentBoardTabFields();
  registerDiagnosticsTabFields();
  registerMarketplaceTabFields(r);
}
