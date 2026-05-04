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
import {
  SETTINGS_PORT,
  VAULT_PORT,
  WORKSPACE_PORT,
  NOTIFICATION_PORT,
  LOGGER_PORT,
} from '@/infrastructure/bridge/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { DEV_FIXTURES } from '@/infrastructure/mock/fixtures'
import { createEventBus } from '@/domain/shared/event-bus'
import { bootstrapModules } from '@/core/bootstrap'
import { ALL_MODULES, type ModulePorts } from '@/modules'

const bridge = import.meta.env.PROD ? new LocalStorageBridge() : new MockBridge(DEV_FIXTURES)
const mountPoint = document.querySelector('#app')

mountPoint?.classList.add('specorator-root')

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

const appBus = createEventBus()
const ports: ModulePorts = {
  settings: bridge,
  vault: bridge,
  workspace: bridge,
  notifications: bridge,
  logger: bridge,
  bus: appBus,
}

void bridge.getSettings()
  .then((settings) => bootstrapModules(ALL_MODULES, ports, settings as unknown as Readonly<Record<string, unknown>>))
  .then(() => {
    app.provide(SETTINGS_PORT, bridge)
    app.provide(VAULT_PORT, bridge)
    app.provide(WORKSPACE_PORT, bridge)
    app.provide(NOTIFICATION_PORT, bridge)
    app.provide(LOGGER_PORT, bridge)

    app.config.errorHandler = (err, _instance, info) => {
      bridge.error(`[Vue] Unhandled error in ${info}`, err)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    }

    // Standalone: page lifetime = app lifetime, no teardown needed.
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      bridge.error('[Unhandled rejection]', event.reason)
      bridge.showError('An unexpected error occurred. Check the console for details.')
    })

    router.onError((err) => {
      bridge.error('[Router] Navigation error', err)
      bridge.showError('Navigation failed. Please try again.')
    })

    app.mount(mountPoint ?? '#app')
  })
  .catch(console.error)
