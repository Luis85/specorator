import type { CanvasPort, JsonCanvasData } from '@/domain/ports'

export class MockCanvasAdapter implements CanvasPort {
  private readonly store = new Map<string, JsonCanvasData>()
  private readonly written = new Map<string, JsonCanvasData>()

  seedCanvas(path: string, data: JsonCanvasData): void {
    this.store.set(path, data)
  }

  getWritten(path: string): JsonCanvasData | undefined {
    return this.written.get(path)
  }

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const data = this.store.get(path)
    if (data === undefined) {
      throw new Error(`[MockCanvasAdapter] Canvas not found: ${path}`)
    }
    return data
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    this.store.set(path, data)
    this.written.set(path, data)
  }
}
