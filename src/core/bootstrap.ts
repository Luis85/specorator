import type { ModuleDescriptor, ModulePorts } from '@/modules'

export interface BootstrappedModules {
  readonly teardown: () => Promise<void>
}

export async function bootstrapModules(
  modules: ReadonlyArray<ModuleDescriptor>,
  ports: ModulePorts,
  settings: Readonly<Record<string, unknown>>,
): Promise<BootstrappedModules> {
  for (const mod of modules) {
    await Promise.resolve(mod.init(ports, settings))
  }
  return {
    teardown: async () => {
      for (const mod of [...modules].reverse()) {
        if (mod.destroy !== undefined) {
          await Promise.resolve(mod.destroy())
        }
      }
    },
  }
}
