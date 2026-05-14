import { inject } from 'vue'
import { IS_MOBILE_KEY } from '@/infrastructure/bridge/ports'

export function usePlatform(): { isMobile: boolean } {
	const isMobile = inject(IS_MOBILE_KEY, false)
	return { isMobile }
}
