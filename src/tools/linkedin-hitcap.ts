// Process-level LinkedIn hit limiter. Prevents runaway scraping.
const MAX_HITS = Number(process.env.MAX_LI_HITS ?? 5)
let used = 0
const log: string[] = []

export function consumeLinkedInHits(cost: number, reason: string): void {
  if (used + cost > MAX_HITS) {
    throw new Error(`LinkedIn hit cap reached (used=${used}, cap=${MAX_HITS}, requested=${cost}). History: ${log.join(', ')}`)
  }
  used += cost
  log.push(`${reason}(+${cost})`)
}

export function linkedinHitsUsed(): number { return used }
export function linkedinHitLog(): string[] { return [...log] }
export function resetLinkedInHits(): void { used = 0; log.length = 0 }
