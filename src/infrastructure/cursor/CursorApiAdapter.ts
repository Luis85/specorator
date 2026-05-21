/**
 * `CursorApiAdapter` — Cursor public HTTP/SSE chat-transport implementation.
 *
 * Satisfies REQ-MPS-010..014, REQ-MPS-017, REQ-MPS-044, NFR-MPS-001,
 * NFR-MPS-002, NFR-MPS-013, SPEC-MPS-001 §5, DES-MPS-001 §C8, ADR-MPS-003.
 *
 * Architecture:
 *   - Lives in the infrastructure layer (ADR-008). Imports only from
 *     `@/domain/ports` and `@/domain/settings`; **never** from `obsidian`,
 *     `@anthropic-ai/claude-agent-sdk`, `node:child_process`, or `node:https`.
 *   - Uses `globalThis.fetch` (injected through the deps bag for tests);
 *     no `HttpPort` is introduced (NFR-MPS-013).
 *   - Reads the Cursor API key from `SecretStorePort` **on every call** so
 *     a key set after plugin boot takes effect without restart (REQ-MPS-013).
 *
 * Logging discipline (NFR-MPS-002):
 *   - Logs request URL path and HTTP response status.
 *   - **Never** logs the API key, request body, headers, or the
 *     `Authorization` value. The header is constructed in a single
 *     expression at the `fetch()` call site so a future maintenance edit
 *     cannot accidentally introduce a key-bearing local variable.
 *
 * Attachment cap (REQ-MPS-044):
 *   - Per-attachment and total non-vault attachment payload capped at 5 MB.
 *   - Cap is enforced **before** any network call; over-cap turns emit
 *     `{ type: 'error', error: ChatTransportError{ATTACHMENT_TOO_LARGE} }`
 *     followed by `{ type: 'done' }`.
 */
import type {
	ChatTransportPort,
	ChatTransportStreamOptions,
	StreamDelta,
} from '@/domain/ports/ChatTransportPort'
import { ChatTransportError } from '@/domain/ports/ChatTransportPort'
import type { LoggerPort, SecretStorePort } from '@/domain/ports'
import { SECRET_ID_CURSOR } from '@/domain/ports'
import type { PluginSettings } from '@/domain/settings/PluginSettings'

/** Single-attachment payload limit (REQ-MPS-044). */
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
/** Aggregate non-vault attachment payload limit (REQ-MPS-044). */
const MAX_TOTAL_ATTACHMENT_BYTES = 5 * 1024 * 1024
/** SSE chat-stream endpoint path (DES-MPS-001 §C8). */
const SSE_CHAT_PATH = '/chat/stream'

/**
 * Structural shape for attachment entries the adapter needs to size-check.
 * `attachments` is not yet declared on `ChatTransportStreamOptions` (WS-9
 * territory) — keep this shape local so the adapter can run its cap check
 * without coupling to the WS-9 design.
 */
export interface CursorAttachmentLike {
	readonly byteLength: number
	/** When `'vault'` the attachment is resolved from disk and not counted. */
	readonly source?: string
}

/**
 * Extension of `ChatTransportStreamOptions` recognised by the Cursor adapter
 * during the cross-workstream rollout. WS-9 will widen the underlying port
 * shape; until then, callers that need attachment cap enforcement supply the
 * field via this structural augmentation.
 */
export type CursorQueryOptions = ChatTransportStreamOptions & {
	readonly attachments?: ReadonlyArray<CursorAttachmentLike>
	readonly model?: string
	readonly planMode?: boolean
}

/**
 * Constructor bag for `CursorApiAdapter` (SPEC-MPS-001 §5).
 *
 * `fetch` is injected so unit tests can stub the HTTP boundary without
 * monkey-patching `globalThis`. `baseUrl` is supplied by
 * `buildProviderRegistry` so the placeholder URL from RES-MPS-001 can be
 * swapped to the real Cursor endpoint with a one-line registry edit.
 */
export interface CursorApiAdapterDeps {
	readonly secretStore: SecretStorePort
	readonly logger: LoggerPort
	// eslint-disable-next-line obsidianmd/prefer-active-doc -- `typeof globalThis.fetch` is the canonical fetch-signature shape; the rule false-positives on type positions.
	readonly fetch: typeof globalThis.fetch
	readonly baseUrl: string
	readonly getSettings: () => PluginSettings
}

/**
 * Raw SSE frame: the event name (from `event:` lines, defaulting to
 * `'message'`) and the concatenated `data:` payload.
 */
interface SseFrame {
	readonly event: string
	readonly data: string
}

