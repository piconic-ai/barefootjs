/**
 * `Date` lowering plugin (#2274) — the first catalogued entry in the rich-type
 * lowering seam #2273 left open (`rich-type-refusal.ts`'s module doc: "the
 * seam #2274 and later plugins use to catalogue a rich-type API without
 * touching this module"). A zero-arg call to one of `DATE_METHODS` on a
 * receiver resolved (via `resolveReceiverType`) to a `Date`-typed prop lowers
 * to a backend-neutral `helper-call` node on the `date` helper
 * (`date(recv, op)`, spec/template-helpers.md); every adapter already renders
 * `helper-call` generically (#2069), so no adapter-specific code is needed
 * here — only the runtime `date` helper each backend ships.
 *
 * v1 scope is deliberately prop-rooted only: the matcher resolves receivers
 * with `EMPTY_BINDINGS` (no loop-item / arrow-param context), mirroring
 * `rich-type-refusal.ts`'s own top-level walk. A loop item's `.toISOString()`
 * therefore stays BF021-refused rather than silently falling back to a
 * generic (and wrong) lowering — widening to loop bindings is a deliberate
 * future step, not an oversight.
 */

import type { IRMetadata, TypeInfo } from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'
import type { LoweringNode, LoweringPlugin } from './lowering-registry.ts'
import { resolveReceiverType, baseTypeName, stripUnion, derefNamedType } from './rich-type-evidence.ts'

/**
 * Host rich-type names (`rich-type-evidence.ts`'s `HOST_RICH_TYPE_NAMES`)
 * that additionally have a catalogued lowering — currently just `Date`.
 * `analyzer.ts`'s `collectMemberTypes` widening keys off this set (not
 * `HOST_RICH_TYPE_NAMES` wholesale) so a destructured prop only gets a real
 * TypeInfo when a plugin actually exists to consume it; adding a future
 * lowering (`Map`, …) is a one-line addition here, not a second gate to keep
 * in sync.
 */
export const CATALOGUED_RICH_TYPE_NAMES: ReadonlySet<string> = new Set(['Date'])

/** Zero-arg `Date.prototype` methods the `date` helper catalogues (spec/template-helpers.md). */
export const DATE_METHODS: ReadonlySet<string> = new Set([
  'getUTCFullYear',
  'getUTCMonth',
  'getUTCDate',
  'getUTCHours',
  'getUTCMinutes',
  'getUTCSeconds',
  'getTime',
  'toISOString',
])

type Bindings = ReadonlyMap<string, TypeInfo | null>
const EMPTY_BINDINGS: Bindings = new Map()

/**
 * Whether `type` (or a property reachable from it through non-array,
 * non-computed member chains) can ever resolve to a `Date` — the same
 * receiver shapes `resolveReceiverType` walks for an actual call site. Used
 * only as `prepare`'s cheap activation gate: a `false` here must never miss a
 * receiver the matcher could later prove Date-typed (that would silently drop
 * the lowering and mis-flag BF021), so this over-approximates by recursing
 * into every nested object-shaped property, not just direct ones.
 *
 * `seen` guards a self-referential named type (`interface Tree { self: Tree
 * }`) from an infinite walk; keyed by the type's own name so two distinct
 * properties of the SAME named type aren't short-circuited against each
 * other.
 */
function typeReachesDate(type: TypeInfo | null, meta: IRMetadata, seen: Set<string>): boolean {
  const stripped = stripUnion(type)
  if (!stripped) return false
  // `kind: 'object'` is an INLINE type literal (`{ createdAt: Date }` — the
  // shape `propsType` itself takes for the common case) and already carries
  // `properties` directly; `kind: 'interface'` is a NAMED reference (`Date`
  // itself, or a local `interface Props { … }`) that needs the Date-name
  // check plus `derefNamedType` to reach its member list. Anything else
  // (primitive/array/union/…) is a dead end.
  if (stripped.kind === 'interface') {
    const name = baseTypeName(stripped.raw)
    if (name === 'Date') return true
    if (seen.has(name)) return false
    seen.add(name)
  } else if (stripped.kind !== 'object') {
    return false
  }
  const deref = derefNamedType(stripped, meta)
  if (!deref.properties) return false
  return deref.properties.some((p) => typeReachesDate(p.type, meta, seen))
}

/**
 * `datePlugin`'s matcher: recognises `<Date-typed receiver>.<method>()` per
 * the module doc, or declines (null) for anything else — a non-member
 * callee, a non-catalogued method name, a call with arguments (every
 * catalogued method is zero-arg on `Date.prototype`), or a receiver that
 * doesn't resolve to `Date` (unknown, a different host rich type, or a
 * same-named local `typeDefinitions` entry shadowing the built-in — mirrors
 * `rich-type-refusal.ts`'s `inFileShadow` check).
 */
function matchDateCall(callee: ParsedExpr, args: readonly ParsedExpr[], metadata: IRMetadata): LoweringNode | null {
  if (callee.kind !== 'member' || callee.computed) return null
  if (args.length !== 0 || !DATE_METHODS.has(callee.property)) return null
  const receiverType = resolveReceiverType(callee.object, metadata, EMPTY_BINDINGS)
  if (!receiverType || receiverType.kind !== 'interface') return null
  const typeName = baseTypeName(receiverType.raw)
  if (typeName !== 'Date') return null
  if (metadata.typeDefinitions.some((d) => d.name === typeName)) return null
  return {
    kind: 'helper-call',
    helper: 'date',
    args: [callee.object, { kind: 'literal', value: callee.property, literalType: 'string' }],
  }
}

export const datePlugin: LoweringPlugin = {
  name: 'date',
  prepare(metadata) {
    if (!metadata.propsType || !typeReachesDate(metadata.propsType, metadata, new Set())) return null
    return (callee, args) => matchDateCall(callee, args, metadata)
  },
}
