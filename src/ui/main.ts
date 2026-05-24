/**
 * Standalone browser entry (`npm run dev` / `npm run build:web`). P1 chat-core
 * (SPEC-CC-022): always MockBridge, mounting `ChatSurface` inside `ErrorBoundary`
 * with the six core ports plus the two chat ports (`CHAT_RUNTIME_PORT` from
 * `bridge.createChatRuntime()` and `MARKDOWN_RENDER_PORT` from the bridge's
 * markdown port) so `npm run dev` shows a working chat against the mock runtime
 * (REQ-CC-014). The PROD / LocalStorageBridge branch, router, AppRoot, and secret
 * stores stay dropped (P0 reboot). CSS imports are kept.
 */
import './standalone.css';
import './styles/tokens.css';
import './styles/animations.css';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import ChatSurface from './chat/ChatSurface.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import { i18n, setLocale, toSupportedLocale } from './i18n';
import {
	SETTINGS_PORT,
	VAULT_PORT,
	WORKSPACE_PORT,
	NOTIFICATION_PORT,
	LOGGER_PORT,
	COMMUNITY_PLUGIN_PORT,
	CHAT_RUNTIME_PORT,
	MARKDOWN_RENDER_PORT,
} from '@/infrastructure/bridge/ports';
import { MockBridge } from '@/infrastructure/mock/MockBridge';

const bridge = new MockBridge();
const mountPoint = document.querySelector('#app');
mountPoint?.classList.add('specorator-root');

const app = createApp({
	name: 'StandaloneRoot',
	render: () => h(ErrorBoundary, null, { default: () => h(ChatSurface) }),
});
app.use(createPinia());
app.use(i18n);
app.provide(SETTINGS_PORT, bridge);
app.provide(VAULT_PORT, bridge);
app.provide(WORKSPACE_PORT, bridge);
app.provide(NOTIFICATION_PORT, bridge);
app.provide(LOGGER_PORT, bridge);
app.provide(COMMUNITY_PLUGIN_PORT, bridge);
app.provide(CHAT_RUNTIME_PORT, bridge.createChatRuntime());
app.provide(MARKDOWN_RENDER_PORT, bridge.createMarkdownRenderPort());

void bridge.getSettings().then((s) => {
	setLocale(toSupportedLocale(s.locale));
});

app.mount(mountPoint ?? '#app');
