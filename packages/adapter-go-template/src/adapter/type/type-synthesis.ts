/**
 * Go type synthesis and the per-compile type tables (#3425): the decisions
 * about which Go types a component's generated file declares and resolves
 * named types against, as free functions over a {@link GoEmitContext}.
 *
 * - {@link buildLocalTypeTables} seeds `state.localTypeNames` /
 *   `localTypeAliases` / `localStructFields` from the file's own type
 *   definitions and the types it imports, through the adapter's cross-file
 *   type registry.
 * - {@link synthesizeStructsFromElements} infers one Go struct (plus any
 *   nested array-of-objects struct) from an untyped object-literal array.
 * - {@link resolveNestedLoopItemTypes} resolves the row type of a loop whose
 *   `itemType` is null, synthesizing a struct for an untyped module-const
 *   array.
 *
 * The adapter's type generation calls them through a {@link TypeSynthesisHost}.
 */

import { readFileSync } from 'node:fs'

import {
  analyzeComponent,
  buildMetadata,
  listComponentFunctions,
  resolveRelativeImportToFile,
  type ComponentIR,
  type ConstantInfo,
  type ImportInfo,
  type ParsedExpr,
  type PropertyInfo,
  type SourceLocation,
  type TypeDefinition,
  type TypeInfo,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { loopArraySignal } from '../analysis/component-tree.ts'
import { findModuleScopeConst } from '../lib/compile-state.ts'
import { GO_IDENTIFIER, capitalizeFieldName } from '../lib/go-naming.ts'
import type { NestedComponentInfo } from '../lib/types.ts'
import { resolveBlockBodyMemoModuleConst } from '../memo/memo-value.ts'
import { planSynthPropStructs } from './synth-prop-structs.ts'
import { signalLoopRows } from './state-fields.ts'

/**
 * What the type synthesis needs from the adapter beyond the shared
 * {@link GoEmitContext}: the cross-file type registry (long-lived across
 * compiles), the struct field derivation and emission, and two loop-array
 * lookups. Kept out of `GoEmitContext` because only this module reads them.
 */
export interface TypeSynthesisHost {
  readonly ctx: GoEmitContext
  /** Imported type name → Go alias backing (`'string'` for a string-literal union). */
  crossFileTypeAliases(): Map<string, string>
  /** Imported struct name → (tsName → Go field name). */
  crossFileStructFields(): Map<string, Map<string, string>>
  /** Imported struct name → its `TypeDefinition`. */
  crossFileTypeDefinitions(): Map<string, TypeDefinition>
  /** Definer files `ensureCrossFileTypes` already scanned. */
  scannedCrossFileSources(): Set<string>
  /** The Go struct fields of a named type or an anonymous object type. */
  structFieldsFor(owner: string, td: { properties?: PropertyInfo[] }): Array<{ tsName: string; goName: string; goType: string; nullableSeed: boolean }>
  /** Register a synthesized struct in the type tables and emit its declaration. */
  registerSynthStruct(
    lines: string[],
    name: string,
    fields: Array<{ tsName: string; goName: string; goType: string }>,
    properties: PropertyInfo[],
    comment: string,
  ): void
  /** The constructor-side row source of a loop over an array prop, else null. */
  propArrayLoopRowSource(ir: ComponentIR, nested: NestedComponentInfo): { itemType: TypeInfo } | null
  /** A memo name from a loop array like `sortedData()`, else null. */
  extractMemoNameFromLoopArray(loopArray: string | undefined): string | null
  makeLoc(): SourceLocation
}

/**
 * Whether every row of an object-literal array names the same keys, in any
 * order. Only picks the BF101 wording when `resolveNestedLoopItemTypes`
 * can't synthesize a struct for an untyped loop array (#3178).
 */
function rowsShareKeys(rows: ParsedExpr[]): boolean {
  const keySet = (row: ParsedExpr) =>
    row.kind === 'object-literal'
      ? row.properties.flatMap(p => (p.kind === 'prop' ? [p.key] : [])).sort().join('\0')
      : null
  const first = keySet(rows[0])
  return rows.every(row => keySet(row) === first)
}

/**
 * The recursive core of `synthesizeStructFromSignal`: given a list of
 * object-literal elements known to share ONE shape, and the Go struct
 * name to assign that shape, returns the synthesized struct(s) — this
 * shape's own struct last, any nested array-of-objects field's struct(s)
 * before it — or `null` on any shape this fast path doesn't bake.
 *
 * A nested array-of-objects field is validated and shaped from the FLAT
 * concatenation of that key's elements across every row (not just the
 * first row) — a later row's own object shape for that key must still
 * agree, but the nested struct's field set is inferred from every row's
 * contribution so no row's data is silently dropped from the type.
 */
export function synthesizeStructsFromElements(
  ctx: GoEmitContext,
  elements: ParsedExpr[],
  name: string,
): Array<{ name: string; fields: Array<{ tsName: string; goName: string; goType: string }>; properties: PropertyInfo[] }> | null {
  // Don't shadow an existing (user-defined or already-synthesised) type.
  if (ctx.state.localTypeNames.has(name)) return null

  const rowShapes = collectRowShapes(elements)
  if (!rowShapes) return null
  const { order, shapes, nestedElements } = rowShapes

  const nestedStructs: Array<{ name: string; fields: Array<{ tsName: string; goName: string; goType: string }>; properties: PropertyInfo[] }> = []
  const fields: Array<{ tsName: string; goName: string; goType: string }> = []
  const properties: PropertyInfo[] = []

  for (const key of order) {
    const shape = shapes.get(key)!
    if (shape.kind === 'scalar') {
      fields.push({ tsName: key, goName: capitalizeFieldName(key), goType: shape.goType })
      properties.push({ name: key, type: scalarGoTypeToTypeInfo(shape.goType), optional: false, readonly: false })
      continue
    }
    const nestedList = nestedElements.get(key)!
    // Every row's array for this key was empty — no row's data to infer
    // a shape from (distinct from a MISSING key, already ruled out
    // above); matches the top-level empty-array rule this function
    // already applies to the signal's own outer array.
    if (nestedList.length === 0) return null
    const nestedName = `${name}${capitalizeFieldName(key)}Item`
    const nested = synthesizeStructsFromElements(ctx, nestedList, nestedName)
    if (!nested) return null
    nestedStructs.push(...nested)
    fields.push({ tsName: key, goName: capitalizeFieldName(key), goType: `[]${nestedName}` })
    properties.push({ name: key, type: synthSliceTypeInfo(nestedName), optional: false, readonly: false })
  }

  return [...nestedStructs, { name, fields, properties }]
}

type PropShape = { kind: 'scalar'; goType: string } | { kind: 'nested-array' }

/** The per-key shapes `collectRowShapes` reads off the rows, in first-row key order. */
type RowShapes = {
  order: string[]
  shapes: Map<string, PropShape>
  nestedElements: Map<string, ParsedExpr[]>
}

/**
 * `synthesizeStructsFromElements`'s shape pass: the field order and per-key
 * shape of a list of object-literal rows, or `null` when the rows don't
 * share one shape this fast path bakes.
 */
function collectRowShapes(elements: ParsedExpr[]): RowShapes | null {
  // Field order + per-key shape from the first element; every other
  // element must match exactly (same keys, same shape KIND per key).
  const order: string[] = []
  const shapes = new Map<string, PropShape>()
  const nestedElements = new Map<string, ParsedExpr[]>()
  const rowShapes: RowShapes = { order, shapes, nestedElements }

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    if (el.kind !== 'object-literal') return null
    const seen = new Set<string>()
    for (const prop of el.properties) {
      // A spread (`{ ...t, a: 1 }`, #2696 Step 2) isn't a plain per-key
      // scalar shape this fast path bakes — fall back (the caller's
      // `ts.createSourceFile` path, or refusal) rather than mis-baking.
      if (prop.kind === 'spread') return null
      if (prop.shorthand) return null
      const key = prop.key
      if (!GO_IDENTIFIER.test(key)) return null
      seen.add(key)

      if (!recordPropShape(rowShapes, i, key, prop.value)) return null
    }
    // A first-element key missing here → shape differs.
    if (seen.size !== order.length) return null
  }

  return rowShapes
}

