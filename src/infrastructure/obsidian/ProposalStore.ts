import { randomUUID } from 'node:crypto'

export interface PendingProposal {
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
    entry.status = 'accepted'
    try {
      await entry.mutate()
    } catch (e) {
      entry.status = 'pending'
      throw e
    }
  }

  reject(proposalId: string): void {
    const entry = this.#getOrThrow(proposalId)
    this.#assertPending(entry)
    entry.status = 'rejected'
  }

  getAll(): ReadonlyArray<PendingProposal> {
    return Array.from(this.entries.values()).map(({ proposalId, toolName, params, status }) => ({
      proposalId,
      toolName,
      params: structuredClone(params),
      status,
    }))
  }

  get(proposalId: string): PendingProposal | undefined {
    const entry = this.entries.get(proposalId)
    if (!entry) return undefined
    return {
      proposalId: entry.proposalId,
      toolName: entry.toolName,
      params: structuredClone(entry.params),
      status: entry.status,
    }
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
