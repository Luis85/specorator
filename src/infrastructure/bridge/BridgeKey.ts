import type { InjectionKey } from 'vue'
import type { IBridge } from './IBridge'

export const BRIDGE_KEY: InjectionKey<IBridge> = Symbol('IBridge')
