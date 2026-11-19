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

import type { IRMetadata, PropertyInfo, TypeDefinition, TypeInfo } from './types.ts'
import type { ParsedExpr } from './expression-parser.ts'

/**
 * Built-in JS/TS types whose instance methods have no catalogued lowering
 * (spec/subset-conformance.md). A prop typed as one of these is opaque past
 * this point — the adapters have no structural representation for `Date`,
 * `Map`, etc., only for the primitives/arrays/plain-objects the IR already
 * lowers. Names only (no generic args) — compare against `baseTypeName`.
 *
 * Two shapes deliberately escape this catalogue (conservative misses, not
 * bugs — a miss only skips a refusal, never misdiagnoses):
 *   - keyword-typed `bigint` / `symbol` annotations lower to
 *     `{ kind: 'unknown' }` in `typeNodeToTypeInfo` (only the object-form
 *     `BigInt` / `Symbol` type references reach `kind: 'interface'` and
 *     match here);
 *   - a local alias of a host type (`type Timestamp = Date`) resolves to
 *     the alias NAME — `derefNamedType` only fills in `properties` from a
 *     declaration, it never rewrites `raw` to the alias target — so the
 *     catalogue lookup sees `Timestamp`, not `Date`.
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
 * The subset of `HOST_RICH_TYPE_NAMES` whose `toJSON()` output is accepted
 * by the type's own one-argument constructor, so a value that crossed the
 * `bf-p` hydration boundary as JSON can be revived with `new T(jsonValue)`
 * (#2636). `Date.prototype.toJSON()` returns an ISO string `new Date()`
 * re-parses; `URL.prototype.toJSON()` returns an `href` string `new URL()`
 * re-parses. Every other host rich type fails this test:
 *   - `Map` / `Set` / `WeakMap` / `WeakSet` — `JSON.stringify` drops all
 *     entries, serializing to `{}`; there is no envelope to revive FROM.
 *   - `URLSearchParams` / `RegExp` / `Promise` / `Error` — likewise
 *     serialize to `{}` (or, for `Error`, an empty-looking object missing
 *     `message`/`stack` under most engines' own `toJSON`-less default).
 *   - `Symbol` / `Function` — dropped entirely by `JSON.stringify` (become
 *     `undefined` in an object, elided in an array).
 *   - `BigInt` — `JSON.stringify` throws `TypeError` before a hydrate-time
 *     revival could ever run.
 *
 * Used only to decide which escape suggestion `rich-type-refusal.ts`'s
 * `pushDiagnostic` may offer: a bare `/* @client *\/` recommendation is
 * unsound for every host rich type here (see that module's docstring), but
 * wrapping the receiver in `new T(...)` — `{/* @client *\/ new
 * Date(createdAt).getUTCFullYear()}` — is a genuine, hydrate-safe escape
 * for this subset only.
 *
 * A GENERAL typed-prop revival mechanism across the rest of
 * `HOST_RICH_TYPE_NAMES` — a `bf-p` wire envelope reviving `Map`/`Set`/
 * `URLSearchParams`/`RegExp`/`BigInt` the way `Date`/`URL` revive via their
 * own constructor — was evaluated and DEFERRED (#2642), not rejected on
 * technical grounds. Two decisions worth recording here so a future
 * contributor doesn't re-litigate them from scratch:
 *   - A value-shaped sentinel envelope (`{ $map: [[k,v],...] }`, detected
 *     by `parseProps`) was rejected: the type signal lives in the VALUE, so
 *     a user prop that happens to share the sentinel's shape would be
 *     silently misrevived on every adapter, not just ones that emit
 *     envelopes — the only sound fix is a user-data escaping rule
 *     implemented in all 9 adapters' serializers, which is the actual
 *     protocol cost, paid by every payload, not just rich-typed ones.
 *   - If ever built, the sanctioned shape is TYPE-DIRECTED USE-SITE
 *     REVIVAL — the generalization of `date()` (`packages/client/src/
 *     runtime/date.ts`): plain-JSON canonical wire shapes per type, with
 *     the compiler (which already resolves prop types here) emitting a
 *     revival call at each prop's client-JS extraction site, not a
 *     value-sniffing `parseProps` reviver.
 * `WeakMap` / `WeakSet` / `Promise` / `Symbol` / `Function` are excluded
 * from that future scope permanently, independent of mechanism — they are
 * structurally impossible to serialize (non-enumerable by spec, not data,
 * or identity-is-the-semantics), not merely unrevived today.
 */
