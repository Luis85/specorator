/**
 * Standalone entry point — runs in a regular browser via `npm run dev`.
 * Uses LocalStorageBridge in production and MockBridge in development.
 *
 * CSS custom properties are injected here (not in App.vue) so they are
 * scoped to standalone mode only and never leak into Obsidian's theme.
 */
import './standalone.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { BRIDGE_KEY } from '@/infrastructure/bridge/BridgeKey'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { DEV_FIXTURES } from '@/infrastructure/mock/fixtures'

const bridge = import.meta.env.PROD ? new LocalStorageBridge() : new MockBridge(DEV_FIXTURES)
const mountPoint = document.querySelector('#app')

mountPoint?.classList.add('specorator-root')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.provide(BRIDGE_KEY, bridge)
app.mount(mountPoint ?? '#app')
