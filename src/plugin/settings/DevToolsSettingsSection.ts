/**
 * T-MHP-085 — DevTools settings section + `requireExplicitAcceptForAllWrites`
 * toggle. Rendered from `SpecoratorSettingTab.display` per design.md Part B
 * §S01–S09. Lives in its own file so the settings tab stays under the
 * `max-lines` warn threshold.
 *
 * Satisfies: REQ-MHP-010, REQ-MHP-016, REQ-MHP-017, REQ-MHP-043;
 *            Part B §S01–S05, §S07–S09; NFR-MHP-011 (contrast).
 *
 * Microcopy is verbatim from design.md Part B §"Content"; do not paraphrase.
 *
 * Composition: the DevTools per-tool row opens a `DevToolsEnableConfirmModal`
 * on user flip-to-on. On confirm, the settings patch is applied (per-tool
 * enabled true) and the registrar's `refresh(settings)` is invoked so the
 * MCP server picks up the new tool registration without a plugin reload.
 * On cancel or confirm failure, the toggle is reverted to off — the inline
 * S09 error treatment is owned by the modal itself.
 */
import { Setting } from 'obsidian'
import type { App } from 'obsidian'
import type {
  DevToolsHighRiskToolId,
  PluginSettings,
} from '@/domain/settings/PluginSettings'
import { DevToolsEnableConfirmModal } from './DevToolsEnableConfirmModal'
import { THREAT_PARAGRAPHS_MHP } from '@/application/mcp/threatParagraphs'

/**
 * Verbatim one-line risk summaries (Part B §"Settings — DevTools per-tool
 * toggles"). One per row; threat paragraphs are sourced from
 * `THREAT_PARAGRAPHS_MHP` and rendered in the confirm modal, NOT on the row.
 */
const RISK_SUMMARIES: Readonly<
  Record<DevToolsHighRiskToolId | 'dev:screenshot' | 'dev:errors' | 'dev:console', string>
> = {
  'dev:screenshot':
    'Captures a PNG of the active Obsidian window. Result is not written to the audit log.',
  'dev:errors': 'Reads the Obsidian developer console error stream.',
  'dev:console': 'Reads the Obsidian developer console log stream.',
  'dev:dom':
    'Reads the full text of every open note and frontmatter via DOM selector.',
  'dev:cdp':
    'Sends commands to Chrome DevTools Protocol. Always prompts, even with auto-accept on.',
  'dev:debug': "Toggles Obsidian's verbose debug mode.",
  'dev:mobile': 'Switches Obsidian into mobile-emulation mode.',
  devtools: "Opens Obsidian's DevTools window.",
}

const HIGH_RISK_IDS: ReadonlyArray<DevToolsHighRiskToolId> = [
  'dev:dom',
  'dev:cdp',
  'dev:debug',
  'dev:mobile',
  'devtools',
]

/**
 * Drop-in dependencies the settings section needs. Kept narrow so the section
 * can be unit-tested without a full `SpecoratorPlugin` instance.
 */
export interface DevToolsSettingsSectionDeps {
  readonly app: App
  readonly containerEl: HTMLElement
  readonly settings: PluginSettings
  readonly updateSettings: (
    patch: Partial<PluginSettings>,
  ) => Promise<void>
  /**
   * Refresh the DevTools tool registrar after a settings change. Optional —
   * production plugin wires this to `DevToolsToolRegistrar.refresh()`; tests
   * may omit it.
   */
  readonly onSettingsChange?: () => void
}

/**
 * Build a normalised testid suffix from a colon-bearing tool id
 * (`dev:dom` → `dev-dom`). Per design.md Part B §"data-testid pattern".
 */
function testidFor(id: DevToolsHighRiskToolId): string {
  return `settings-devtools-tool-${id.replace(/:/g, '-')}`
}

/**
 * Render the "MCP write proposals" + "DevTools (agent-driven)" sections.
 * Returns nothing; mutates the supplied `containerEl`.
 */
export function renderDevToolsSettingsSection(
  deps: DevToolsSettingsSectionDeps,
): void {
  renderWriteProposalsSection(deps)
  renderDevToolsSection(deps)
}

function renderWriteProposalsSection(deps: DevToolsSettingsSectionDeps): void {
  const { containerEl, settings } = deps
  new Setting(containerEl).setName('MCP write proposals').setHeading()

  const requireExplicit = settings.requireExplicitAcceptForAllWrites
  const requireRow = new Setting(containerEl)
    .setName('Require explicit accept for all writes')
    .setDesc(
      requireExplicit
        ? 'Auto-accept disabled. All writes queue as pending.'
        : 'When on, every MCP write — including spec-folder appends — must be accepted from your MCP client or the sidepanel card.',
    )
    .addToggle((toggle) => {
      toggle.setValue(requireExplicit)
      toggle.onChange(async (value) => {
        await deps.updateSettings({ requireExplicitAcceptForAllWrites: value })
        deps.onSettingsChange?.()
      })
    })
  requireRow.settingEl.setAttribute('data-testid', 'settings-require-explicit-accept')
}

