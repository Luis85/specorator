// NOTE(asymmetry): LocalStorageBridge does not implement CanvasPort —
// the browser demo has no canvas concept.
// ObsidianCanvasAdapter wraps VaultPort only (not the full Obsidian App) and
// CAN be exercised in Vitest backed by MockBridge.
// ObsidianMetadataCacheAdapter (separate port) cannot — it requires the full App.
import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasPort, JsonCanvasData } from '@/domain/ports'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'

const CANVAS_PATH = 'specs/search/board.canvas'
const NON_CANVAS_PATH = 'specs/search/workflow-state.md'
const DATA: JsonCanvasData = {
	nodes: [{ id: 'n1', type: 'text', text: 'hello' }],
	edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2' }],
}

interface Harness {
	readonly name: string
	readonly makePort: () => CanvasPort
}

function registerCanvasContract(harness: Harness): void {
	describe(`${harness.name} CanvasPort contract`, () => {
		let port: CanvasPort

		beforeEach(() => {
			port = harness.makePort()
		})

		describe('isCanvas', () => {
			it('returns true for .canvas paths', () => {
				expect(port.isCanvas(CANVAS_PATH)).toBe(true)
			})

			it('returns false for non-.canvas paths', () => {
				expect(port.isCanvas(NON_CANVAS_PATH)).toBe(false)
			})
		})

		describe('readCanvas', () => {
			it('rejects with an error for a missing path', async () => {
				await expect(port.readCanvas(CANVAS_PATH)).rejects.toThrow()
			})

			it('resolves with data written via writeCanvas', async () => {
				await port.writeCanvas(CANVAS_PATH, DATA)
				await expect(port.readCanvas(CANVAS_PATH)).resolves.toEqual(DATA)
			})

			it('returns a defensive copy — caller mutation does not affect stored data', async () => {
				await port.writeCanvas(CANVAS_PATH, DATA)
				const result = await port.readCanvas(CANVAS_PATH)
				result.nodes!.push({ id: 'injected' })
				const second = await port.readCanvas(CANVAS_PATH)
				expect(second.nodes).toHaveLength(1)
			})
		})

		describe('writeCanvas', () => {
			it('overwrites previously written data', async () => {
				const updated: JsonCanvasData = { nodes: [], edges: [] }
				await port.writeCanvas(CANVAS_PATH, DATA)
				await port.writeCanvas(CANVAS_PATH, updated)
				await expect(port.readCanvas(CANVAS_PATH)).resolves.toEqual(updated)
			})

			it('write input mutation does not affect stored data', async () => {
				const mutable: JsonCanvasData = { nodes: [{ id: 'n1' }], edges: [] }
				await port.writeCanvas(CANVAS_PATH, mutable)
				mutable.nodes!.push({ id: 'injected' })
				const result = await port.readCanvas(CANVAS_PATH)
				expect(result.nodes).toHaveLength(1)
			})
		})
	})
}

registerCanvasContract({
	name: 'MockCanvasAdapter',
	makePort: () => new MockCanvasAdapter(),
})

registerCanvasContract({
	name: 'ObsidianCanvasAdapter',
	makePort: () => new ObsidianCanvasAdapter(new MockBridge()),
})

// Mock-specific: seedCanvas shortcut and write-spy
describe('MockCanvasAdapter — seed and write-spy', () => {
	it('seedCanvas pre-populates data readable via readCanvas', async () => {
		const adapter = new MockCanvasAdapter()
		adapter.seedCanvas(CANVAS_PATH, DATA)
		await expect(adapter.readCanvas(CANVAS_PATH)).resolves.toEqual(DATA)
	})

	it('getWritten reflects the last writeCanvas call', async () => {
		const adapter = new MockCanvasAdapter()
		await adapter.writeCanvas(CANVAS_PATH, DATA)
		expect(adapter.getWritten(CANVAS_PATH)).toEqual(DATA)
	})
})