/**
 * Record one row's `key: value` into the shapes, or return false when it
 * disagrees with the shape the earlier rows gave that key.
 */
function recordPropShape(rowShapes: RowShapes, i: number, key: string, value: ParsedExpr): boolean {
  const { order, shapes, nestedElements } = rowShapes
  const isNestedArray =
    value.kind === 'array-literal' &&
    value.elements.every(e => e.kind === 'object-literal')

  if (isNestedArray) {
    const prevShape = shapes.get(key)
    if (prevShape === undefined) {
      if (i !== 0) return false // key absent from the first element → shape differs
      order.push(key)
      shapes.set(key, { kind: 'nested-array' })
      nestedElements.set(key, [])
    } else if (prevShape.kind !== 'nested-array') {
      return false // this key is a scalar in some rows, a nested array in others
    }
    nestedElements.get(key)!.push(...(value as { elements: ParsedExpr[] }).elements)
    return true
  }

  const goType = scalarParsedGoType(value)
  if (!goType) return false
  const prevShape = shapes.get(key)
  if (prevShape === undefined) {
    if (i !== 0) return false
    order.push(key)
    shapes.set(key, { kind: 'scalar', goType })
  } else if (prevShape.kind !== 'scalar') {
    return false
  } else {
    if (prevShape.goType !== goType) return false
  }
  return true
}