/**
 * Mapping target for one SSE event. `null` skips the event entirely (e.g.
 * heartbeat frames). A non-null value is yielded as the next `StreamDelta`.
 *
 * `terminal` flags the `done` / `error` end-of-stream events so the parser
 * can exit early after yielding them, matching the
 * `queryStream()` contract that no further deltas arrive after a terminal.
 */
interface MappedDelta {
	readonly delta: StreamDelta
	readonly terminal: boolean
}

/**
 * `Cursor` adapter implementing `ChatTransportPort`. The class deliberately
 * does **not** implement `runStructured?` — Cursor structured output is out
 * of scope for v1 (ADR-MPS-003 §Consequences-Neutral).
 */
export class CursorApiAdapter implements ChatTransportPort {
	private readonly _secretStore: SecretStorePort
	private readonly _logger: LoggerPort
	// eslint-disable-next-line obsidianmd/prefer-active-doc -- `typeof globalThis.fetch` is the canonical fetch-signature shape; the rule false-positives on type positions.
	private readonly _fetch: typeof globalThis.fetch
	private readonly _baseUrl: string
	private readonly _getSettings: () => PluginSettings

	constructor(deps: CursorApiAdapterDeps) {
		this._secretStore = deps.secretStore
		this._logger = deps.logger
		this._fetch = deps.fetch
		this._baseUrl = deps.baseUrl.replace(/\/+$/, '')
		this._getSettings = deps.getSettings
	}

	/**
	 * Async availability projection — see ADR-MPS-003 §Decision step 3.
	 *
	 * Three sync gates (secretStore.available, cursorApiPreview flag) plus one
	 * async gate (secret presence). Never throws; the secret-store error path
	 * collapses to `false`.
	 */
	async isAvailable(): Promise<boolean> {
		if (!this._secretStore.available) return false
		if (!this._getSettings().cursorApiPreview) return false
		const key = await this._readKey()
		return key !== null && key !== ''
	}

	/**
	 * Stream a prompt to the Cursor SSE endpoint. Never throws; every
	 * terminal condition is delivered as a `done` or `error` delta per
	 * SPEC-MPS-001 §5 step 6.
	 */
	queryStream(
		prompt: string,
		options?: ChatTransportStreamOptions,
	): AsyncIterable<StreamDelta> {
		// The Cursor adapter recognises the WS-9 attachments/model/planMode
		// fields when callers supply them; the base `ChatTransportStreamOptions`
		// doesn't yet declare them, so a structural cast widens the type.
		return this._run(prompt, options)
	}

	private async *_run(
		prompt: string,
		options: CursorQueryOptions | undefined,
	): AsyncGenerator<StreamDelta> {
		const preflight = this._preflight(options)
		if (preflight !== null) {
			yield preflight
			yield { type: 'done' }
			return
		}
		const key = await this._readKey()
		if (key === null) {
			yield {
				type: 'error',
				error: new ChatTransportError('API_KEY_MISSING', 'Cursor API key is missing'),
			}
			yield { type: 'done' }
			return
		}
		const dispatch = await this._dispatch(prompt, key, options)
		if (dispatch.kind === 'error') {
			yield { type: 'error', error: dispatch.error }
			yield { type: 'done' }
			return
		}
		yield* this._parseSse(dispatch.body)
	}