export const JSON_REVIVABLE_RICH_TYPE_NAMES: ReadonlySet<string> = new Set(['Date', 'URL'])

/**
 * The complement of `JSON_REVIVABLE_RICH_TYPE_NAMES` within `HOST_RICH_TYPE_NAMES`
 * — every host rich type whose `JSON.stringify` output is NOT revivable via its
 * own constructor. Used by `checkRichTypePropSerialization`
 * (`rich-type-refusal.ts`, #2643) to flag a rich-typed prop that a client
 * reads but that will cross the `bf-p` hydration boundary de-riched or
 * (for `BigInt`) fail to serialize at all — a distinct failure from the
 * method-call refusal above: whether or not client code goes on to call a
 * method on the value is irrelevant here, since the method-call refusal
 * only walks template-lowered expression positions and never sees a
 * handler/effect body regardless.
 */
export const JSON_UNSAFE_RICH_TYPE_NAMES: ReadonlySet<string> = new Set(
  [...HOST_RICH_TYPE_NAMES].filter((n) => !JSON_REVIVABLE_RICH_TYPE_NAMES.has(n)),
)

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

type EvidenceMetadata = Pick<IRMetadata, 'propsType' | 'propsObjectName' | 'propsParams' | 'typeDefinitions'>

/**
 * Collapse a union to its single non-nullish arm (`Date | null` → `Date`),
 * recursively, so an optional rich-typed prop still carries evidence. A
 * union with more than one non-nullish arm has no single answer and is left
 * as-is (its `kind` is `'union'`, which never matches the `'interface'`
 * check callers gate on).
 */
function isNullishArm(t: TypeInfo): boolean {
  // Purely structural: `typeNodeToTypeInfo`'s literal-type arm lowers a
  // `null` union member (`ts.LiteralTypeNode(NullKeyword)`) to
  // `{ kind: 'primitive', primitive: 'null' }`, the same shape a bare
  // `null` annotation always produced — the raw-text fallback this helper
  // used to carry for the analyzer gap is gone with the gap.
  return t.kind === 'primitive' && (t.primitive === 'null' || t.primitive === 'undefined')
}