/** `PropertyInfo.type` for a scalar Go field type — consumed only as a
 * defensive/consistent fill; `parsedLiteralToGo`'s object branch never
 * looks up a SCALAR property's declared type (only array/object ones),
 * so this never actually gates a bake, unlike `synthSliceTypeInfo`. */
function scalarGoTypeToTypeInfo(goType: string): TypeInfo {
  if (goType === 'string') return { kind: 'primitive', raw: 'string', primitive: 'string' }
  if (goType === 'bool') return { kind: 'primitive', raw: 'boolean', primitive: 'boolean' }
  return { kind: 'primitive', raw: 'number', primitive: 'number' }
}

/**
 * `TypeInfo` for "an array of the named synthesized struct" — the exact
 * shape both `emitSynthStructs`'s `synthStructTypes` entry (the signal's
 * OWN field type) and a nested array-of-objects field's `PropertyInfo`
 * need, so `parsed-literal-to-go.ts`'s `structPropertyType` resolves a
 * nested array property the identical way it resolves the signal's own
 * top-level type.
 */
export function synthSliceTypeInfo(name: string): TypeInfo {
  return { kind: 'array', raw: `${name}[]`, elementType: { kind: 'interface', raw: name } }
}

/**
 * Go type for a scalar-literal `ParsedExpr` field value, else `null` (caller
 * bails out of synthesis). string/no-substitution template → `string`;
 * numeric (optionally negated) → `float64`, a TS `number` whatever its
 * literal; boolean → `bool`.
 */
function scalarParsedGoType(value: ParsedExpr): string | null {
  // `-5` is a unary minus over a numeric literal; classify by the inner one.
  if (value.kind === 'unary' && value.op === '-' && value.argument.kind === 'literal') {
    return value.argument.literalType === 'number' ? 'float64' : null
  }
  if (value.kind !== 'literal') return null
  if (value.literalType === 'string') return 'string'
  if (value.literalType === 'number') return 'float64'
  if (value.literalType === 'boolean') return 'bool'
  return null
}
/**
 * Populate the cross-file type registry from one file's own declared
 * types (#2984). Shared by `buildLocalTypeTables`'s same-file loop and
 * `ensureCrossFileTypes`'s on-demand scan (#2992) so the two paths can
 * never register a type differently. Always overwrites — a later (real)
 * compile is authoritative over an earlier speculative one.
 */
