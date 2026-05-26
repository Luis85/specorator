/**
 * The GitHub Pages demo runtime registry (P9, SPEC-PV-012). `createChatRuntime`
 * constructs the Claude `FixtureChatRuntime` stand-in (unchanged P1) for `'claude'`
 * → `Result.ok`; a non-Claude provider has no Node subprocess in the browser demo,
 * so it degrades to `Result.err` with an "unavailable" reason rather than erroring
 * (NFR-PV-012, REQ-PV-100, EC-PV-8). Never throws across the boundary. No `node:*`.
 */
import type { ChatRuntimePort, ProviderId } from '@/domain/ports';
import type { Result } from '@/domain/shared/Result';
import { ok, err } from '@/domain/shared/Result';
import { FixtureChatRuntime } from './FixtureChatRuntime';

export class LocalStorageProviderRuntimeRegistry {
	/**
	 * Construct the demo runtime for `providerId` (the widened factory body). Claude
	 * reuses the bundled `FixtureChatRuntime` (`ok`); a non-Claude provider has no
	 * subprocess in the browser demo → `err('unavailable')` (degrades, never errors).
	 */
	createChatRuntime(providerId: ProviderId): Result<ChatRuntimePort> {
		if (providerId === 'claude') {
			return ok(new FixtureChatRuntime());
		}
		return err(new Error('unavailable'));
	}
}
