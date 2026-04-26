const counter: Record<string, number> = {}

export function generateId(prefix: string): string {
  counter[prefix] = (counter[prefix] ?? 0) + 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${rand}${counter[prefix]}`
}

export function generateDiagramId(): string {
  return crypto.randomUUID()
}