function registerCrossFileTypes(host: TypeSynthesisHost, typeDefinitions: readonly TypeDefinition[], componentName: string): void {
  for (const td of typeDefinitions) {
    if (td.name === 'Props' || td.name === `${componentName}Props`) continue
    if (td.name.endsWith('Props')) continue
    if (td.stringLiteralUnion) {
      host.crossFileTypeAliases().set(td.name, 'string')
    } else {
      const fields = host.structFieldsFor(td.name, td)
      if (fields.length > 0) {
        host.crossFileStructFields().set(td.name, new Map(fields.map(f => [f.tsName, f.goName])))
        host.crossFileTypeDefinitions().set(td.name, td)
      }
    }
  }
}

/**
 * #2992: for each relative import whose specifier isn't registered into
 * the cross-file type registry yet (typically because the defining file
 * sorts after this consumer in `@barefootjs/vite`'s alphabetical
 * discovery order, `packages/vite/src/discover.ts`), resolve it on disk
 * and register its types via `registerCrossFileTypes` directly — the same
 * registration a real compile of that file performs, so resolution no
 * longer depends on discovery order.
 *
 * Narrow by design: only scans a definer exporting at least one component
 * (`listComponentFunctions`) — a component-less file never gets a Go
 * struct emitted anywhere. No shared `ts.Program`/checker: `structFieldsFor`
 * needs the analyzer's syntactic shape, and a checker-based second path
 * for the same question would risk diverging from it.
 */
function ensureCrossFileTypes(host: TypeSynthesisHost, imports: readonly ImportInfo[]): void {
  for (const imp of imports) {
    if (!imp.source.startsWith('.')) continue
    const stillUnresolved = imp.specifiers.some(spec =>
      !spec.isDefault && !spec.isNamespace &&
      !host.crossFileTypeAliases().has(spec.name) &&
      !host.crossFileStructFields().has(spec.name),
    )
    if (!stillUnresolved) continue
    const resolved = resolveRelativeImportToFile(imp.source, imp.loc.file)
    if (!resolved || host.scannedCrossFileSources().has(resolved)) continue
    host.scannedCrossFileSources().add(resolved)
    let source: string
    try {
      source = readFileSync(resolved, 'utf8')
    } catch {
      continue
    }
    const componentNames = listComponentFunctions(source, resolved)
    if (componentNames.length === 0) continue
    for (const compName of componentNames) {
      const meta = buildMetadata(analyzeComponent(source, resolved, compName))
      // Seed the definer's own anonymous-object synth names (#2674) and
      // named-type tables (`seedLocalTypeTables` below) — both are needed
      // for `structFieldsFor`/`registerCrossFileTypes` to resolve a
      // nested field correctly, whichever shape it is. All swapped back
      // after so nothing leaks into the CONSUMER's own type tables.
      const prevSynthNames = host.ctx.state.synthObjectStructNames
      const prevLocalTypeNames = host.ctx.state.localTypeNames
      const prevLocalTypeAliases = host.ctx.state.localTypeAliases
      const prevLocalStructFields = host.ctx.state.localStructFields

      host.ctx.state.synthObjectStructNames = new Map()
      for (const entry of planSynthPropStructs(meta, compName)) {
        host.ctx.state.synthObjectStructNames.set(entry.typeInfo, entry.name)
      }
      seedLocalTypeTables(host, meta.typeDefinitions, compName)
      registerCrossFileTypes(host, meta.typeDefinitions, compName)

      host.ctx.state.synthObjectStructNames = prevSynthNames
      host.ctx.state.localTypeNames = prevLocalTypeNames
      host.ctx.state.localTypeAliases = prevLocalTypeAliases
      host.ctx.state.localStructFields = prevLocalStructFields
    }
  }
}

/**
 * Seed `state.localTypeNames`/`localTypeAliases`/`localStructFields` from
 * one file's own type definitions. `typeInfoToGo`'s `'interface'` case
 * (`type/type-codegen.ts`) resolves a named-type field only against these
 * three maps, never the class-private `crossFile*` registry — so this
 * must run before resolving any field that names another type the same
 * file declares (`Dashboard.widget: Widget`). Shared by
 * `buildLocalTypeTables`'s same-file path and `ensureCrossFileTypes`'s
 * speculative scan (#2992 review) — one implementation.
 */
