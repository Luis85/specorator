import type { ModuleDescriptor } from './module'
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

export const ALL_MODULES: ReadonlyArray<ModuleDescriptor> = [helloModule]
