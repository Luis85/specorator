import type { CanvasPort, JsonCanvasData } from '@/domain/ports'

export class MockCanvasAdapter implements CanvasPort {
  private readonly store = new Map<string, JsonCanvasData>()
  private readonly written = new Map<string, JsonCanvasData>()

  seedCanvas(path: string, data: JsonCanvasData): void {
    this.store.set(path, structuredClone(data))
  }

  getWritten(path: string): JsonCanvasData | undefined {
    const data = this.written.get(path)
    return data !== undefined ? structuredClone(data) : undefined
  }

  isCanvas(path: string): boolean {
    return path.endsWith('.canvas')
  }

  async readCanvas(path: string): Promise<JsonCanvasData> {
    const data = this.store.get(path)
    if (data === undefined) {
      throw new Error(`[MockCanvasAdapter] Canvas not found: ${path}`)
    }
    return structuredClone(data)
  }

  async writeCanvas(path: string, data: JsonCanvasData): Promise<void> {
    const clone = structuredClone(data)
    this.store.set(path, clone)
    this.written.set(path, clone)
  }
}
