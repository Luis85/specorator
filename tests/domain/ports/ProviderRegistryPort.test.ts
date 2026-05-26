/**
 * T-PV-008 (TEST-PV-112 port-shape leg) — RED: `ProviderRegistryPort` exposes
 * EXACTLY the seven pure-synchronous total reads (no `Promise`, no I/O);
 * `PROVIDER_REGISTRY_PORT` is its OWN `InjectionKey` in `@/infrastructure/bridge/ports`
 * (no aggregate); the barrel `@/domain/ports` re-exports `ProviderRegistryPort` +
 * `ProviderDescriptor` + `ProviderCapabilities`. The behavioural reads are the
 * registry-impl leg (T-PV-011/012).
 *
 * Fails `vue-tsc -p tsconfig.lint.json` until T-PV-009 adds the port + key + barrel.
 *
 * Traces: TEST-PV-112, SPEC-PV-004, REQ-PV-001/002/003/013/020..023/060/061, NFR-PV-006.
 */
import { describe, it, expect } from 'vitest';
import type { InjectionKey } from 'vue';
import type { ProviderRegistryPort } from '@/domain/ports/ProviderRegistryPort';
import type {
	ProviderRegistryPort as PortFromBarrel,
	ProviderDescriptor,
	ProviderCapabilities,
} from '@/domain/ports';
import { PROVIDER_REGISTRY_PORT } from '@/infrastructure/bridge/ports';
import {
	PROVIDER_DESCRIPTORS,
	CLAUDE_DESCRIPTOR,
} from '@/domain/chat/providers/ProviderDescriptor';
import { DEFAULT_SETTINGS } from '@/domain/settings/PluginSettings';

type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// ---- The barrel re-export is the same type as the own module ----
const _barrelSame: Equals<ProviderRegistryPort, PortFromBarrel> = true;
void _barrelSame;

// ---- The port exposes EXACTLY the seven reads ----
const _members: Equals<
	keyof ProviderRegistryPort,
	| 'listRegisteredProviders'
	| 'listEnabledProviders'
	| 'getDescriptor'
	| 'getDisplayNameKey'
	| 'getCapabilities'
	| 'resolveActiveProvider'
	| 'resolveProviderForModel'
> = true;
void _members;

// ---- The reads are SYNCHRONOUS (no Promise) + the exact return types ----
const _list: Equals<
	ReturnType<ProviderRegistryPort['listRegisteredProviders']>,
	readonly ProviderDescriptor[]
> = true;
const _caps: Equals<
	ReturnType<ProviderRegistryPort['getCapabilities']>,
	ProviderCapabilities
> = true;
void _list;
void _caps;

// ---- The key is its own InjectionKey<ProviderRegistryPort> ----
const _key: Equals<typeof PROVIDER_REGISTRY_PORT, InjectionKey<ProviderRegistryPort>> = true;
void _key;

describe('ProviderRegistryPort shape + key (TEST-PV-112)', () => {
	it('the InjectionKey is a Symbol', () => {
		expect(typeof PROVIDER_REGISTRY_PORT).toBe('symbol');
	});

	it('an implementation satisfies the seven pure-read contract', () => {
		const port: ProviderRegistryPort = {
			listRegisteredProviders: () => PROVIDER_DESCRIPTORS,
			listEnabledProviders: () => [CLAUDE_DESCRIPTOR],
			getDescriptor: () => CLAUDE_DESCRIPTOR,
			getDisplayNameKey: () => CLAUDE_DESCRIPTOR.displayNameKey,
			getCapabilities: () => CLAUDE_DESCRIPTOR.capabilities,
			resolveActiveProvider: () => 'claude',
			resolveProviderForModel: () => 'claude',
		};
		expect(port.listRegisteredProviders()).toBe(PROVIDER_DESCRIPTORS);
		expect(port.getDescriptor('claude')).toBe(CLAUDE_DESCRIPTOR);
		expect(port.resolveActiveProvider(DEFAULT_SETTINGS)).toBe('claude');
		expect(port.resolveProviderForModel('sonnet', DEFAULT_SETTINGS)).toBe('claude');
	});
});
