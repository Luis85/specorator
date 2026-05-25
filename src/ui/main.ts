/**
 * Standalone browser entry (`npm run dev` / `npm run build:web`). P1 chat-core
 * (SPEC-CC-022): always MockBridge, mounting `ChatSurface` inside `ErrorBoundary`
 * with the six core ports plus the chat ports (`CHAT_RUNTIME_PORT` from
 * `bridge.createChatRuntime()`, `MARKDOWN_RENDER_PORT` from the bridge's markdown
 * port, and `ICON_PORT` from `bridge.createIconPort()` — P2 rich-rendering,
 * SPEC-RR-021) so `npm run dev` shows a working chat (and its block renderers'
 * icons) against the mock runtime (REQ-CC-014, REQ-RR-019). The PROD /
 * LocalStorageBridge branch, router, AppRoot, and secret stores stay dropped (P0
 * reboot). CSS imports are kept.
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
	ICON_PORT,
	PROVIDER_HISTORY_PORT,
	MENTION_DATA_PROVIDER_PORT,
	PROVIDER_COMMAND_CATALOG_PORT,
	SHELL_EXEC_PORT,
	AUX_MODEL_PORT,
	SELECTION_SOURCE_PORT,
	SELECTION_HIGHLIGHT_PORT,
} from '@/infrastructure/bridge/ports';
import {
	CHAT_RUNTIME_FACTORY,
	CONFIRM_DELETE,
	CHOOSE_FORK_TARGET,
	INSTRUCTION_CONFIRM,
	OPEN_INLINE_EDIT,
	OPEN_IMAGE_PREVIEW,
	PICK_ATTACHMENT,
} from '@/ui/chat/modalSeam';
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
app.provide(ICON_PORT, bridge.createIconPort());
// P3 (SPEC-TS-027): the history seam + the per-tab runtime factory. The standalone
// demo provides browser-safe modal stand-ins (no Obsidian, no `window.confirm`):
// fork lands in a new tab, delete proceeds — deterministic for the GitHub Pages demo.
app.provide(PROVIDER_HISTORY_PORT, bridge.createProviderHistoryPort());
app.provide(CHAT_RUNTIME_FACTORY, () => bridge.createChatRuntime());
app.provide(CONFIRM_DELETE, () => Promise.resolve(true));
app.provide(CHOOSE_FORK_TARGET, () => Promise.resolve('new-tab'));
// P4 (SPEC-CP-028/038): the composer ports + the instruction-confirm seam. Mention/
// catalog are per-mount factories, ShellExec is the stateless bridge port (scripted
// echo in the demo). The standalone instruction-confirm stand-in accepts the
// instruction verbatim — deterministic for the GitHub Pages demo, no `window.*`.
app.provide(MENTION_DATA_PROVIDER_PORT, bridge.createMentionDataProvider());
app.provide(PROVIDER_COMMAND_CATALOG_PORT, bridge.createProviderCommandCatalog());
app.provide(SHELL_EXEC_PORT, bridge.shellExec);
app.provide(INSTRUCTION_CONFIRM, (instruction: string) =>
	Promise.resolve({ kind: 'accept' as const, instruction }),
);
// P5 (SPEC-CA-026): the Mock cold-start aux (scriptable) + the inert-but-scriptable
// selection ports, so the demo's title-gen no longer degrades and the context bar
// can render a scripted selection. The two modal launchers are browser-safe
// stand-ins (no Obsidian, no `window.*`): the inline-edit stand-in AUTO-REJECTS
// (`null`) — a missing real modal must NEVER silently apply an edit (REQ-CA-008/020,
// NFR-CA-003); the image-preview stand-in is a no-op resolve. Deterministic for the
// GitHub Pages demo.
app.provide(AUX_MODEL_PORT, bridge.auxModel);
app.provide(SELECTION_SOURCE_PORT, bridge.selectionSource);
app.provide(SELECTION_HIGHLIGHT_PORT, bridge.selectionHighlight);
app.provide(OPEN_INLINE_EDIT, () => Promise.resolve(null));
app.provide(OPEN_IMAGE_PREVIEW, () => Promise.resolve());
// FIX-2.2 (SPEC-CA-022/026): the paperclip attach-picker stand-in. The real
// Obsidian file/image `SuggestModal` lives in `src/plugin/**`; the browser demo
// has no vault picker, so the stand-in resolves `null` (dismiss) — no `window.*`,
// deterministic for the GitHub Pages demo. Drop/paste exercises the live gate.
app.provide(PICK_ATTACHMENT, () => Promise.resolve(null));

void bridge.getSettings().then((s) => {
	setLocale(toSupportedLocale(s.locale));
});

app.mount(mountPoint ?? '#app');
