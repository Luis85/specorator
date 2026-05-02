const ENCODED_OCTET = /%[0-9a-f]{2}/i

export function normalizeFileRoutePath(filePath: string): string {
  if (filePath.includes('/') || !ENCODED_OCTET.test(filePath)) return filePath

  try {
    return decodeURIComponent(filePath)
  } catch {
    return filePath
  }
}