export function stripUnion(type: TypeInfo | null): TypeInfo | null {
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
export function derefNamedType(type: TypeInfo, meta: EvidenceMetadata): TypeInfo {
  if (type.kind === 'object' && type.inherits) {
    // An inline intersection (the props type of `props: Base & {...}`): its
    // constituents are carried on the type itself, no declaration to look up.
    return { ...type, properties: collectDefinitionMembers(type, meta, new Set()).members }
  }
  if (type.kind !== 'interface') return type
  if (type.properties && type.properties.length > 0) return type
  const name = baseTypeName(type.raw)
  const def = meta.typeDefinitions.find((d) => d.name === name)
  if (!def?.properties && !def?.inherits) return type
  const { members } = collectDefinitionMembers(def, meta, new Set([name]))
  return members.length > 0 || def.properties ? { ...type, properties: members } : type
}

/** A type that inherits members: a `TypeDefinition`, or an inline intersection `TypeInfo`. */
type InheritingType = Pick<TypeDefinition, 'properties' | 'inherits' | 'inheritance'>

/**
 * The inheriting type behind a receiver type, and the names already being
 * walked: a named type resolves through `typeDefinitions`, an inline
 * intersection is its own definition. `null` for any other type.
 */
function inheritingTypeOf(type: TypeInfo | null, meta: EvidenceMetadata): { def: InheritingType; visiting: Set<string> } | null {
  if (!type) return null
  if (type.kind === 'object' && type.inherits) return { def: type, visiting: new Set() }
  if (type.kind !== 'interface') return null
  const name = baseTypeName(type.raw)
  const def = meta.typeDefinitions.find((d) => d.name === name)
  return def ? { def, visiting: new Set([name]) } : null
}

/** A definition's resolved members, plus the names whose intersected types cannot be reconciled. */
interface MemberSet {
  members: PropertyInfo[]
  conflicts: Set<string>
}

/** `unknown` / `any` carry no information: in an intersection the other side refines them. */
function isUninformative(t: TypeInfo): boolean {
  return t.kind === 'unknown' && (t.raw === 'unknown' || t.raw === 'any')
}

const CONFLICTING_TYPE: TypeInfo = { kind: 'unknown', raw: 'unknown' }

function unionArms(t: TypeInfo): readonly TypeInfo[] {
  return t.kind === 'union' && t.unionTypes ? t.unionTypes : [t]
}

/** Whether every arm of `sub` is one of the arms of `sup` (same kind and spelling), so `sub` <: `sup`. */
function isSubtypeByArms(sub: TypeInfo, sup: TypeInfo): boolean {
  const supArms = unionArms(sup)
  return unionArms(sub).every((a) => supArms.some((b) => a.kind === b.kind && a.raw === b.raw))
}

/**
 * Intersect two declarations of the same member: the type is the
 * intersection of both, independent of order. An uninformative side
 * (`unknown` / `any`) defers to the other. When one side's union arms are
 * all arms of the other (`Date` vs `Date | null`, or two identical types),
 * the intersection is the narrower side. Anything else is irreconcilable
 * here (`null` — the caller records a conflict and drops the type).
 */
function intersectMemberTypes(a: TypeInfo, b: TypeInfo): TypeInfo | null {
  if (isUninformative(a)) return b
  if (isUninformative(b)) return a
  if (isSubtypeByArms(a, b)) return a
  if (isSubtypeByArms(b, a)) return b
  return null
}

/** Merge member sets as an intersection (`A & B`): order-independent per member. */
function intersectMemberSets(sets: readonly MemberSet[]): MemberSet {
  const byName = new Map<string, PropertyInfo>()
  const conflicts = new Set<string>()
  for (const set of sets) {
    for (const c of set.conflicts) conflicts.add(c)
    for (const p of set.members) {
      const prev = byName.get(p.name)
      if (!prev) {
        byName.set(p.name, p)
        continue
      }
      const type = conflicts.has(p.name) ? null : intersectMemberTypes(prev.type, p.type)
      if (!type) conflicts.add(p.name)
      byName.set(p.name, {
        ...prev,
        type: type ?? CONFLICTING_TYPE,
        optional: prev.optional && p.optional,
        readonly: prev.readonly || p.readonly,
      })
    }
  }
  return { members: [...byName.values()], conflicts }
}

/**
 * A definition's own members combined with every member it inherits (#3914),
 * so a `Date` declared on a base is as visible as one declared on the type
 * itself. `extends`: an own member overrides an inherited one of the same
 * name (TypeScript's override rule), and among bases the first declared
 * wins. Intersection: the arms combine per member with
 * `intersectMemberSets`, so `Base & { at: Date }` and `{ at: Date } & Base`
 * agree. `visiting` breaks a cyclic chain (invalid TypeScript, but never an
 * infinite walk here).
 */
function collectDefinitionMembers(def: InheritingType, meta: EvidenceMetadata, visiting: Set<string>): MemberSet {
  const own: MemberSet = { members: [...(def.properties ?? [])], conflicts: new Set() }
  const inherited = (def.inherits ?? []).map((base) => inheritedMembers(base, meta, visiting))
  if (def.inheritance === 'intersection') return intersectMemberSets([own, ...inherited])
  const members = [...own.members]
  const conflicts = new Set<string>()
  const known = new Set(members.map((p) => p.name))
  for (const set of inherited) {
    for (const c of set.conflicts) conflicts.add(c)
    for (const p of set.members) {
      if (known.has(p.name)) continue
      known.add(p.name)
      members.push(p)
    }
  }
  // An own member overrides a conflicting inherited one.
  for (const p of own.members) conflicts.delete(p.name)
  return { members, conflicts }
}

function inheritedMembers(base: TypeInfo, meta: EvidenceMetadata, visiting: Set<string>): MemberSet {
  const empty: MemberSet = { members: [], conflicts: new Set() }
  if (base.kind === 'object') return { members: base.properties ?? [], conflicts: new Set() }
  if (base.kind !== 'interface') return empty
  const name = baseTypeName(base.raw)
  if (visiting.has(name)) return empty
  const def = meta.typeDefinitions.find((d) => d.name === name)
  if (!def) return empty
  return collectDefinitionMembers(def, meta, new Set(visiting).add(name))
}

/**
 * The member names of a named type whose inherited declarations cannot be
 * reconciled (`Base & { at: Date }` where `Base.at` is `string`). Their type
 * is reported as `unknown`; callers that would otherwise lower on the member
 * must refuse instead (#3914).
 */
export function inheritedMemberConflicts(type: TypeInfo | null, meta: EvidenceMetadata): ReadonlySet<string> {
  const found = inheritingTypeOf(stripUnion(type), meta)
  return found ? collectDefinitionMembers(found.def, meta, found.visiting).conflicts : new Set()
}

/**
 * Whether `type` is a named type whose inheritance chain reaches a base that
 * is not declared in this file (an imported interface, a library type) or
 * that is not a plain reference/object literal, so its members are NOT all
 * visible here. Evidence lookups on such a type can miss a member the base
 * declares, which callers must treat as "unknown", never as "absent" (#3914).
 */
export function hasUnresolvedBase(type: TypeInfo | null, meta: EvidenceMetadata): boolean {
  const found = inheritingTypeOf(stripUnion(type), meta)
  return found ? definitionHasUnresolvedBase(found.def, meta, found.visiting) : false
}

function definitionHasUnresolvedBase(def: InheritingType, meta: EvidenceMetadata, visiting: Set<string>): boolean {
  return (def.inherits ?? []).some((base) => {
    if (base.kind === 'object') return false
    if (base.kind !== 'interface') return true
    const name = baseTypeName(base.raw)
    if (visiting.has(name)) return false
    const baseDef = meta.typeDefinitions.find((d) => d.name === name)
    return !baseDef || definitionHasUnresolvedBase(baseDef, meta, new Set(visiting).add(name))
  })
}

/**
 * Why a receiver expression's type evidence cannot be trusted at some step of
 * its member chain (#3914), or `null` when every step resolves:
 *   - `'conflict'`: the step's member is declared by several intersection arms
 *     with irreconcilable types, so its type was reported as `unknown`;
 *   - `'hidden'`: the member is not visible on the containing type, which
 *     inherits from a base declared outside this file (it may live there).
 * Checked at EVERY depth (`props.data.at` inspects `Data` for `at`, and the
 * props type for `data`), so evidence lost to an unsupported intersection or
 * an unseen base is never mistaken for "not a rich type". Shares
 * `resolveReceiverType`'s prop-membership rules.
 */
export function receiverEvidenceLoss(
  expr: ParsedExpr,
  meta: EvidenceMetadata,
  bindings: ReadonlyMap<string, TypeInfo | null>,
): { prop: string; reason: 'conflict' | 'hidden' } | null {
  let containing: TypeInfo | null
  let prop: string
  if (expr.kind === 'identifier') {
    if (bindings.has(expr.name) || meta.propsObjectName !== null) return null
    const param = meta.propsParams.find((p) => p.name === expr.name && !p.isRest)
    if (!param) return null
    containing = meta.propsType
    prop = param.sourceName ?? param.name
  } else if (expr.kind === 'member' && !expr.computed) {
    const inner = receiverEvidenceLoss(expr.object, meta, bindings)
    if (inner) return inner
    containing = resolveReceiverType(expr.object, meta, bindings)
    prop = expr.property
  } else {
    return null
  }
  const stripped = stripUnion(containing)
  if (!stripped || !inheritingTypeOf(stripped, meta)) return null
  if (inheritedMemberConflicts(stripped, meta).has(prop)) return { prop, reason: 'conflict' }
  const visible = derefNamedType(stripped, meta).properties?.some((p) => p.name === prop)
  return !visible && hasUnresolvedBase(stripped, meta) ? { prop, reason: 'hidden' } : null
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
 * Resolve a prop's declared type straight off `propsType` by its SOURCE
 * name (`lookupProperty`'s public face for `checkRichTypePropSerialization`,
 * which has no receiver expression to walk — only a `propsParams` entry).
 */
export function resolvePropDeclaredType(propName: string, meta: EvidenceMetadata): TypeInfo | null {
  return lookupProperty(meta.propsType, propName, meta)
}

/**
 * The JSON-unsafe type name a declared prop type resolves to, or `null` if
 * it isn't one. Recognizes:
 *   - an interface-kind type whose `baseTypeName` is in
 *     `JSON_UNSAFE_RICH_TYPE_NAMES` (caller must still apply the in-file
 *     `typeDefinitions` shadow guard — this function has no `meta` to check
 *     it against, mirroring `checkRichTypeMethodCalls`'s own split between
 *     type resolution and shadow-checking);
 *   - the KEYWORD spellings `bigint` / `symbol`, which `typeNodeToTypeInfo`
 *     lowers to `{ kind: 'unknown', raw: '<keyword>' }` (only the object-form
 *     `BigInt` / `Symbol` type references reach `kind: 'interface'` and match
 *     the catalogue above) — an exact-equality check on the AST-derived raw
 *     text, the same class of raw use as `baseTypeName`, not a type-syntax
 *     parse. Closes this module's own documented conservative miss, but only
 *     for THIS check — `HOST_RICH_TYPE_NAMES`/method-call refusal still miss
 *     the keyword spellings, unchanged.
 */
export function jsonUnsafeTypeName(type: TypeInfo | null): string | null {
  if (!type) return null
  if (type.kind === 'interface') {
    const name = baseTypeName(type.raw)
    return JSON_UNSAFE_RICH_TYPE_NAMES.has(name) ? name : null
  }
  if (type.kind === 'unknown' && (type.raw === 'bigint' || type.raw === 'symbol')) {
    return type.raw
  }
  return null
}

/**
 * Resolve the TypeInfo of a receiver expression, using only propsType /
 * propsParams / typeDefinitions and the caller-supplied local bindings.
 * `bindings` maps a name to its known type — or explicitly to `null` for a
 * shadow the caller has proven carries no evidence (e.g. an arrow param, a
 * loop item whose array type isn't known). A `bindings` hit always wins over
 * the props fallback, matching JS lexical shadowing.
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
    if (meta.propsObjectName !== null) {
      // Object-props mode: props are only reachable through the props object,
      // so a bare identifier is never a prop — treating every name that
      // happens to match a propsType field as one would misattribute module
      // consts / imports that share a field's name.
      return expr.name === meta.propsObjectName ? stripUnion(meta.propsType) : null
    }
    // Destructured mode: only a declared param binding is a prop (membership
    // via propsParams, which carries LOCAL names — including rename targets).
    // The TYPE must come from propsType.properties keyed by the SOURCE prop
    // name: propsParams' own `type` degrades to `unknown` for non-primitive
    // props (`collectMemberTypes`' primitives-only gate).
    const param = meta.propsParams.find((p) => p.name === expr.name && !p.isRest)
    if (!param) return null
    return lookupProperty(meta.propsType, param.sourceName ?? param.name, meta)
  }
  if (expr.kind === 'member' && !expr.computed) {
    const objType = resolveReceiverType(expr.object, meta, bindings)
    return lookupProperty(objType, expr.property, meta)
  }
  return null
}