function seedLocalTypeTables(host: TypeSynthesisHost, typeDefinitions: readonly TypeDefinition[], componentName: string): void {
  host.ctx.state.localTypeNames = new Set<string>()
  host.ctx.state.localTypeAliases = new Map<string, string>()
  host.ctx.state.localStructFields = new Map<string, Map<string, string>>()
  for (const td of typeDefinitions) {
    // Skip the Props type (not reusable) and child Props (emitted by the child).
    if (td.name === 'Props' || td.name === `${componentName}Props`) continue
    if (td.name.endsWith('Props')) continue
    host.ctx.state.localTypeNames.add(td.name)
    if (td.stringLiteralUnion) {
      host.ctx.state.localTypeAliases.set(td.name, 'string')
    } else {
      // Source-key → Go-field-name map for the baker, from the same field
      // derivation the struct emitter uses.
      const fields = host.structFieldsFor(td.name, td)
      if (fields.length > 0) {
        host.ctx.state.localStructFields.set(td.name, new Map(fields.map(f => [f.tsName, f.goName])))
      }
    }
  }
}

/**
 * Seed the consumer's local type tables for one compile: its own type
 * definitions plus every relatively imported type the cross-file registry
 * knows, registering its own types for later siblings (#2984, #2992).
 */
export function buildLocalTypeTables(host: TypeSynthesisHost, ir: ComponentIR, componentName: string): void {
  // Resolve any not-yet-registered cross-file type first, so this
  // component's resolution below doesn't depend on discovery order (#2992).
  ensureCrossFileTypes(host, ir.metadata.imports)

  seedLocalTypeTables(host, ir.metadata.typeDefinitions, componentName)
  // Register this component's OWN types too, so a sibling compiled later
  // resolves them the ordinary way (#2984).
  registerCrossFileTypes(host, ir.metadata.typeDefinitions, componentName)

  // A type merely IMPORTED (never declared) in this file — most often a
  // child component's own prop-shape type — resolves against the
  // cross-file registry. Relative imports only: a bare specifier can't
  // name a BarefootJS component module, and matching an ecosystem
  // package's export by name alone risks a false-positive collision.
  for (const imp of ir.metadata.imports) {
    if (!imp.source.startsWith('.')) continue
    for (const spec of imp.specifiers) {
      if (spec.isDefault || spec.isNamespace) continue
      registerImportedType(host, spec)
    }
  }
}

/**
 * `buildLocalTypeTables`'s per-specifier step: register one relatively
 * imported name into the consumer's local type tables from the cross-file
 * registry, unless a same-named local declaration already owns it.
 */
