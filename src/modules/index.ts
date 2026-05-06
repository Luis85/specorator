import type { ModuleDescriptor } from './module'
import { coreSettingsModule } from '@/core/core-settings'
import { helloModule } from './hello/hello-module'

export { defineModule } from './module'
export type {
  ModuleDescriptor,
  ModulePorts,
  ModuleSettingsSchema,
  SettingsFieldDescriptor,
  ModuleCommandDescriptor,
  ModuleViewIntent,
} from './module'
export { helloModule }

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Module registry holds descriptors with heterogeneous settings types.
export const ALL_MODULES: ReadonlyArray<ModuleDescriptor<any>> = [coreSettingsModule, helloModule]
