import { mount, flushPromises } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import OnboardingStep4Workspace from '@/ui/components/OnboardingStep4Workspace.vue'
import { SETTINGS_PORT, VAULT_PORT, LOGGER_PORT } from '@/infrastructure/bridge/ports'
import { OnboardingStep4WorkspacePO } from './OnboardingStep4Workspace.po'
import type { SettingsPort, VaultPort } from '@/domain/ports'
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings'

const mockLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function makeSettingsPort(overrides: Partial<SettingsPort> = {}): SettingsPort {
	return {
		getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
		saveSettings: vi.fn().mockResolvedValue(undefined),
		...overrides,
	}
}

function makeVaultPort(folders: string[] = [], overrides: Partial<VaultPort> = {}): VaultPort {
	return {
		listFolders: vi.fn().mockResolvedValue(folders),
		createFolder: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		appendFile: vi.fn(),
		deleteFile: vi.fn(),
		listFiles: vi.fn(),
		fileExists: vi.fn(),
		...overrides,
	}
}

describe('OnboardingStep4Workspace', () => {
	beforeEach(() => { vi.useFakeTimers() })
	afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

	function mountComponent(
		initialSpecsFolder = 'specs',
		vaultOverrides: Partial<VaultPort> = {},
		settingsOverrides: Partial<SettingsPort> = {},
		vaultFolders: string[] = [],
	) {
		const vault = makeVaultPort(vaultFolders, vaultOverrides)
		const settings = makeSettingsPort(settingsOverrides)
		const wrapper = mount(OnboardingStep4Workspace, {
			props: { initialSpecsFolder },
			global: {
				provide: {
					[VAULT_PORT as symbol]: vault,
					[SETTINGS_PORT as symbol]: settings,
					[LOGGER_PORT as symbol]: mockLogger,
				},
			},
		})
		return { wrapper, po: new OnboardingStep4WorkspacePO(wrapper), vault, settings }
	}

	it('shows checking status initially then not-installed when folder absent', async () => {
		const { po } = mountComponent('specs', {}, {}, [])
		expect(po.statusParagraph.text()).toContain('Checking')
		await flushPromises()
		expect(po.statusParagraph.text()).toContain('not yet installed')
	})

	it('shows ready status when folder already exists', async () => {
		const { po } = mountComponent('specs', {}, {}, ['specs'])
		await flushPromises()
		expect(po.statusParagraph.text()).toContain('already set up')
	})

	it('shows error status when listFolders rejects', async () => {
		const { po } = mountComponent('specs', {
			listFolders: vi.fn().mockRejectedValue(new Error('disk error')),
		})
		await flushPromises()
		expect(po.statusParagraph.text()).toContain("couldn't check")
	})

	it('shows field hint and disables install when folder input is cleared', async () => {
		const { po } = mountComponent('specs')
		await flushPromises()
		await po.setFolder('')
		expect(po.fieldHint.exists()).toBe(true)
		expect((po.installBtn.element as HTMLButtonElement).disabled).toBe(true)
	})

	it('skip emits next with templateStatus skipped', async () => {
		const { wrapper, po } = mountComponent('specs', {}, {}, [])
		await flushPromises()
		await po.clickSkip()
		expect(wrapper.emitted('next')?.[0]).toEqual([{ templateStatus: 'skipped', specsFolder: 'specs' }])
	})

	it('install creates folder and emits next after success', async () => {
		const { wrapper, po, vault } = mountComponent('specs', {}, {}, [])
		await flushPromises()
		await po.clickInstall()
		await flushPromises()
		expect(vault.createFolder).toHaveBeenCalledWith('specs')
		expect(po.outcome.text()).toContain('ready')
		vi.advanceTimersByTime(1500)
		await flushPromises()
		expect(wrapper.emitted('next')?.[0]).toEqual([{ templateStatus: 'installed', specsFolder: 'specs' }])
	})

	it('shows failure outcome when install rejects', async () => {
		const { po } = mountComponent('specs', {
			createFolder: vi.fn().mockRejectedValue(new Error('no space')),
		}, {}, [])
		await flushPromises()
		await po.clickInstall()
		await flushPromises()
		expect(po.outcome.text()).toContain("couldn't be installed")
	})
})