function registerImportedType(host: TypeSynthesisHost, spec: ImportInfo['specifiers'][number]): void {
  const localName = spec.alias ?? spec.name
  // A same-named local declaration always wins — never overwritten by
  // an unrelated import that merely shares the name.
  if (host.ctx.state.localTypeNames.has(localName)) return
  const aliasBacking = host.crossFileTypeAliases().get(spec.name)
  if (aliasBacking !== undefined) {
    host.ctx.state.localTypeNames.add(localName)
    host.ctx.state.localTypeAliases.set(localName, aliasBacking)
    return
  }
  const fieldMap = host.crossFileStructFields().get(spec.name)
  if (fieldMap) {
    host.ctx.state.localTypeNames.add(localName)
    host.ctx.state.localStructFields.set(localName, fieldMap)
    // Make the borrowed struct's OWN property types visible to
    // `structPropertyType` too, so a composite-literal initial value
    // (`createSignal<Dashboard>({ title: 'hello', ... })`) bakes its
    // scalar fields against the real declared types instead of the
    // zero-value struct fallback (`Dashboard{}`) `jsLiteralToGo`
    // returns for an object type it can't find any properties for.
    // `primeCompileState` assigns `currentTypeDefinitions` the SAME
    // array reference as `ir.metadata.typeDefinitions` (no clone,
    // #2674's own docstring on `emitSynthPropStructs`) — rebuild the
    // array rather than pushing in place, or this would mutate the
    // CONSUMER's own IR metadata, corrupting it for any later re-read.
    const td = host.crossFileTypeDefinitions().get(spec.name)
    if (td) {
      if (!host.ctx.state.currentTypeDefinitions.some(t => t.name === localName)) {
        host.ctx.state.currentTypeDefinitions = [
          ...host.ctx.state.currentTypeDefinitions,
          localName === td.name ? td : { ...td, name: localName },
        ]
      }
      // A property of the borrowed type may itself name ANOTHER type
      // the same definer declares (`Dashboard.widget: Widget`) that
      // this consumer never imports directly — pull those in too, or
      // baking falls back to `map[string]interface{}` (#2992 review).
      //
      // Deliberately outside the dedup guard above: `buildLocalTypeTables`
      // runs twice per compile, and the second run's `seedLocalTypeTables`
      // reset would otherwise wipe what the first run added here. This
      // walk re-checks `localTypeNames` itself, so it's safely idempotent
      // to run unconditionally.
      for (const prop of td.properties ?? []) {
        registerTransitiveCrossFileTypes(host, prop.type, new Set([localName, td.name]))
      }
    }
  }
}

/**
 * Recursively register a borrowed type's own nested named-type
 * references into the consumer's local type tables (#2992 review) — see
 * the call site above for why.
 */
function registerTransitiveCrossFileTypes(host: TypeSynthesisHost, typeInfo: TypeInfo | undefined, visited: Set<string>): void {
  if (!typeInfo) return
  if (typeInfo.kind === 'array') {
    registerTransitiveCrossFileTypes(host, typeInfo.elementType, visited)
    return
  }
  if (typeInfo.kind !== 'interface' || !typeInfo.raw) return
  const name = typeInfo.raw
  if (visited.has(name)) return
  visited.add(name)
  if (host.ctx.state.localTypeNames.has(name)) return

  const aliasBacking = host.crossFileTypeAliases().get(name)
  if (aliasBacking !== undefined) {
    host.ctx.state.localTypeNames.add(name)
    host.ctx.state.localTypeAliases.set(name, aliasBacking)
    return
  }
  const fieldMap = host.crossFileStructFields().get(name)
  if (!fieldMap) return
  host.ctx.state.localTypeNames.add(name)
  host.ctx.state.localStructFields.set(name, fieldMap)
  const td = host.crossFileTypeDefinitions().get(name)
  if (td && !host.ctx.state.currentTypeDefinitions.some(t => t.name === name)) {
    host.ctx.state.currentTypeDefinitions = [...host.ctx.state.currentTypeDefinitions, td]
    for (const prop of td.properties ?? []) {
      registerTransitiveCrossFileTypes(host, prop.type, visited)
    }
  }
}

/**
 * Fill `loopItemType` on every nested loop component that has none, from
 * the source array's declared or synthesized element type.
 */