function renderDevToolsSection(deps: DevToolsSettingsSectionDeps): void {
  const { containerEl, settings } = deps
  const dt = settings.devtools

  new Setting(containerEl).setName('DevTools (agent-driven)').setHeading()

  const intro = containerEl.createDiv({ cls: 'setting-item-description' })
  intro.setAttribute('data-testid', 'settings-devtools-intro')
  intro.setText(
    'DevTools tools let agents read your screen, console output, and DOM. All eight tools are off by default. The three low-risk tools can be auto-accepted; the five high-risk tools always queue a proposal.',
  )

  renderMasterToggle(deps, dt.masterEnabled)
  renderAutoAcceptLowRiskToggle(deps, dt)

  for (const id of HIGH_RISK_IDS) {
    renderPerToolRow(deps, id, dt.tools[id].enabled, dt.masterEnabled)
  }
}

function renderMasterToggle(
  deps: DevToolsSettingsSectionDeps,
  enabled: boolean,
): void {
  const { containerEl } = deps
  const row = new Setting(containerEl)
    .setName('Enable DevTools tools')
    .setDesc(
      'Off by default. When on, the three low-risk DevTools tools become reachable. The five high-risk tools each need their own opt-in below.',
    )
    .addToggle((toggle) => {
      toggle.setValue(enabled)
      toggle.onChange(async (value) => {
        await deps.updateSettings({
          devtools: { ...deps.settings.devtools, masterEnabled: value },
        })
        deps.onSettingsChange?.()
      })
    })
  row.settingEl.setAttribute('data-testid', 'settings-devtools-master')
}

function renderAutoAcceptLowRiskToggle(
  deps: DevToolsSettingsSectionDeps,
  dt: PluginSettings['devtools'],
): void {
  const { containerEl } = deps
  const row = new Setting(containerEl)
    .setName('Auto-accept low-risk DevTools tools')
    .setDesc(
      'When on, calls to dev:screenshot, dev:errors, and dev:console run immediately and post a receipt. High-risk DevTools tools still queue a proposal.',
    )
    .addToggle((toggle) => {
      toggle.setValue(dt.autoAcceptLowRisk)
      toggle.setDisabled(!dt.masterEnabled)
      toggle.onChange(async (value) => {
        await deps.updateSettings({
          devtools: { ...deps.settings.devtools, autoAcceptLowRisk: value },
        })
        deps.onSettingsChange?.()
      })
    })
  row.settingEl.setAttribute(
    'data-testid',
    'settings-devtools-auto-accept-low-risk',
  )
  if (!dt.masterEnabled) {
    row.settingEl.setAttribute('aria-disabled', 'true')
  }
}

function renderPerToolRow(
  deps: DevToolsSettingsSectionDeps,
  toolId: DevToolsHighRiskToolId,
  enabled: boolean,
  masterEnabled: boolean,
): void {
  const { containerEl } = deps
  const row = new Setting(containerEl)
    .setName(toolId)
    .setDesc(RISK_SUMMARIES[toolId])
    .addToggle((toggle) => {
      toggle.setValue(enabled)
      toggle.setDisabled(!masterEnabled)
      toggle.onChange((value) => {
        void handlePerToolFlip(deps, toolId, value, toggle)
      })
    })
  row.settingEl.setAttribute('data-testid', testidFor(toolId))
  if (!masterEnabled) {
    row.settingEl.setAttribute('aria-disabled', 'true')
    const helper = containerEl.createDiv({ cls: 'setting-item-description' })
    helper.setAttribute('data-testid', `${testidFor(toolId)}-helper`)
    helper.setText('Enable DevTools first.')
  }
}

/**
 * Per-tool flip handler. Going false → true opens the confirm modal; on
 * confirm we save and refresh the registrar, on cancel we revert the toggle.
 * Going true → false is unconditional (turning off a dangerous tool is always
 * safe to apply immediately).
 */
async function handlePerToolFlip(
  deps: DevToolsSettingsSectionDeps,
  toolId: DevToolsHighRiskToolId,
  next: boolean,
  toggle: { setValue(v: boolean): unknown },
): Promise<void> {
  if (!next) {
    await persistToolFlag(deps, toolId, false)
    deps.onSettingsChange?.()
    return
  }

  await new Promise<void>((resolve) => {
    const modal = new DevToolsEnableConfirmModal({
      app: deps.app,
      toolId,
      threatParagraph: THREAT_PARAGRAPHS_MHP[toolId],
      onConfirm: async () => {
        await persistToolFlag(deps, toolId, true)
        deps.onSettingsChange?.()
      },
      ports: {},
    })
    // Decorate the modal's close path so we can revert the visual toggle if
    // the user cancelled without confirming.
    const originalClose = modal.close.bind(modal)
    modal.close = () => {
      originalClose()
      const persisted =
        deps.settings.devtools.tools[toolId].enabled
      if (!persisted) toggle.setValue(false)
      resolve()
    }
    modal.open()
  })
}

async function persistToolFlag(
  deps: DevToolsSettingsSectionDeps,
  toolId: DevToolsHighRiskToolId,
  enabled: boolean,
): Promise<void> {
  await deps.updateSettings({
    devtools: {
      ...deps.settings.devtools,
      tools: {
        ...deps.settings.devtools.tools,
        [toolId]: { enabled },
      },
    },
  })
}
