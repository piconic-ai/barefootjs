/**
 * Type-evidence resolution for the rich-type method-call refusal (#2273).
 *
 * `resolveReceiverType` answers one question: "what TypeScript type, if any,
 * does this `ParsedExpr` evaluate to?" — using only the structured metadata
 * already collected at IR-build time (`propsType` / `typeDefinitions`), never
 * a fresh type-checker pass. It is deliberately conservative: any receiver
 * shape it doesn't recognize (a call result, computed access, a local not in
 * `bindings`, …) resolves to `null` ("no evidence"), which the caller must
 * treat as "don't flag" rather than "flag as unknown". A false negative here
 * only misses a refusal; a false positive would incorrectly block valid code.
 */

import type { IRMetadata, PropertyInfo, TypeInfo } from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'

/**
 * Built-in JS/TS types whose instance methods have no catalogued lowering
 * (spec/subset-conformance.md). A prop typed as one of these is opaque past
 * this point — the adapters have no structural representation for `Date`,
 * `Map`, etc., only for the primitives/arrays/plain-objects the IR already
 * lowers. Names only (no generic args) — compare against `baseTypeName`.
 */
export const HOST_RICH_TYPE_NAMES: ReadonlySet<string> = new Set([
  'Date',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'URL',
  'URLSearchParams',
  'RegExp',
  'Promise',
  'Error',
  'Symbol',
  'BigInt',
  'Function',
])

/**
 * Strip generic type arguments from a `TypeInfo.raw` string (`Map<string,
 * string>` → `Map`) so a parametrized host type still matches the bare-name
 * catalogue above. `raw` is source-verbatim (`typeNodeToTypeInfo`), so this
 * is a plain substring split on the first `<` — not a type-syntax parse.
 */
export function baseTypeName(raw: string): string {
  const idx = raw.indexOf('<')
  return (idx === -1 ? raw : raw.slice(0, idx)).trim()
}

type EvidenceMetadata = Pick<IRMetadata, 'propsType' | 'propsObjectName' | 'typeDefinitions'>

/**
 * Collapse a union to its single non-nullish arm (`Date | null` → `Date`),
 * recursively, so an optional rich-typed prop still carries evidence. A
 * union with more than one non-nullish arm has no single answer and is left
 * as-is (its `kind` is `'union'`, which never matches the `'interface'`
 * check callers gate on).
 */
function isNullishArm(t: TypeInfo): boolean {
  if (t.kind === 'primitive' && (t.primitive === 'null' || t.primitive === 'undefined')) return true
  // `null` as a type annotation is a `ts.LiteralTypeNode` (not the
  // `NullKeyword` `typeNodeToTypeInfo`'s primitive switch checks for), so it
  // falls through to `{ kind: 'unknown', raw: 'null' }` there — a pre-existing
  // gap in that shared helper, out of scope to fix here. Match on `raw` too
  // so `Date | null` still strips down to `Date`.
  return t.kind === 'unknown' && (t.raw === 'null' || t.raw === 'undefined')
}

function stripUnion(type: TypeInfo | null): TypeInfo | null {
  if (!type || type.kind !== 'union' || !type.unionTypes) return type
  const nonNullish = type.unionTypes.filter((t) => !isNullishArm(t))
  return nonNullish.length === 1 ? stripUnion(nonNullish[0]) : type
}

/**
 * Resolve a named type (`{ kind: 'interface', raw: 'Props' }`) that carries
 * no inline `properties` to its declaration's field list via
 * `metadata.typeDefinitions`. A type already carrying properties (an inline
 * object literal type, or a type resolved from `tsTypeToTypeInfo`) is
 * returned unchanged — this only fills in the gap left by a *named*
 * reference, which `typeNodeToTypeInfo` intentionally resolves to
 * `{ kind: 'interface', raw }` with no member walk of its own.
 */
function derefNamedType(type: TypeInfo, meta: EvidenceMetadata): TypeInfo {
  if (type.kind !== 'interface') return type
  if (type.properties && type.properties.length > 0) return type
  const name = baseTypeName(type.raw)
  const def = meta.typeDefinitions.find((d) => d.name === name)
  if (!def?.properties) return type
  return { ...type, properties: def.properties }
}

/**
 * Resolve one property's type off an object-shaped receiver type, deref'ing
 * a named type first (`Props.createdAt`) and stripping a nullable union off
 * the result (`Date | null` field). Returns `null` when the receiver has no
 * evidence, or the property isn't found on it.
 */
function lookupProperty(objType: TypeInfo | null, propName: string, meta: EvidenceMetadata): TypeInfo | null {
  const stripped = stripUnion(objType)
  if (!stripped) return null
  const deref = derefNamedType(stripped, meta)
  const prop = deref.properties?.find((p: PropertyInfo) => p.name === propName)
  return prop ? stripUnion(prop.type) : null
}

/**
 * Resolve the TypeInfo of a receiver expression, using only propsType /
 * typeDefinitions and the caller-supplied local bindings. `bindings` maps a
 * name to its known type — or explicitly to `null` for a shadow the caller
 * has proven carries no evidence (e.g. an arrow param, a loop item whose
 * array type isn't known). A `bindings` hit always wins over the props
 * fallback, matching JS lexical shadowing.
 *
 * Only two `ParsedExpr` shapes carry evidence: a bare identifier and a
 * non-computed member access. Everything else (calls, computed/index
 * access, literals, …) resolves to `null` — see the module doc.
 */
export function resolveReceiverType(
  expr: ParsedExpr,
  meta: EvidenceMetadata,
  bindings: ReadonlyMap<string, TypeInfo | null>,
): TypeInfo | null {
  if (expr.kind === 'identifier') {
    if (bindings.has(expr.name)) return stripUnion(bindings.get(expr.name) ?? null)
    if (meta.propsObjectName !== null && expr.name === meta.propsObjectName) return stripUnion(meta.propsType)
    return lookupProperty(meta.propsType, expr.name, meta)
  }
  if (expr.kind === 'member' && !expr.computed) {
    const objType = resolveReceiverType(expr.object, meta, bindings)
    return lookupProperty(objType, expr.property, meta)
  }
  return null
}
