import type { ModuleDescriptor } from '@/modules'

/**
 * Topologically sorts the module set so each module's declared `dependsOn`
 * prerequisites appear before it in the result. Independent modules at the
 * same depth keep their declaration order (stable BFS).
 *
 * Throws when a dependency cycle is detected; the error message lists the
 * IDs of all modules left unscheduled after Kahn's BFS terminates.
 *
 * Pure — depends only on the module descriptor array; no port dependency.
 */
// eslint-disable-next-line complexity -- Kahn's BFS; complexity comes from the algorithm itself, not incidental branching.
export function topoSort(modules: ReadonlyArray<ModuleDescriptor>): ModuleDescriptor[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>() // dep → dependants

  for (const mod of modules) {
    if (!inDegree.has(mod.id)) inDegree.set(mod.id, 0)
    if (!adj.has(mod.id)) adj.set(mod.id, [])
  }

  for (const mod of modules) {
    for (const dep of mod.dependsOn ?? []) {
      inDegree.set(mod.id, (inDegree.get(mod.id) ?? 0) + 1)
      if (!adj.has(dep)) adj.set(dep, [])
      adj.get(dep)!.push(mod.id)
    }
  }

  const queue: ModuleDescriptor[] = modules.filter((m) => inDegree.get(m.id) === 0)
  const sorted: ModuleDescriptor[] = []
  const byId = new Map(modules.map((m) => [m.id, m]))

  while (queue.length > 0) {
    const mod = queue.shift()!
    sorted.push(mod)
    for (const dependantId of adj.get(mod.id) ?? []) {
      const next = (inDegree.get(dependantId) ?? 1) - 1
      inDegree.set(dependantId, next)
      if (next === 0) queue.push(byId.get(dependantId)!)
    }
  }

  if (sorted.length !== modules.length) {
    const remaining = modules
      .filter((m) => !sorted.includes(m))
      .map((m) => m.id)
      .join(', ')
    throw new Error(`cycle detected among modules: ${remaining}`)
  }

  return sorted
}