	/**
	 * Sync-only pre-flight checks: attachment cap + eager abort. Returns the
	 * single error delta to emit, or `null` if dispatch may proceed. Lets the
	 * generator stay flat (complexity ≤ 10).
	 */
	private _preflight(
		options: CursorQueryOptions | undefined,
	): StreamDelta | null {
		const capError = CursorApiAdapter._checkAttachmentCap(options?.attachments)
		if (capError !== null) return { type: 'error', error: capError }
		if (options?.signal?.aborted === true) {
			return {
				type: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'Aborted before send'),
			}
		}
		return null
	}

	/**
	 * POST the prompt to the Cursor SSE endpoint and return either the body
	 * stream (success) or the error to surface. The `Authorization` header is
	 * constructed inline at the `fetch()` call so the bearer string is not
	 * held on any inspectable local variable (NFR-MPS-002).
	 */
	private async _dispatch(
		prompt: string,
		key: string,
		options: CursorQueryOptions | undefined,
	): Promise<
		| { kind: 'body'; body: ReadableStream<Uint8Array> }
		| { kind: 'error'; error: ChatTransportError }
	> {
		const url = `${this._baseUrl}${SSE_CHAT_PATH}`
		const body = CursorApiAdapter._buildBody(prompt, options)
		this._logger.debug('CursorApiAdapter.queryStream(): dispatch', {
			path: SSE_CHAT_PATH,
		})
		let response: Response
		try {
			response = await this._fetch(url, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${key}`,
					'Content-Type': 'application/json',
					Accept: 'text/event-stream',
				},
				body: JSON.stringify(body),
				signal: options?.signal,
			})
		} catch (e: unknown) {
			return { kind: 'error', error: CursorApiAdapter._mapFetchError(e) }
		}
		this._logger.debug('CursorApiAdapter.queryStream(): response', {
			status: response.status,
		})
		if (!response.ok) {
			return {
				kind: 'error',
				error: new ChatTransportError(
					response.status === 401 ? 'API_KEY_MISSING' : 'QUERY_FAILED',
					`Cursor API responded with HTTP ${response.status}`,
				),
			}
		}
		if (response.body === null) {
			return {
				kind: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'Cursor API returned an empty body'),
			}
		}
		return { kind: 'body', body: response.body }
	}

	/** Builds the JSON request body per SPEC-MPS-001 §5 step 2. */
	private static _buildBody(
		prompt: string,
		options: CursorQueryOptions | undefined,
	): Record<string, unknown> {
		const body: Record<string, unknown> = { prompt }
		if (options?.model !== undefined) body.model = options.model
		if (options?.systemPromptSuffix !== undefined && options.systemPromptSuffix !== '') {
			body.system_suffix = options.systemPromptSuffix
		}
		if (options?.resumeSessionId !== undefined) body.resume = options.resumeSessionId
		if (options?.planMode === true) body.plan_mode = true
		return body
	}

	/**
	 * Per-attachment + aggregate cap check (REQ-MPS-044). Vault-sourced
	 * attachments are resolved at adapter level by future WS-9 wiring and
	 * counted there; non-vault entries are checked here so a pasted blob can
	 * never silently exceed the limit.
	 */
	private static _checkAttachmentCap(
		attachments: ReadonlyArray<CursorAttachmentLike> | undefined,
	): ChatTransportError | null {
		if (attachments === undefined || attachments.length === 0) return null
		let total = 0
		for (const att of attachments) {
			if (att.source === 'vault') continue
			if (att.byteLength > MAX_ATTACHMENT_BYTES) {
				return new ChatTransportError(
					'ATTACHMENT_TOO_LARGE',
					'Attachment exceeds the 5 MB limit',
				)
			}
			total += att.byteLength
			if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
				return new ChatTransportError(
					'ATTACHMENT_TOO_LARGE',
					'Attachments exceed the 5 MB total limit',
				)
			}
		}
		return null
	}

	/**
	 * Late key read — REQ-MPS-013. Returns the trimmed key or `null` for
	 * the missing / empty / store-error path. Never throws.
	 */
	private async _readKey(): Promise<string | null> {
		try {
			const raw = await this._secretStore.getSecret(SECRET_ID_CURSOR)
			if (raw === null) return null
			const trimmed = raw.trim()
			return trimmed === '' ? null : trimmed
		} catch {
			return null
		}
	}

	private static _mapFetchError(e: unknown): ChatTransportError {
		if (e instanceof Error && /abort/i.test(e.name + ' ' + e.message)) {
			return new ChatTransportError('QUERY_FAILED', 'Aborted before send')
		}
		const message = e instanceof Error ? e.message : 'fetch failed'
		return new ChatTransportError('QUERY_FAILED', message)
	}

	/**
	 * Iterate the SSE body, parse frames, and yield mapped deltas. Yields
	 * exactly one terminal delta (`done` or `error`) before returning.
	 */
	private async *_parseSse(
		body: ReadableStream<Uint8Array>,
	): AsyncGenerator<StreamDelta> {
		const decoder = new TextDecoder('utf-8')
		const reader = body.getReader()
		let buffer = ''
		try {
			for (;;) {
				const { value, done } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				const frames = CursorApiAdapter._extractFrames(buffer)
				buffer = frames.remainder
				const drained = yield* CursorApiAdapter._drainFrames(frames.frames)
				if (drained) return
			}
			buffer += decoder.decode()
			const tail = CursorApiAdapter._extractFrames(buffer + '\n\n')
			const drained = yield* CursorApiAdapter._drainFrames(tail.frames)
			if (drained) return
		} finally {
			CursorApiAdapter._safeReleaseLock(reader)
		}
		// SPEC-MPS-001 §10: stream closed without `done`.
		yield {
			type: 'error',
			error: new ChatTransportError('QUERY_FAILED', 'stream closed unexpectedly'),
		}
		yield { type: 'done' }
	}

	/**
	 * Yield mapped deltas for each frame; return `true` as soon as a terminal
	 * frame is encountered so the caller can stop pulling from the reader.
	 */
	private static *_drainFrames(
		frames: ReadonlyArray<SseFrame>,
	): Generator<StreamDelta, boolean> {
		for (const frame of frames) {
			const mapped = CursorApiAdapter._mapFrame(frame)
			if (mapped === null) continue
			yield mapped.delta
			if (mapped.terminal) return true
		}
		return false
	}

	private static _safeReleaseLock(reader: ReadableStreamDefaultReader<Uint8Array>): void {
		try {
			reader.releaseLock()
		} catch {
			/* tolerate already-released lock from terminal early-return */
		}
	}

	/**
	 * Pure SSE frame splitter. Frames are delimited by `\n\n`; within a frame
	 * lines starting with `event:` or `data:` set the event name and append
	 * to the data buffer respectively. Other lines (comments starting with
	 * `:`, unknown directives) are ignored.
	 */
	private static _extractFrames(input: string): {
		frames: ReadonlyArray<SseFrame>
		remainder: string
	} {
		const frames: SseFrame[] = []
		const parts = input.split('\n\n')
		const tail = parts.pop() ?? ''
		for (const raw of parts) {
			const frame = CursorApiAdapter._parseFrame(raw)
			if (frame !== null) frames.push(frame)
		}
		return { frames, remainder: tail }
	}

	private static _parseFrame(raw: string): SseFrame | null {
		let event = 'message'
		const dataLines: string[] = []
		for (const line of raw.split(/\r?\n/)) {
			if (line === '' || line.startsWith(':')) continue
			if (line.startsWith('event:')) {
				event = line.slice('event:'.length).trim()
				continue
			}
			if (line.startsWith('data:')) {
				dataLines.push(line.slice('data:'.length).replace(/^ /, ''))
			}
		}
		if (dataLines.length === 0 && event === 'message') return null
		return { event, data: dataLines.join('\n') }
	}

	/**
	 * Map one parsed SSE frame to a `StreamDelta` per DES-MPS-001 §C8.
	 * Returns `null` when the frame should be skipped (heartbeats / unknown
	 * event names without a useful payload).
	 */
	private static _mapFrame(frame: SseFrame): MappedDelta | null {
		const event = frame.event
		if (event === 'done') {
			return { delta: { type: 'done' }, terminal: true }
		}
		const payload = CursorApiAdapter._safeParseJson(frame.data)
		const handler = SSE_EVENT_HANDLERS[event]
		return handler !== undefined ? handler(payload) : null
	}

	private static _safeParseJson(data: string): unknown {
		if (data === '') return null
		try {
			return JSON.parse(data)
		} catch {
			return null
		}
	}
}

/**
 * Per-event handlers for `_mapFrame`. Pulling the dispatch out of a giant
 * `if`-ladder keeps `_mapFrame`'s cyclomatic complexity within the
 * project-wide cap (≤10).
 */
const SSE_EVENT_HANDLERS: Readonly<Partial<Record<string, (payload: unknown) => MappedDelta | null>>> = {
	error: (payload) => {
		const msg = extractStr(payload, 'message') ?? 'Cursor reported an error'
		return {
			delta: { type: 'error', error: new ChatTransportError('QUERY_FAILED', msg) },
			terminal: true,
		}
	},
	message_delta: (payload) => {
		const text = extractStr(payload, 'text') ?? ''
		if (text === '') return null
		return { delta: { type: 'text', text }, terminal: false }
	},
	usage: (payload) => {
		const inputTokens = extractNum(payload, 'input_tokens') ?? 0
		const outputTokens = extractNum(payload, 'output_tokens') ?? 0
		return { delta: { type: 'usage', inputTokens, outputTokens }, terminal: false }
	},
	tool_use: (payload) => {
		const blockId = extractStr(payload, 'block_id') ?? extractStr(payload, 'id') ?? 'cursor-tool-block'
		const toolName = extractStr(payload, 'name') ?? ''
		const inputJson = extractStr(payload, 'input_json') ?? ''
		return {
			delta: { type: 'tool-use-start', blockId, toolName, inputJson },
			terminal: false,
		}
	},
}

function extractStr(payload: unknown, key: string): string | null {
	if (payload === null || typeof payload !== 'object') return null
	const value = (payload as Record<string, unknown>)[key]
	return typeof value === 'string' ? value : null
}

function extractNum(payload: unknown, key: string): number | null {
	if (payload === null || typeof payload !== 'object') return null
	const value = (payload as Record<string, unknown>)[key]
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}
