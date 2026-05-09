import type { CanvasPort, JsonCanvasData, VaultPort } from '@/domain/ports'

export class ObsidianCanvasAdapter implements CanvasPort {
  constructor(private readonly vault: VaultPort) {}

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const raw = await this.vault.readFile(path)
    return JSON.parse(raw) as JsonCanvasData
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    await this.vault.writeFile(path, JSON.stringify(data, null, 2))
  }
}
