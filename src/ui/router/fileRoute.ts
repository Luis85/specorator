import { trySync } from '@/domain/shared/tryAsync'

const ENCODED_OCTET = /%[0-9a-f]{2}/i

export function normalizeFileRoutePath(filePath: string): string {
  if (filePath.includes('/') || !ENCODED_OCTET.test(filePath)) return filePath

  const decoded = trySync(() => decodeURIComponent(filePath))
  return decoded.ok ? decoded.value : filePath
}
