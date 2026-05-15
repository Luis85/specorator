/**
 * Global Vitest setup — registers cross-cutting test-utils defaults.
 *
 * Currently this only wires the `vue-i18n` plugin so any component that calls
 * `useI18n()` (e.g. `TransportStatusPill`, `SubprocessStartingPill`,
 * `FileWriteProposalCard`) can mount in jsdom without each test re-registering
 * the plugin. The i18n instance loaded here is the same `en`/`de` catalogue
 * used at runtime (see `src/ui/i18n/index.ts`), so test assertions that match
 * literal English copy continue to work against the EN locale (the default).
 */
import { config } from '@vue/test-utils'
import { i18n } from '@/ui/i18n'

config.global.plugins = [...config.global.plugins, i18n]