export function resolveNestedLoopItemTypes(
  host: TypeSynthesisHost,
  lines: string[],
  ir: ComponentIR,
  componentName: string,
  nestedComponents: NestedComponentInfo[],
): void {
  // When a loop's `itemType` is null, resolve the element type from the source
  // array so wrapper structs get correct datum fields. Three cases:
  //   1. Memo-derived: `sortedData()` → resolve through the memo's SSR path to
  //      the module const it returns (block-body memo baking).
  //   2. Direct module const with a DECLARED element type (`const opts: Opt[]`)
  //      → look up the constant directly.
  //   3. Direct module const with NO declared type at all (`const opts = [{…}]`,
  //      #3178) → same shape as (2) structurally, but nothing already resolved
  //      an element type to borrow — synthesize one from the literal itself.
  for (const nested of nestedComponents) {
    // A signal-array loop (`rows()`): the row type the constructor's rows
    // are built with (`signalLoopRows`), even over a type the IR carries,
    // and none when it builds no rows.
    const signal = loopArraySignal(nested, ir.metadata.signals, host.ctx.state.getterAliases)
    if (signal) {
      nested.loopItemType = signalLoopRows(host.ctx, signal, ir.metadata.propsParams)?.itemType ?? null
      continue
    }
    if (nested.loopItemType || !nested.loopArray) continue

    // Case 0: an array prop's own element type (`propArrayLoopRowSource`).
    // A bodyless row has no wrapper to carry datum fields.
    const propRows = nested.bodyChildren?.length ? host.propArrayLoopRowSource(ir, nested) : null
    if (propRows) {
      nested.loopItemType = propRows.itemType
      continue
    }

    // Case 1: memo-derived loop array (`sortedData()`)
    const memoName = host.extractMemoNameFromLoopArray(nested.loopArray)
    if (memoName) {
      resolveMemoLoopItemType(host, ir, nested, memoName)
      continue
    }

    // Case 2/3: direct module-const array reference (`opts`/`payments`)
    const directConst = findModuleScopeConst(host.ctx.state, nested.loopArray)
    if (directConst?.type?.elementType) {
      nested.loopItemType = directConst.type.elementType
      continue
    }

    // Case 3 (#3178): an UNTYPED object-literal array const has no
    // declared element type for (2) to borrow — `inferTypeFromValue`
    // (the analyzer's text-shaped fallback for an unannotated
    // declaration) only ever produces the bare `{kind:'array', raw:
    // 'unknown[]'}`, never a per-row shape. But when every row IS an
    // object literal sharing the same keys, that shape is just as
    // inferrable as a typed one — the same fast path `emitSynthStructs`
    // already applies to an untyped object-array SIGNAL (#2800).
    // Synthesizing + registering a named struct here (a) gives
    // `resolveLoopDatumFields` real datum fields for the wrapper struct,
    // and (b) — by folding the synthesized type back onto the constant's
    // OWN `type.elementType` below — gives `emitStaticBodyWrappers`'s
    // `convertInitialValue` → `parsedLiteralToGo` a concrete struct to
    // bake each row's object literal against. Without this, that bake
    // requires a pre-registered struct, finds none, defers the WHOLE
    // array to `nil`, and the loop silently drops from SSR with no
    // diagnostic. A non-uniform shape (mismatched keys, a spread, …)
    // still returns `null` here and falls through to that same
    // pre-existing `nil` fallback, unchanged.
    if (directConst && directConst.type?.kind === 'array' && !directConst.type.elementType) {
      resolveUntypedConstLoopItemType(host, lines, nested, directConst, componentName)
    }
  }
}

/**
 * `resolveNestedLoopItemTypes`'s case 1: a loop over a block-body memo
 * (`sortedData()`) borrows the element type of the module const the memo
 * returns.
 */
function resolveMemoLoopItemType(
  host: TypeSynthesisHost,
  ir: ComponentIR,
  nested: NestedComponentInfo,
  memoName: string,
): void {
  const memo = ir.metadata.memos.find(m => m.name === memoName)
  if (memo) {
    const blockReturn = resolveBlockBodyMemoModuleConst(host.ctx,
      memo, ir.metadata.signals,
    )
    if (blockReturn) {
      const constant = findModuleScopeConst(host.ctx.state, blockReturn.constName)
      if (constant?.type?.elementType) {
        nested.loopItemType = constant.type.elementType
      }
    }
  }
}

/**
 * `resolveNestedLoopItemTypes`'s case 3 (#3178): synthesize the row type of
 * a loop over an untyped module-const array and fold it onto the const, or
 * report BF101 when its object-literal rows can't share one Go struct.
 */
