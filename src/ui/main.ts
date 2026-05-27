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
import './styles/accessibility.css';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import ChatSurface from './chat/ChatSurface.vue';
import ErrorBoundary from './components/ErrorBoundary.vue';
import NoticeLiveRegion from './components/NoticeLiveRegion.vue';
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
	TOOLBAR_CATALOG_PORT,
	APPROVAL_RULE_STORE_PORT,
	MCP_CONFIG_STORE_PORT,
	MCP_CLIENT_PORT,
	PROVIDER_REGISTRY_PORT,
	SECRET_STORE_PORT,
	HOME_FS_PORT,
} from '@/infrastructure/bridge/ports';
import {
	CHAT_RUNTIME_FACTORY,
	CONFIRM_DELETE,
	CHOOSE_FORK_TARGET,
	INSTRUCTION_CONFIRM,
	OPEN_INLINE_EDIT,
	OPEN_IMAGE_PREVIEW,
	PICK_ATTACHMENT,
	OPEN_MCP_SERVER_MODAL,
	OPEN_MCP_TEST_MODAL,
	OPEN_PROVIDER_CONSENT,
} from '@/ui/chat/modalSeam';
import { MockBridge } from '@/infrastructure/mock/MockBridge';
import type { ProviderId } from '@/domain/chat/ProviderId';

const bridge = new MockBridge();
const mountPoint = document.querySelector('#app');
mountPoint?.classList.add('specorator-root');

const app = createApp({
	name: 'StandaloneRoot',
	// The notice live region (SPEC-AY-004) rides alongside the chat surface so the
	// standalone / GitHub Pages host announces non-blocking notices to screen
	// readers. It is `.sr-only` (zero visible footprint), so the default render is
	// byte-identical (REQ-AY-014).
	render: () =>
		h(ErrorBoundary, null, {
			default: () => [h(ChatSurface), h(NoticeLiveRegion)],
		}),
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
// P9 (SPEC-PV-020): the shared descriptor-table registry + the in-memory secret store
// (availability switch, no real OS secret) + the inert/seedable home-fs. The surface
// resolves the active provider, mounts the chooser when > 1 enabled, and routes a
// selection through `SelectProviderUseCase` against the Mock runtime registry.
app.provide(PROVIDER_REGISTRY_PORT, bridge.providerRegistry);
app.provide(SECRET_STORE_PORT, bridge.secretStore);
app.provide(HOME_FS_PORT, bridge.homeFs);
// P9 (SPEC-PV-005/031): the widened `(providerId) => Result<runtime>` factory routed
// through the Mock runtime registry. Claude → `ok` with the SAME Mock runtime as P8
// (byte-identical); a scripted non-Claude construct-fail / the LS demo's inert
// non-Claude → `Result.err` (the surface degrades honestly, never throws).
app.provide(CHAT_RUNTIME_FACTORY, (providerId: ProviderId) =>
	bridge.providerRuntimeRegistry.createChatRuntime(providerId),
);
// P9 (SPEC-PV-014/024): the beyond-vault consent launcher stand-in. The browser demo
// has no Obsidian `Modal`; the stand-in resolves `true` (deterministic for the GitHub
// Pages demo, no `window.confirm`/`prompt`). The Mock home-fs is inert anyway, so no
// real beyond-vault read occurs.
app.provide(OPEN_PROVIDER_CONSENT, (_providerId: ProviderId) => Promise.resolve(true));
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
// P6 (SPEC-TC-025): the toolbar option-list source. The `MockBridge` exposes a
// scriptable Claude-shaped catalog (default-backed model + mode) and the Mock
// runtime reports `getToolbarCapabilities()` (read via `tabs.activeRuntime()`), so
// the GitHub Pages demo renders the full strip with the backed widgets + the
// honest capability-gated seams (no live service-tier/MCP on the inert flags).
app.provide(TOOLBAR_CATALOG_PORT, bridge.toolbarCatalog);
// P7 (SPEC-AS-019): the approval-rule store. The `MockBridge` exposes a scriptable
// in-memory store (seedable + failure-injectable) + an inert/scriptable runtime mode,
// so the GitHub Pages demo exercises the permission toggle, the approvals panel, the
// inline four-option block (incl. `deny-always`), and the live rule engine (mode-gate →
// match → auto OR the unchanged P4 prompt) with no live SDK. The surface gates the
// active runtime's approval callback through one per-surface `ApprovalManager`.
app.provide(APPROVAL_RULE_STORE_PORT, bridge.approvalRuleStore);
// P8 (SPEC-MC-020): the scriptable Mock MCP config store (seedable, codec-round-tripped)
// + the scriptable Mock client (the SPEC-MC-028 test matrix, never throws). The surface
// builds the per-surface `McpServerManager` over the store; with the default Mock runtime
// reporting `supportsMcpTools:false` the MCP settings + selector stay hidden (the P7
// byte-identical state) until a server is seeded against an MCP-capable runtime. The two
// modal-seam launchers are browser-safe stand-ins (no Obsidian, no `window.*`): the
// add/edit modal AUTO-DISMISSES (`null`) — a missing real modal adds nothing
// (REQ-MC-042); the test modal is a no-op resolve. Deterministic for the GitHub Pages demo.
app.provide(MCP_CONFIG_STORE_PORT, bridge.mcpConfigStore);
app.provide(MCP_CLIENT_PORT, bridge.mcpClient);
app.provide(OPEN_MCP_SERVER_MODAL, () => Promise.resolve(null));
app.provide(OPEN_MCP_TEST_MODAL, () => Promise.resolve());

void bridge.getSettings().then((s) => {
	setLocale(toSupportedLocale(s.locale));
});

app.mount(mountPoint ?? '#app');
