// Intentionally empty so feature modules can add channels by declaration merging.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface EventMap {}

export type EventKey<Events> = Extract<keyof Events, string>;

export interface EventEnvelope<Payload = unknown> {
	readonly channel: string;
	readonly payload: Payload;
	readonly eventId: string;
	readonly traceId: string;
	readonly parentId?: string;
	readonly emittedAt: Date;
}

export interface EventBusOptions {
	readonly asyncConcurrency?: number;
	readonly traceLimit?: number;
	readonly idFactory?: () => string;
	readonly now?: () => Date;
}

export interface EmitOptions {
	readonly parentId?: string;
	readonly traceId?: string;
}

export interface ListenerOptions {
	readonly priority?: number;
}

export type EventUnsubscribe = () => void;
export type EventListener<Payload> = (envelope: EventEnvelope<Payload>) => void | Promise<void>;
export type AnyEventListener<Events> = EventListener<Events[EventKey<Events>]>;

export interface EventBus<Events extends EventMap = EventMap> {
	on<K extends EventKey<Events>>(
		channel: K,
		listener: EventListener<Events[K]>,
		options?: ListenerOptions,
	): EventUnsubscribe;
	onAny(listener: AnyEventListener<Events>, options?: ListenerOptions): EventUnsubscribe;
	emit<K extends EventKey<Events>>(
		channel: K,
		payload: Events[K],
		options?: EmitOptions,
	): EventEnvelope<Events[K]>;
	emitAsync<K extends EventKey<Events>>(
		channel: K,
		payload: Events[K],
		options?: EmitOptions,
	): Promise<EventEnvelope<Events[K]>>;
	listenerCount(channel?: EventKey<Events>): number;
}

interface ListenerEntry<Payload> {
	readonly id: string;
	readonly priority: number;
	readonly listener: EventListener<Payload>;
}

interface EventBusState {
	readonly asyncConcurrency: number;
	readonly traceLimit: number;
	readonly idFactory: () => string;
	readonly now: () => Date;
	readonly traceEntries: readonly TraceEntry[];
}

interface TraceEntry {
	readonly eventId: string;
	readonly traceId: string;
}

const DEFAULT_ASYNC_CONCURRENCY = 4;
const DEFAULT_TRACE_LIMIT = 200;

let nextDefaultId = 0;

function createDefaultId(): string {
	nextDefaultId += 1;
	return `evt_${nextDefaultId.toString(36)}`;
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value) || value < 1) return fallback;
	return value;
}

function insertByPriority<Payload>(
	entries: readonly ListenerEntry<Payload>[],
	entry: ListenerEntry<Payload>,
): readonly ListenerEntry<Payload>[] {
	const next = [...entries, entry];
	return next.sort((left, right) => right.priority - left.priority);
}

function removeById<Payload>(
	entries: readonly ListenerEntry<Payload>[],
	id: string,
): readonly ListenerEntry<Payload>[] {
	return entries.filter((entry) => entry.id !== id);
}

function appendTrace(
	entries: readonly TraceEntry[],
	next: TraceEntry,
	limit: number,
): readonly TraceEntry[] {
	const combined = [...entries, next];
	return combined.slice(Math.max(0, combined.length - limit));
}

function findTraceId(
	entries: readonly TraceEntry[],
	eventId: string | undefined,
): string | undefined {
	if (eventId === undefined) return undefined;
	return entries.find((entry) => entry.eventId === eventId)?.traceId;
}

function createEnvelope<Payload>(
	channel: string,
	payload: Payload,
	options: EmitOptions | undefined,
	state: EventBusState,
): EventEnvelope<Payload> {
	const eventId = state.idFactory();
	const traceId = options?.traceId ?? findTraceId(state.traceEntries, options?.parentId) ?? eventId;
	const base = {
		channel,
		payload,
		eventId,
		traceId,
		emittedAt: state.now(),
	};
	if (options?.parentId === undefined) return base;
	return { ...base, parentId: options.parentId };
}

