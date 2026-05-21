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
		let key: string | null = null
		try {
			key = await this._secretStore.getSecret(SECRET_ID_CURSOR)
		} catch {
			// SecretStore failures collapse to `false` per port contract — the
			// production adapter swallows them and the localstorage bridge
			// returns null. Either way the provider is unavailable.
			return false
		}
		return key !== null && key.trim() !== ''
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
		return this._run(prompt, options as CursorQueryOptions | undefined)
	}

	private async *_run(
		prompt: string,
		options: CursorQueryOptions | undefined,
	): AsyncGenerator<StreamDelta> {
		// (1) Attachment cap enforcement — must run before any I/O so an
		// over-cap turn never reaches the network (REQ-MPS-044).
		const capError = CursorApiAdapter._checkAttachmentCap(options?.attachments)
		if (capError !== null) {
			yield { type: 'error', error: capError }
			yield { type: 'done' }
			return
		}

		// (2) Late key read (REQ-MPS-013, ADR-MPS-003 §Decision step 4).
		const key = await this._readKey()
		if (key === null) {
			yield {
				type: 'error',
				error: new ChatTransportError('API_KEY_MISSING', 'Cursor API key is missing'),
			}
			yield { type: 'done' }
			return
		}

		// (3) Pre-flight abort check — abort listeners do not replay events
		// added after the abort, so this guard catches the eager-abort case
		// before the listener is attached on the fetch path.
		if (options?.signal?.aborted === true) {
			yield {
				type: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'Aborted before send'),
			}
			yield { type: 'done' }
			return
		}

		// (4) Build request and POST. The `Authorization` header is
		// constructed inline at the fetch call so the bearer string is not
		// held on any inspectable local variable (NFR-MPS-002).
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
			yield {
				type: 'error',
				error: CursorApiAdapter._mapFetchError(e),
			}
			yield { type: 'done' }
			return
		}

		this._logger.debug('CursorApiAdapter.queryStream(): response', {
			status: response.status,
		})

		if (!response.ok) {
			yield {
				type: 'error',
				error: new ChatTransportError(
					response.status === 401 ? 'API_KEY_MISSING' : 'QUERY_FAILED',
					`Cursor API responded with HTTP ${response.status}`,
				),
			}
			yield { type: 'done' }
			return
		}

		if (response.body === null) {
			yield {
				type: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'Cursor API returned an empty body'),
			}
			yield { type: 'done' }
			return
		}

		// (5) Parse the SSE stream. The parser yields terminal deltas itself;
		// a stream that closes without a terminal is converted to QUERY_FAILED
		// per SPEC-MPS-001 §10 ("Cursor SSE stream closes without `done`" row).
		yield* this._parseSse(response.body)
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
		let terminated = false
		try {
			for (;;) {
				const { value, done } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				const frames = CursorApiAdapter._extractFrames(buffer)
				buffer = frames.remainder
				for (const frame of frames.frames) {
					const mapped = CursorApiAdapter._mapFrame(frame)
					if (mapped === null) continue
					yield mapped.delta
					if (mapped.terminal) {
						terminated = true
						return
					}
				}
			}
			// Flush any trailing partial frame as final decoder bytes.
			buffer += decoder.decode()
			const tail = CursorApiAdapter._extractFrames(buffer + '\n\n')
			for (const frame of tail.frames) {
				const mapped = CursorApiAdapter._mapFrame(frame)
				if (mapped === null) continue
				yield mapped.delta
				if (mapped.terminal) {
					terminated = true
					return
				}
			}
		} finally {
			try {
				reader.releaseLock()
			} catch {
				/* tolerate already-released lock from terminal early-return */
			}
		}
		if (!terminated) {
			// SPEC-MPS-001 §10: stream closed without `done`.
			yield {
				type: 'error',
				error: new ChatTransportError('QUERY_FAILED', 'stream closed unexpectedly'),
			}
			yield { type: 'done' }
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
		// `done` may arrive as a bare event with an empty data string.
		if (event === 'done') {
			return { delta: { type: 'done' }, terminal: true }
		}
		const payload = CursorApiAdapter._safeParseJson(frame.data)
		if (event === 'error') {
			const msg = CursorApiAdapter._extractString(payload, 'message') ?? 'Cursor reported an error'
			return {
				delta: { type: 'error', error: new ChatTransportError('QUERY_FAILED', msg) },
				terminal: true,
			}
		}
		if (event === 'message_delta') {
			const text = CursorApiAdapter._extractString(payload, 'text') ?? ''
			if (text === '') return null
			return { delta: { type: 'text', text }, terminal: false }
		}
		if (event === 'usage') {
			const inputTokens = CursorApiAdapter._extractNumber(payload, 'input_tokens') ?? 0
			const outputTokens = CursorApiAdapter._extractNumber(payload, 'output_tokens') ?? 0
			return { delta: { type: 'usage', inputTokens, outputTokens }, terminal: false }
		}
		if (event === 'tool_use') {
			const blockId =
				CursorApiAdapter._extractString(payload, 'block_id') ??
				CursorApiAdapter._extractString(payload, 'id') ??
				'cursor-tool-block'
			const toolName = CursorApiAdapter._extractString(payload, 'name') ?? ''
			const inputJson = CursorApiAdapter._extractString(payload, 'input_json') ?? ''
			return {
				delta: { type: 'tool-use-start', blockId, toolName, inputJson },
				terminal: false,
			}
		}
		// Unknown event — skip rather than synthesise a delta. The spec's
		// event mapping is non-exhaustive; future Cursor additions are
		// forward-compatible at the adapter boundary.
		return null
	}

	private static _safeParseJson(data: string): unknown {
		if (data === '') return null
		try {
			return JSON.parse(data)
		} catch {
			return null
		}
	}

	private static _extractString(payload: unknown, key: string): string | null {
		if (payload === null || typeof payload !== 'object') return null
		const value = (payload as Record<string, unknown>)[key]
		return typeof value === 'string' ? value : null
	}

	private static _extractNumber(payload: unknown, key: string): number | null {
		if (payload === null || typeof payload !== 'object') return null
		const value = (payload as Record<string, unknown>)[key]
		return typeof value === 'number' && Number.isFinite(value) ? value : null
	}
}
