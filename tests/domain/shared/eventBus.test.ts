import { describe, expect, it } from 'vitest';
import { createEventBus, type EventEnvelope, type EventMap } from '@/domain/shared/event-bus';

interface TestEvents extends EventMap {
	alpha: { readonly value: number };
	beta: { readonly label: string };
}

declare module '@/domain/shared/event-bus' {
	interface EventMap {
		merged: { readonly ok: boolean };
	}
}

function createIds(ids: readonly string[]): () => string {
	let index = 0;
	return () => {
		if (index >= ids.length) {
			index += 1;
			return `fallback-${index.toString()}`;
		}
		const id = ids[index];
		index += 1;
		return id;
	};
}

describe('createEventBus', () => {
	it('dispatches listeners in priority order', () => {
		const bus = createEventBus<TestEvents>({ idFactory: createIds(['l1', 'l2', 'e1']) });
		const calls: string[] = [];

		bus.on(
			'alpha',
			() => {
				calls.push('low');
			},
			{ priority: 1 },
		);
		bus.on(
			'alpha',
			() => {
				calls.push('high');
			},
			{ priority: 10 },
		);

		const envelope = bus.emit('alpha', { value: 42 });

		expect(calls).toEqual(['high', 'low']);
		expect(envelope).toMatchObject({
			channel: 'alpha',
			payload: { value: 42 },
			eventId: 'e1',
			traceId: 'e1',
		});
	});

	it('snapshots listeners during dispatch', () => {
		const bus = createEventBus<TestEvents>({
			idFactory: createIds([
				'first-listener',
				'second-listener',
				'third-listener',
				'first-event',
				'second-event',
			]),
		});
		const calls: string[] = [];

		const unsubscribeFirst = bus.on('alpha', () => {
			calls.push('first');
			unsubscribeFirst();
			bus.on('alpha', () => {
				calls.push('third');
			});
		});
		bus.on('alpha', () => {
			calls.push('second');
		});

		bus.emit('alpha', { value: 1 });
		bus.emit('alpha', { value: 2 });

		expect(calls).toEqual(['first', 'second', 'second', 'third']);
	});

	it('counts channel-specific listeners and global listeners', () => {
		const bus = createEventBus<TestEvents>();
		const unsubscribeAlpha = bus.on('alpha', () => undefined);
		bus.on('beta', () => undefined);
		bus.onAny(() => undefined);

		expect(bus.listenerCount('alpha')).toBe(1);
		expect(bus.listenerCount('beta')).toBe(1);
		expect(bus.listenerCount()).toBe(3);

		unsubscribeAlpha();

		expect(bus.listenerCount('alpha')).toBe(0);
		expect(bus.listenerCount()).toBe(2);
	});

	it('notifies onAny listeners for every channel', () => {
		const bus = createEventBus<TestEvents>();
		const seen: string[] = [];

		bus.onAny((event) => {
			seen.push(event.channel);
		});

		bus.emit('alpha', { value: 1 });
		bus.emit('beta', { label: 'ready' });

		expect(seen).toEqual(['alpha', 'beta']);
	});

	it('uses priority ordering across channel and onAny listeners', () => {
		const bus = createEventBus<TestEvents>();
		const calls: string[] = [];

		bus.on(
			'alpha',
			() => {
				calls.push('channel-low');
			},
			{ priority: 1 },
		);
		bus.onAny(
			(event) => {
				calls.push(`any-high-${event.channel}`);
			},
			{ priority: 10 },
		);

		bus.emit('alpha', { value: 1 });

		expect(calls).toEqual(['any-high-alpha', 'channel-low']);
	});

	it('uses priority ordering across channel and onAny async listeners', async () => {
		const bus = createEventBus<TestEvents>();
		const calls: string[] = [];

		bus.on(
			'alpha',
			() => {
				calls.push('channel-low');
			},
			{ priority: 1 },
		);
		bus.onAny(
			async (event) => {
				calls.push(`any-high-${event.channel}`);
			},
			{ priority: 10 },
		);

		await bus.emitAsync('alpha', { value: 1 });

		expect(calls).toEqual(['any-high-alpha', 'channel-low']);
	});

	it('propagates trace ids through parent event ids', () => {
		const bus = createEventBus<TestEvents>({
			idFactory: createIds(['root-event', 'child-event', 'manual-event']),
		});

		const root = bus.emit('alpha', { value: 1 });
		const child = bus.emit('beta', { label: 'child' }, { parentId: root.eventId });
		const manual = bus.emit('beta', { label: 'manual' }, { traceId: 'external-trace' });

		expect(child.parentId).toBe(root.eventId);
		expect(child.traceId).toBe(root.traceId);
		expect(manual.traceId).toBe('external-trace');
	});

	it('bounds the trace map', () => {
		const bus = createEventBus<TestEvents>({
			idFactory: createIds(['first', 'second', 'third']),
			traceLimit: 1,
		});

		const first = bus.emit('alpha', { value: 1 });
		const second = bus.emit('alpha', { value: 2 });
		const third = bus.emit('beta', { label: 'third' }, { parentId: first.eventId });

		expect(second.traceId).toBe('second');
		expect(third.parentId).toBe(first.eventId);
		expect(third.traceId).toBe('third');
	});

	it('runs async listeners with bounded concurrency', async () => {
		const bus = createEventBus<TestEvents>({ asyncConcurrency: 2 });
		const starts: number[] = [];
		const resolvers: Array<() => void> = [];
		let resolveThirdStarted: (() => void) | undefined;
		const thirdStarted = new Promise<void>((resolve) => {
			resolveThirdStarted = resolve;
		});

		for (const index of [1, 2, 3]) {
			bus.on('alpha', async () => {
				starts.push(index);
				if (index === 3) resolveThirdStarted?.();
				await new Promise<void>((resolve) => {
					resolvers.push(resolve);
				});
			});
		}

		const emitted = bus.emitAsync('alpha', { value: 1 });
		await Promise.resolve();

		expect(starts).toEqual([1, 2]);

		resolvers[0]?.();
		await thirdStarted;

		expect(starts).toEqual([1, 2, 3]);

		resolvers[1]?.();
		resolvers[2]?.();

		const envelope = await emitted;
		expect(envelope.channel).toBe('alpha');
	});

	it('routes sync emit listener failures to the listener error hook', async () => {
		const errors: unknown[] = [];
		const bus = createEventBus<TestEvents>({
			onListenerError(error) {
				errors.push(error);
			},
		});
		const calls: string[] = [];

		bus.on('alpha', async () => {
			throw new Error('async listener failed');
		});
		bus.on('alpha', () => {
			throw new Error('sync listener failed');
		});
		bus.on('alpha', () => {
			calls.push('after-errors');
		});

		bus.emit('alpha', { value: 1 });
		await Promise.resolve();

		expect(errors).toHaveLength(2);
		expect(errors.every((error) => error instanceof Error)).toBe(true);
		expect(calls).toEqual(['after-errors']);
	});

	it('keeps dispatch isolated when the listener error hook fails', () => {
		const bus = createEventBus<TestEvents>({
			onListenerError() {
				throw new Error('reporting failed');
			},
		});
		const calls: string[] = [];

		bus.on('alpha', () => {
			throw new Error('listener failed');
		});
		bus.on('alpha', () => {
			calls.push('after-error-hook');
		});

		expect(() => {
			bus.emit('alpha', { value: 1 });
		}).not.toThrow();
		expect(calls).toEqual(['after-error-hook']);
	});

	it('supports typed envelope handlers', () => {
		const bus = createEventBus<TestEvents>();
		let received: EventEnvelope<TestEvents['alpha']> | undefined;

		bus.on('alpha', (event) => {
			received = event;
		});

		bus.emit('alpha', { value: 7 });

		expect(received?.payload.value).toBe(7);
	});

	it('routes emitAsync listener failures to the listener error hook without rejecting the caller', async () => {
		const errors: unknown[] = [];
		const bus = createEventBus<TestEvents>({
			onListenerError(error) {
				errors.push(error);
			},
		});
		const calls: string[] = [];

		bus.on('alpha', async () => {
			throw new Error('async listener failed');
		});
		bus.on('alpha', () => {
			throw new Error('sync listener failed');
		});
		bus.on('alpha', () => {
			calls.push('after-errors');
		});

		await expect(bus.emitAsync('alpha', { value: 1 })).resolves.toMatchObject({
			channel: 'alpha',
		});
		expect(errors).toHaveLength(2);
		expect(errors.every((e) => e instanceof Error)).toBe(true);
		expect(calls).toEqual(['after-errors']);
	});

	it('keeps emitAsync dispatch isolated when the listener error hook fails', async () => {
		const bus = createEventBus<TestEvents>({
			onListenerError() {
				throw new Error('reporting failed');
			},
		});
		const calls: string[] = [];

		bus.on('alpha', () => {
			throw new Error('listener failed');
		});
		bus.on('alpha', () => {
			calls.push('after-error-hook');
		});

		await expect(bus.emitAsync('alpha', { value: 1 })).resolves.toBeDefined();
		expect(calls).toEqual(['after-error-hook']);
	});

	it('supports EventMap declaration merging', () => {
		const bus = createEventBus();
		let received: EventEnvelope<EventMap['merged']> | undefined;

		bus.on('merged', (event) => {
			received = event;
		});

		bus.emit('merged', { ok: true });

		expect(received?.payload.ok).toBe(true);
	});
});
