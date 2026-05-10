import { randomUUID } from 'node:crypto'

export type PendingProposal = {
  proposalId: string
  toolName: string
  params: unknown
  status: 'pending' | 'accepted' | 'rejected'
}

type ProposalEntry = PendingProposal & { mutate: () => Promise<void> }

export class ProposalStore {
  private readonly entries = new Map<string, ProposalEntry>()

  queue(toolName: string, params: unknown, mutate: () => Promise<void>): string {
    const proposalId = randomUUID()
    this.entries.set(proposalId, { proposalId, toolName, params, status: 'pending', mutate })
    return proposalId
  }

  async accept(proposalId: string): Promise<void> {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    await entry.mutate()
    entry.status = 'accepted'
  }

  reject(proposalId: string): void {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    entry.status = 'rejected'
  }

  getAll(): ReadonlyArray<PendingProposal> {
    return Array.from(this.entries.values()).map(({ mutate: _m, ...rest }) => rest)
  }

  get(proposalId: string): PendingProposal | undefined {
    const entry = this.entries.get(proposalId)
    if (!entry) return undefined
    const { mutate: _m, ...rest } = entry
    return rest
  }

  #getOrThrow(proposalId: string): ProposalEntry {
    const entry = this.entries.get(proposalId)
    if (!entry) throw new Error(`Unknown proposal: ${proposalId}`)
    return entry
  }

  #assertPending(entry: ProposalEntry): void {
    if (entry.status !== 'pending')
      throw new Error(`Proposal not pending: ${entry.proposalId} (${entry.status})`)
  }
}
