import type { PriceProvenance } from '@/knowledge/schema/job-plan.schema'
import type { ConfluenceBand, JobContext, Reference } from './contextTypes'

/** Price / label formatting shared by the buildPlan modules — one home so plays read alike. */

export function fmtPrice(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/** `29295.5–29323.5`, or the single price when the band is one tick wide. */
export function fmtRange(low: number, high: number): string {
  return low === high ? fmtPrice(low) : `${fmtPrice(low)}–${fmtPrice(high)}`
}

/** The anchor's label, with the confluence count when the band has more members. */
export function bandLabel(band: ConfluenceBand): string {
  const anchor = band.members[0]
  return band.memberCount > 1 ? `${anchor.label} (+${band.memberCount - 1})` : anchor.label
}

/** `label range` — the way a play names a band. */
export function bandName(band: ConfluenceBand): string {
  return `${bandLabel(band)} ${fmtRange(band.low, band.high)}`
}

export function referenceProvenance(members: readonly Reference[]): PriceProvenance {
  return { kind: 'reference', referenceIds: members.map((m) => m.id), derivation: null }
}

export function derivedProvenance(members: readonly Reference[], derivation: string): PriceProvenance {
  return { kind: 'derived', referenceIds: members.map((m) => m.id), derivation }
}

/** Band edges are rounded to cents; member prices are not — compare at that resolution. */
export function priceEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005
}

/** The inventory members quoting `price` (a band edge / zone edge), preferring the named band's members. */
export function membersAtPrice(context: JobContext, price: number, bandId: string | null): Reference[] {
  const band = bandId === null ? undefined : context.bands.find((b) => b.id === bandId)
  const pool = band ? band.members : context.references
  const exact = pool.filter((m) => priceEq(m.price, price))
  return exact.length > 0 ? exact : context.references.filter((m) => priceEq(m.price, price))
}
