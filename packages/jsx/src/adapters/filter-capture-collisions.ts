import type { IRLoop } from '../types.ts'
import { freeIdentifiers } from '../expression-parser.ts'

/**
 * Names a `.filter().map()` loop's predicate captures from an enclosing row
 * that the loop's own row binds again (its item, destructure bindings or
 * index), so they shadow the capture where the predicate runs (#3402).
 *
 * `rows.filter(t => t === name).map(name => …)` inside a row bound as `name`:
 * the predicate's `name` is the enclosing value, but adapters evaluate the
 * predicate inside the `.map()` row, where `name` is the item. An adapter
 * keeps each returned name under a loop-scoped alias declared before the
 * loop and rewrites the predicate's reads to it.
 *
 * An unanalyzable predicate (`freeIdentifiers` returns null) yields no
 * names, which keeps the adapter's previous emission.
 */
export function filterCaptureCollisions(loop: IRLoop): string[] {
  const filter = loop.filterPredicate
  if (!filter?.predicate) return []
  const free = freeIdentifiers(filter.predicate)
  if (!free) return []
  free.delete(filter.param)
  const rowBound = new Set<string>(
    loop.paramBindings && loop.paramBindings.length > 0 ? loop.paramBindings.map(b => b.name) : [loop.param],
  )
  if (loop.index) rowBound.add(loop.index)
  return [...free].filter(name => rowBound.has(name)).sort()
}
