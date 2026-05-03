import { beforeEach, describe, expect, it } from 'vitest'
import type { VaultPort } from '@/domain/ports'
import { LocalStorageBridge } from '@/infrastructure/localstorage/LocalStorageBridge'
import { MockBridge } from '@/infrastructure/mock/MockBridge'

interface Harness {
	readonly name: string
	readonly makePort: () => VaultPort
}

function registerVaultContract(harness: Harness): void {
	describe(`${harness.name} VaultPort contract`, () => {
		let port: VaultPort

		beforeEach(() => {
			port = harness.makePort()
		})

		it('reads content after writeFile and reports existence', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')

			expect(await port.fileExists('specs/search/workflow-state.md')).toBe(true)
			expect(await port.readFile('specs/search/workflow-state.md')).toBe('state')
		})

		it('rejects readFile for a missing file', async () => {
			await expect(port.readFile('specs/missing/workflow-state.md')).rejects.toThrow(
				'File not found',
			)
		})

		it('removes files idempotently', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')

			await port.deleteFile('specs/search/workflow-state.md')
			await port.deleteFile('specs/search/workflow-state.md')

			expect(await port.fileExists('specs/search/workflow-state.md')).toBe(false)
		})

		it('lists direct child files under a folder', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')
			await port.writeFile('specs/search/idea.md', 'idea')
			await port.writeFile('specs/search/nested/deep.md', 'deep')
			await port.writeFile('specs/other/workflow-state.md', 'other')

			const files = await port.listFiles('specs/search')

			expect(files.sort()).toEqual(['specs/search/idea.md', 'specs/search/workflow-state.md'])
		})

		it('lists immediate child folders under a parent', async () => {
			await port.writeFile('specs/search/workflow-state.md', 'state')
			await port.writeFile('specs/dark-mode/workflow-state.md', 'state')
			await port.writeFile('notes/today.md', 'note')

			const folders = await port.listFolders('specs')

			expect(folders.sort()).toEqual(['dark-mode', 'search'])
		})

		it('allows createFolder to be called before writing files', async () => {
			await expect(port.createFolder('specs/new-feature')).resolves.toBeUndefined()
			await port.writeFile('specs/new-feature/workflow-state.md', 'state')

			expect(await port.readFile('specs/new-feature/workflow-state.md')).toBe('state')
		})
	})
}

registerVaultContract({
	name: 'MockBridge',
	makePort: () => new MockBridge(),
})

registerVaultContract({
	name: 'LocalStorageBridge',
	makePort: () => {
		localStorage.clear()
		return new LocalStorageBridge()
	},
})
