import type { Unsubscriber } from './shared'

export interface ActiveFileSnapshot {
  path: string
  basename: string
  extension: string
}

export interface WorkspacePort {
  openFile(path: string): Promise<void>
  getActiveFile(): ActiveFileSnapshot | null
  onActiveFileChanged(handler: (file: ActiveFileSnapshot | null) => void): Unsubscriber
}
