import './hello-events'
import { defineModule } from '@/modules'

export const helloModule = defineModule({
  id: 'hello',
  commands: [{ id: 'hello:open-view', name: 'Hello: Open view', callback: () => {} }],
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
