const LEGACY_ENCODED_SEPARATOR = /%2f/i

export function normalizeFileRoutePath(filePath: string): string {
  if (!LEGACY_ENCODED_SEPARATOR.test(filePath)) return filePath

  try {
    return decodeURIComponent(filePath)
  } catch {
    return filePath
  }
}
