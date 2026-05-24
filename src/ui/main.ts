/**
 * Standalone browser entry (`npm run dev` / `npm run build:web`). P0 reboot
 * (SPEC-PSR-017 / OC-PSR-2): always MockBridge, mounting the empty
 * AgentPanelRoot inside ErrorBoundary with the six core ports. The PROD /
 * LocalStorageBridge branch, router, AppRoot, FeatureService, and secret stores
 * are dropped; the GitHub-Pages demo path is deferred. CSS imports are kept.
 */
import './standalone.css';
import './styles/tokens.css';
import './styles/animations.css';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import AgentPanelRoot from './agent/AgentPanelRoot.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import { i18n, setLocale, toSupportedLocale } from './i18n';
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	COMMUNITY_PLUGIN_PORT,
} from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

const bridge = new MockBridge();
const mountPoint = document.querySelector('#app');
mountPoint?.classList.add('specorator-root');

const app = createApp({
	name: 'StandaloneRoot',
	render: () => h(ErrorBoundary, null, { default: () => h(AgentPanelRoot) }),
});
app.use(createPinia());
app.use(i18n);
app.provide(SETTINGS_PORT, bridge);
app.provide(VAULT_PORT, bridge);
app.provide(WORKSPACE_PORT, bridge);
app.provide(NOTIFICATION_PORT, bridge);
app.provide(LOGGER_PORT, bridge);
app.provide(COMMUNITY_PLUGIN_PORT, bridge);

void bridge.getSettings().then((s) => {
	setLocale(toSupportedLocale(s.locale));
});

app.mount(mountPoint ?? '#app');
