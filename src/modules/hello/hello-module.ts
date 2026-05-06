import './hello-events'
import { defineModule } from '@/modules/module'

interface HelloSettings {
  showBadge: boolean
}

export const helloModule = defineModule<HelloSettings>({
  id: 'hello',
  settingsKey: 'hello',
  settingsVersion: 1,
  settingsDefaults: { showBadge: true },

  validateSettings(raw: unknown): HelloSettings {
    const r = (raw ?? {}) as Record<string, unknown>
    return { showBadge: typeof r.showBadge === 'boolean' ? r.showBadge : true }
  },

  commands: [{ id: 'hello:open-view', name: 'Hello: Open view', callback: () => undefined }],
  views: [{ id: 'hello-view', label: 'Hello' }],
  settingsSchema: {
    fields: [{ type: 'toggle', key: 'showBadge', label: 'Show badge', default: true }],
  },
  messages: {
    en: { 'hello.title': 'Hello from Specorator' },
    de: { 'hello.title': 'Hallo von Specorator' },
  },
  init(ports) {
    ports.bus.emit('hello:initialized', { moduleId: 'hello' })
  },
})
