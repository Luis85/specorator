import type { ModuleDescriptor, ModulePorts } from '@/modules'
import { tryAsync } from '@/domain/shared/tryAsync'

export interface BootstrappedModules {
  readonly teardown: () => Promise<void>
}

async function runDestroy(mod: ModuleDescriptor): Promise<void> {
  if (mod.destroy !== undefined) {
    await tryAsync(() => Promise.resolve(mod.destroy!()))
  }
}

export async function bootstrapModules(
  modules: ReadonlyArray<ModuleDescriptor>,
  ports: ModulePorts,
  settings: Readonly<Record<string, unknown>>,
): Promise<BootstrappedModules> {
  const initialized: ModuleDescriptor[] = []
  for (const mod of modules) {
    const moduleSettings =
      mod.settingsKey !== undefined
        ? ((settings[mod.settingsKey] ?? mod.settingsDefaults ?? {}) as never)
        : (settings as never)
    const result = await tryAsync(() => Promise.resolve(mod.init(ports, moduleSettings)))
    if (!result.ok) {
      await runDestroy(mod)
      for (const m of [...initialized].reverse()) {
        await runDestroy(m)
      }
      throw result.error
    }
    initialized.push(mod)
  }
  return {
    teardown: async () => {
      for (const mod of [...modules].reverse()) {
        await runDestroy(mod)
      }
    },
  }
}