async function runBounded(
	tasks: readonly (() => Promise<void>)[],
	concurrency: number,
): Promise<void> {
	let nextIndex = 0;

	async function worker(): Promise<void> {
		const task = tasks.at(nextIndex);
		nextIndex += 1;
		if (task === undefined) return;
		await task();
		await worker();
	}

	const workerCount = Math.min(concurrency, tasks.length);
	const workers = Array.from({ length: workerCount }, () => worker());
	await Promise.all(workers);
}

export function createEventBus<Events extends EventMap = EventMap>(
	options: EventBusOptions = {},
): EventBus<Events> {
	let state: EventBusState = {
		asyncConcurrency: normalizePositiveInteger(options.asyncConcurrency, DEFAULT_ASYNC_CONCURRENCY),
		traceLimit: normalizePositiveInteger(options.traceLimit, DEFAULT_TRACE_LIMIT),
		idFactory: options.idFactory ?? createDefaultId,
		now: options.now ?? (() => new Date()),
		traceEntries: [],
	};
	const listeners = new Map<string, readonly ListenerEntry<unknown>[]>();
	let anyListeners: readonly ListenerEntry<Events[EventKey<Events>]>[] = [];

	function rememberTrace(envelope: EventEnvelope<unknown>): void {
		state = {
			...state,
			traceEntries: appendTrace(
				state.traceEntries,
				{ eventId: envelope.eventId, traceId: envelope.traceId },
				state.traceLimit,
			),
		};
	}

	function getChannelListeners<Payload>(channel: string): readonly ListenerEntry<Payload>[] {
		return listeners.get(channel) ?? [];
	}

	function setChannelListeners<Payload>(
		channel: string,
		entries: readonly ListenerEntry<Payload>[],
	): void {
		listeners.set(channel, entries as readonly ListenerEntry<unknown>[]);
	}

	function listenerCount(channel?: EventKey<Events>): number {
		if (channel !== undefined) return getChannelListeners(channel).length;
		let count = anyListeners.length;
		listeners.forEach((entries) => {
			count += entries.length;
		});
		return count;
	}

	function on<K extends EventKey<Events>>(
		channel: K,
		listener: EventListener<Events[K]>,
		listenerOptions: ListenerOptions = {},
	): EventUnsubscribe {
		const id = state.idFactory();
		const entry: ListenerEntry<Events[K]> = {
			id,
			priority: listenerOptions.priority ?? 0,
			listener,
		};
		setChannelListeners(channel, insertByPriority(getChannelListeners(channel), entry));
		return () => {
			setChannelListeners(channel, removeById(getChannelListeners(channel), id));
		};
	}

	function onAny(
		listener: AnyEventListener<Events>,
		listenerOptions: ListenerOptions = {},
	): EventUnsubscribe {
		const id = state.idFactory();
		const entry: ListenerEntry<Events[EventKey<Events>]> = {
			id,
			priority: listenerOptions.priority ?? 0,
			listener,
		};
		anyListeners = insertByPriority(anyListeners, entry);
		return () => {
			anyListeners = removeById(anyListeners, id);
		};
	}

	function emit<K extends EventKey<Events>>(
		channel: K,
		payload: Events[K],
		emitOptions?: EmitOptions,
	): EventEnvelope<Events[K]> {
		const envelope = createEnvelope(channel, payload, emitOptions, state);
		rememberTrace(envelope);
		const snapshot = [...getChannelListeners<Events[K]>(channel), ...anyListeners];
		snapshot.forEach((entry) => {
			void entry.listener(envelope);
		});
		return envelope;
	}

	async function emitAsync<K extends EventKey<Events>>(
		channel: K,
		payload: Events[K],
		emitOptions?: EmitOptions,
	): Promise<EventEnvelope<Events[K]>> {
		const envelope = createEnvelope(channel, payload, emitOptions, state);
		rememberTrace(envelope);
		const snapshot = [...getChannelListeners<Events[K]>(channel), ...anyListeners];
		await runBounded(
			snapshot.map((entry) => async () => {
				await entry.listener(envelope);
			}),
			state.asyncConcurrency,
		);
		return envelope;
	}

	return {
		on,
		onAny,
		emit,
		emitAsync,
		listenerCount,
	};
}
