import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasPort } from '@/domain/ports'
import { MockBridge } from '@/infrastructure/mock/MockBridge'
import { MockCanvasAdapter } from '@/infrastructure/mock/MockCanvasAdapter'
import { ObsidianCanvasAdapter } from '@/infrastructure/obsidian/ObsidianCanvasAdapter'

// ObsidianCanvasAdapter wraps VaultPort (not the Obsidian App), so it can be
// exercised in Vitest by backing it with MockBridge.
// ObsidianMetadataCacheAdapter (separate port) cannot be contract-tested here —
// it requires the full Obsidian App instance.

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

		it('identifies .canvas paths', () => {
			expect(port.isCanvas('diagram.canvas')).toBe(true)
			expect(port.isCanvas('specs/feature.canvas')).toBe(true)
		})

		it('rejects non-canvas paths', () => {
			expect(port.isCanvas('notes.md')).toBe(false)
			expect(port.isCanvas('data.json')).toBe(false)
			expect(port.isCanvas('no-extension')).toBe(false)
		})

		it('throws when reading a canvas that does not exist', async () => {
			await expect(port.readCanvas('missing.canvas')).rejects.toThrow()
		})

		it('reads back data written via writeCanvas', async () => {
			const data = { nodes: [{ id: 'n1', type: 'text' }], edges: [] }
			await port.writeCanvas('diagram.canvas', data)
			const result = await port.readCanvas('diagram.canvas')
			expect(result).toEqual(data)
		})

		it('writeCanvas stores an independent copy — caller mutations do not affect stored data', async () => {
			const data = { nodes: [{ id: 'original' }], edges: [] }
			await port.writeCanvas('diagram.canvas', data)
			// Mutate the source after the write.
			data.nodes[0].id = 'mutated'
			const result = await port.readCanvas('diagram.canvas')
			expect((result.nodes![0] as { id: string }).id).toBe('original')
		})

		it('readCanvas returns an independent copy — caller mutations do not affect stored data', async () => {
			await port.writeCanvas('diagram.canvas', { nodes: [{ id: 'n1' }], edges: [] })
			const first = await port.readCanvas('diagram.canvas')
			;(first.nodes![0] as { id: string }).id = 'mutated'
			const second = await port.readCanvas('diagram.canvas')
			expect((second.nodes![0] as { id: string }).id).toBe('n1')
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