function resolveUntypedConstLoopItemType(
  host: TypeSynthesisHost,
  lines: string[],
  nested: NestedComponentInfo,
  directConst: ConstantInfo,
  componentName: string,
): void {
  const elementType = synthesizeModuleConstArrayItemType(host, lines, directConst, componentName)
  const parsed = directConst.parsed
  if (
    !elementType &&
    parsed?.kind === 'array-literal' &&
    parsed.elements.length > 0 &&
    parsed.elements.every(e => e.kind === 'object-literal')
  ) {
    // No Go struct to bake the rows against, so the array would bake to
    // `nil` and the loop would silently render empty. Skipped when
    // `renderLoop` already refused this loop array (a spread, shorthand
    // or function-valued row reads as a computed value there).
    if (host.ctx.state.refusedLoopArrayConsts.has(directConst.name)) return
    const sharedKeys = rowsShareKeys(parsed.elements)
    host.ctx.state.errors.push({
      code: 'BF101',
      severity: 'error',
      message: sharedKeys
        ? `Loop array \`${directConst.name}\` is an object-literal array with a field the Go template adapter can't give one Go type across its rows (for example a nested object, a \`null\`, a non-identifier key, an empty nested array, or a value whose type differs between rows), so it can't render its rows at SSR.`
        : `Loop array \`${directConst.name}\` is an object-literal array whose rows don't share one shape, so the Go template adapter can't infer an element type to render its rows at SSR.`,
      loc: host.makeLoc(),
      suggestion: {
        message: sharedKeys
          ? `Annotate \`${directConst.name}\` with an explicit element type (\`const ${directConst.name}: Item[] = [...]\`), or give each field a plain string, number or boolean literal of the same type in every row.`
          : `Give every row the same keys, or annotate \`${directConst.name}\` with an explicit element type (\`const ${directConst.name}: Item[] = [...]\`).`,
      },
    })
    return
  }
  if (elementType) {
    nested.loopItemType = elementType
    // Rebuild rather than mutate `directConst` in place (#2674's own
    // rule for `ir.metadata`-backed structures): `host.ctx.state
    // .localConstants` still aliases `ir.metadata.localConstants`
    // (`primeCompileState`) at this point, and mutating an element of
    // it in place would corrupt the CALLER's IR for any later re-read
    // (`generateTypes` can run more than once over the same `ir`, for
    // siblings). A fresh array with a fresh entry keeps every OTHER
    // consumer's reference to the original object (and array)
    // intact, while every LATER lookup through `host.ctx.state
    // .localConstants` — the only place `resolveLoopArraySourceConst`
    // ever reads from — sees the augmented type.
    host.ctx.state.localConstants = host.ctx.state.localConstants.map(c =>
      c === directConst ? { ...c, type: { ...c.type!, elementType } } : c,
    )
  }
}

/**
 * The module-const twin of `synthesizeStructFromSignal`/#2800 (#3178):
 * synthesize + register a named Go struct for an UNTYPED module-const
 * array's per-row shape, reusing the exact same `synthesizeStructsFromElements`
 * fast path and `registerSynthStruct` emission so the two synthesis call
 * sites — one for an untyped object-array SIGNAL, one for an untyped
 * object-array module CONST — can't independently drift on what counts as
 * a safely-synthesizable shape. Returns the top-level struct's `TypeInfo`
 * (an `interface` reference by name, the same shape `resolveNestedLoopItemTypes`'s
 * other two cases hand back) for the caller to fold onto the constant's
 * own `type.elementType`, or `null` when the elements don't share one
 * bakeable shape — the caller's existing `nil`-bake fallback covers that
 * case unchanged.
 */
function synthesizeModuleConstArrayItemType(
  host: TypeSynthesisHost,
  lines: string[],
  constant: ConstantInfo,
  componentName: string,
): TypeInfo | null {
  const node = constant.parsed
  if (!node || node.kind !== 'array-literal' || node.elements.length === 0) return null
  const name = `${componentName}${capitalizeFieldName(constant.name)}Item`
  const synth = synthesizeStructsFromElements(host.ctx, node.elements, name)
  if (!synth) return null
  for (const s of synth) {
    host.registerSynthStruct(
      lines,
      s.name,
      s.fields,
      s.properties,
      `// ${s.name} is a synthesised element type for the ${constant.name} constant.`,
    )
  }
  return { kind: 'interface', raw: name }
}
