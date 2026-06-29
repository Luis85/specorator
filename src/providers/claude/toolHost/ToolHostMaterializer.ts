export interface MaterializerFs {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
}

/** Write `source` to `hostPath` only if it differs. Returns true if it wrote. */
export async function materializeToolHost(
  hostPath: string,
  source: string,
  fs: MaterializerFs,
): Promise<boolean> {
  try {
    if ((await fs.read(hostPath)) === source) return false;
  } catch {
    /* absent → fall through to write */
  }
  await fs.write(hostPath, source);
  return true;
}
