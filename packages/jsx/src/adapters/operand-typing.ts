/**
 * Operand typing for the JS primitive plan (`spec/js-primitive-semantics.md`,
 * "Decision point"). One `collectOperandTyping` per component reads the
 * Phase-1 metadata (props with their optionality and declared types, signals,
 * memos, local constants, named types) into the facts a name read proves;
 * `typing.at(scope)` sees it through a `BindingScope`, so a loop or callback
 * binding shadows an outer name and a row read takes its type from
 * `ScopeBinding.row` (as `BindingScope.isStringValueName` does for strings).
 *
 * This module only answers "what does a read of this name prove". The
 * expression-level classifier is `operandFacts` (`primitive-plan.ts`).
 */

import type { IRMetadata, TypeInfo } from '../types.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import {
  BindingScope,
  PROPS_OBJECT_IDENTIFIER,
  loopValueTypeAt,
  type LoopValueType,
  type NamedTypeFields,
  type ScopeBinding,
} from '../scope/binding-scope.ts'

/** A JS type an operand can have at its read; `unknown` when not proven. */
export type OperandType = 'number' | 'string' | 'boolean' | 'nil' | 'object' | 'unknown'

/** Which JS value a host nil stands for at a read. */
export type NilReading = 'null' | 'undefined' | 'either'

/** What Phase-1 types prove about an operand at its read. */
export interface OperandFacts {
  /** The JS types the value can have; `unknown` when not proven. */
  readonly types: ReadonlySet<OperandType>
  /** Which JS value a nil stands for, when `types` has `nil`. */
  readonly nil?: NilReading
  /** A non-negative integer (a loop index binding). */
  readonly index?: boolean
  /**
   * The value is an array. Not in the design note's sketch: the `get` plan's
   * `array-index` proof needs the receiver proven an array, and `object`
   * alone does not tell an array from a record.
   */
  readonly array?: boolean
}

/** Facts proving nothing. */
export const UNKNOWN_FACTS: OperandFacts = { types: new Set<OperandType>(['unknown']) }

/** Facts of a value of exactly one JS type (never nil). */
export function factsOf(type: Exclude<OperandType, 'nil' | 'unknown'>): OperandFacts {
  return { types: new Set<OperandType>([type]) }
}

/** Facts of a nil read as `reading`. */
export function nilFacts(reading: Exclude<NilReading, 'either'>): OperandFacts {
  return { types: new Set<OperandType>(['nil']), nil: reading }
}

function mergeNil(a: NilReading | undefined, b: NilReading | undefined): NilReading | undefined {
  if (a === undefined) return b
  if (b === undefined || a === b) return a
  return 'either'
}

/**
 * The facts of a value that is one of `a` or `b`. An unknown member makes the
 * whole value unknown; `index` and `array` hold only when both hold.
 */
export function unionFacts(a: OperandFacts, b: OperandFacts): OperandFacts {
  if (a.types.has('unknown') || b.types.has('unknown')) return UNKNOWN_FACTS
  const types = new Set<OperandType>([...a.types, ...b.types])
  const nil = mergeNil(a.nil, b.nil)
  return {
    types,
    ...(nil !== undefined ? { nil } : {}),
    ...(a.index && b.index ? { index: true } : {}),
    ...(a.array && b.array ? { array: true } : {}),
  }
}

/** `facts` with the nil member removed (the value after a `??`). */
export function withoutNil(facts: OperandFacts): OperandFacts {
  if (!facts.types.has('nil')) return facts
  const types = new Set(facts.types)
  types.delete('nil')
  if (types.size === 0) return UNKNOWN_FACTS
  return { types, ...(facts.index ? { index: true } : {}), ...(facts.array ? { array: true } : {}) }
}

/** `facts` that may also be nil read as `reading`. */
export function withNil(facts: OperandFacts, reading: Exclude<NilReading, 'either'>): OperandFacts {
  return unionFacts(facts, nilFacts(reading))
}

/** Whether `facts` prove exactly the one type `type`, never nil. */
export function isExactly(facts: OperandFacts, type: OperandType): boolean {
  return facts.types.size === 1 && facts.types.has(type)
}

/** The one primitive type `facts` prove (never nil), or null. */
export function provenPrimitive(facts: OperandFacts): 'number' | 'string' | 'boolean' | null {
  if (facts.types.size !== 1) return null
  const [only] = facts.types
  return only === 'number' || only === 'string' || only === 'boolean' ? only : null
}

/** Whether `facts` prove the value is never nil. */
export function isNeverNil(facts: OperandFacts): boolean {
  return !facts.types.has('nil') && !facts.types.has('unknown')
}

/** The facts of a declared type (a `TypeInfo`, or the structural `LoopValueType` a row carries). */
export function factsOfType(type: LoopValueType | null | undefined): OperandFacts {
  if (!type) return UNKNOWN_FACTS
  if (type.kind === 'primitive') return factsOfPrimitive(type.primitive)
  if (type.kind === 'union' && type.unionTypes && type.unionTypes.length > 0) {
    return type.unionTypes.map(factsOfType).reduce(unionFacts)
  }
  if (type.kind === 'array') return { types: new Set<OperandType>(['object']), array: true }
  if (type.kind === 'object' || type.kind === 'interface') return factsOf('object')
  return UNKNOWN_FACTS
}

function factsOfPrimitive(primitive: string | undefined): OperandFacts {
  if (primitive === 'string' || primitive === 'number' || primitive === 'boolean') return factsOf(primitive)
  if (primitive === 'null') return nilFacts('null')
  if (primitive === 'undefined') return nilFacts('undefined')
  return UNKNOWN_FACTS
}

/** The facts of a literal initializer (`createSignal(0)`, `const x = 'a'`); null when it is not one. */
function factsOfLiteral(parsed: ParsedExpr | undefined): OperandFacts | null {
  if (!parsed) return null
  if (parsed.kind === 'identifier' && parsed.name === 'undefined') return nilFacts('undefined')
  if (parsed.kind !== 'literal') return null
  return parsed.literalType === 'null' ? nilFacts('null') : factsOf(parsed.literalType)
}

/**
 * A local constant's facts: a declared type that proves something, else a
 * body destructure's ({@link bodyDestructureFacts}), else its initializer's
 * (`const text = props.label ?? 'x'` is never nil: `??` replaces `null` too).
 */
function constantFacts(
  constant: TypingMetadata['localConstants'][number],
  params: TypingMetadata['propsParams'],
  typed: TypedNames,
): OperandFacts {
  const declared = factsOfType(constant.type)
  if (!declared.types.has('unknown')) return declared
  if (constant.propsDestructure) return bodyDestructureFacts(constant, constant.propsDestructure.sourceKey, params, typed)
  return initializerFacts(constant.parsed, typed) ?? UNKNOWN_FACTS
}

/** A declared type that proves something, else the literal seed's facts. */
function declaredOrSeeded(type: TypeInfo | null | undefined, seed: ParsedExpr | undefined): OperandFacts {
  const declared = factsOfType(type)
  if (!declared.types.has('unknown')) return declared
  return factsOfLiteral(seed) ?? UNKNOWN_FACTS
}

/** The component-level operand typing, built once per component. */
export interface OperandTyping {
  /** This typing seen through `scope`. */
  at(scope: BindingScope): ScopedOperandTyping
}

/**
 * {@link OperandTyping} at one emission site. Every answer respects the
 * nearest binding: a loop row, a callback param or a preamble local shadows
 * an outer name.
 */
export interface ScopedOperandTyping {
  readonly scope: BindingScope
  /** A bare-name read: an identifier, or a zero-argument getter call. */
  name(name: string): OperandFacts
  /** The literal `props.<key>` read. */
  prop(key: string): OperandFacts
  /** The member chain `root.<path…>` (`row.id`); `name(root)` for an empty path. */
  path(root: string, path: readonly string[]): OperandFacts
}

export interface OperandTypingOptions {
  /** The fields of a named type, for a row read through a named element type. */
  readonly namedFields?: NamedTypeFields
}

type TypingMetadata = Pick<
  IRMetadata,
  'signals' | 'memos' | 'propsParams' | 'localConstants' | 'propsObjectName' | 'typeDefinitions'
>

/** The names and `props.<key>` reads typed so far, which an initializer can read. */
interface TypedNames {
  readonly names: ReadonlyMap<string, OperandFacts>
  readonly props: ReadonlyMap<string, OperandFacts>
  /** The identifier naming the component's props object, when it has one. */
  readonly propsObject: string | null
}

/**
 * What an initializer or default expression proves, read at component
 * level: a literal, a template literal, an array or object literal, a read
 * of a name or prop typed so far, `l ?? r` (the left side without its nil,
 * or the right side) and `c ? a : b`. Null when the expression proves
 * nothing, so a default whose value is not provable never proves non-nil.
 */
function initializerFacts(expr: ParsedExpr | undefined, typed: TypedNames): OperandFacts | null {
  if (!expr) return null
  const literal = factsOfLiteral(expr)
  if (literal) return literal
  switch (expr.kind) {
    case 'template-literal':
      return factsOf('string')
    case 'array-literal':
      return { types: new Set<OperandType>(['object']), array: true }
    case 'object-literal':
      return factsOf('object')
    case 'identifier':
      return typed.names.get(expr.name) ?? null
    case 'member':
      return propsMemberFacts(expr, typed)
    case 'logical':
      return expr.op === '??' ? nullishFacts(expr.left, expr.right, typed) : null
    case 'conditional':
      return bothFacts(expr.consequent, expr.alternate, typed)
    default:
      return null
  }
}

/** `<propsObject>.<key>`: the prop's facts; null for any other member. */
function propsMemberFacts(expr: Extract<ParsedExpr, { kind: 'member' }>, typed: TypedNames): OperandFacts | null {
  const isPropsRead = !expr.computed && expr.object.kind === 'identifier' && expr.object.name === typed.propsObject
  return isPropsRead ? (typed.props.get(expr.property) ?? null) : null
}

function nullishFacts(left: ParsedExpr, right: ParsedExpr, typed: TypedNames): OperandFacts | null {
  const l = initializerFacts(left, typed)
  const r = initializerFacts(right, typed)
  if (!r) return null
  // `l ?? r` is `r` whenever `l` is nil, and `l` (never nil) otherwise.
  return l ? unionFacts(withoutNil(l), r) : null
}

function bothFacts(a: ParsedExpr, b: ParsedExpr, typed: TypedNames): OperandFacts | null {
  const fa = initializerFacts(a, typed)
  const fb = initializerFacts(b, typed)
  return fa && fb ? unionFacts(fa, fb) : null
}

/** A prop's declared facts: its declared type, and `undefined` when it may be omitted. */
function declaredPropFacts(param: TypingMetadata['propsParams'][number]): OperandFacts {
  const declared = factsOfType(param.declaredType ?? param.type)
  return param.optional ? withNil(declared, 'undefined') : declared
}

/**
 * `facts` once a destructuring default has replaced `undefined`: JS applies
 * the default to `undefined` only, so a `null` survives it. A nil read as
 * `either` keeps its `null`; null when nothing but `undefined` was possible.
 */
function withoutUndefined(facts: OperandFacts): OperandFacts | null {
  if (facts.nil === undefined || facts.nil === 'null') return facts
  if (facts.nil === 'either') return { ...facts, nil: 'null' }
  return facts.types.size === 1 ? null : withoutNil(facts)
}

/**
 * The facts of a destructured binding (`{ n = 1 }`, `const { label: text = 'x' } = props`)
 * of a value with `declared` facts: with a default, the value without its
 * `undefined`, or the default's facts (`{ on = undefined }` may still be
 * `undefined`, a `label?: string | null` may still be `null`). A default that
 * proves nothing makes the binding unknown.
 */
function destructuredFacts(declared: OperandFacts, fallbackExpr: ParsedExpr | undefined, hasDefault: boolean, typed: TypedNames): OperandFacts {
  if (!hasDefault) return declared
  const fallback = initializerFacts(fallbackExpr, typed)
  if (!fallback) return UNKNOWN_FACTS
  const kept = withoutUndefined(declared)
  return kept ? unionFacts(kept, fallback) : fallback
}

/** A destructured prop parameter's facts ({@link destructuredFacts}). */
function boundPropFacts(param: TypingMetadata['propsParams'][number], typed: TypedNames): OperandFacts {
  return destructuredFacts(declaredPropFacts(param), param.parsed, param.defaultValue !== undefined, typed)
}

/**
 * A body destructure of the props object (`ConstantInfo.propsDestructure`):
 * the prop's declared facts under the binding's own default
 * ({@link destructuredFacts}), which the `propsParams` entry of the same
 * name and key carries. Its initializer text (`props.label ?? 'x'`) is not
 * read as a `??`: a destructuring default does not replace `null`.
 */
function bodyDestructureFacts(
  constant: TypingMetadata['localConstants'][number],
  sourceKey: string,
  params: TypingMetadata['propsParams'],
  typed: TypedNames,
): OperandFacts {
  const declared = typed.props.get(sourceKey) ?? UNKNOWN_FACTS
  const param = params.find(p => p.name === constant.name && (p.sourceName ?? p.name) === sourceKey)
  // No entry of its own: a binding without a default reads the prop itself.
  if (!param) return constant.parsed?.kind === 'member' ? declared : UNKNOWN_FACTS
  return destructuredFacts(declared, param.parsed, param.defaultValue !== undefined, typed)
}

/**
 * Type the props. With a props object (`function C(props)`), every default
 * a `propsParams` entry carries comes from a body destructure
 * (`const { label: text = 'x' } = props`): it types the local binding (a
 * local constant), never `props.<key>`, which keeps its declared facts. A
 * renamed body destructure (`sourceName`) never replaces the original
 * property's entry. Without one, the props are destructured bindings, read
 * bare and as `props.<key>`, and a default applies to both.
 */
function collectPropFacts(metadata: TypingMetadata, names: Map<string, OperandFacts>, props: Map<string, OperandFacts>): void {
  const propsObject = metadata.propsObjectName ?? null
  for (const param of metadata.propsParams) {
    const key = param.sourceName ?? param.name
    if (propsObject) {
      if (param.sourceName === undefined || !props.has(key)) props.set(key, declaredPropFacts(param))
      continue
    }
    const facts = boundPropFacts(param, { names, props, propsObject })
    props.set(key, facts)
    names.set(param.name, facts)
  }
}

/**
 * A signal's facts: its declared type or literal seed, and the nil its seed
 * is (`createSignal<number>()` and `createSignal<number | null>(null)` start
 * nil). The SSR read is the seed.
 */
function signalFacts(signal: TypingMetadata['signals'][number]): OperandFacts {
  const facts = declaredOrSeeded(signal.type, signal.parsed)
  if (signal.initialValue.trim() === '') return withNil(facts, 'undefined')
  const seed = factsOfLiteral(signal.parsed)
  return seed?.nil === undefined ? facts : withNil(facts, seed.nil === 'null' ? 'null' : 'undefined')
}

/**
 * Build the component's {@link OperandTyping} from its metadata. Bare names
 * hold signal getters, memos, local constants and (only when the props are
 * destructured) the props; `props.<key>` reads hold the props by their
 * caller-facing key. A later source shadows an earlier one of the same name,
 * so a local constant shadows a destructured prop.
 *
 * Unlike `collectNumberValueNames` and the adapters' `collectStringValueNames`,
 * an optional prop without a default is not proven its declared type: an
 * omitted prop reads nil (`undefined`).
 */
export function collectOperandTyping(metadata: TypingMetadata, options: OperandTypingOptions = {}): OperandTyping {
  const names = new Map<string, OperandFacts>()
  const props = new Map<string, OperandFacts>()
  collectPropFacts(metadata, names, props)
  for (const signal of metadata.signals) names.set(signal.getter, signalFacts(signal))
  for (const memo of metadata.memos ?? []) names.set(memo.name, factsOfType(memo.type))
  const typed: TypedNames = { names, props, propsObject: metadata.propsObjectName ?? null }
  for (const constant of metadata.localConstants ?? []) {
    names.set(constant.name, constantFacts(constant, metadata.propsParams, typed))
  }
  const namedFields: NamedTypeFields =
    options.namedFields ?? (typeName => metadata.typeDefinitions?.find(td => td.name === typeName)?.properties)
  return {
    at: scope => scopedTyping(scope, names, props, namedFields),
  }
}

/** An {@link OperandTyping} proving nothing about any outer name; loop bindings still type. */
export const EMPTY_OPERAND_TYPING: OperandTyping = {
  at: scope => scopedTyping(scope, new Map(), new Map(), () => undefined),
}

function scopedTyping(
  scope: BindingScope,
  names: ReadonlyMap<string, OperandFacts>,
  props: ReadonlyMap<string, OperandFacts>,
  namedFields: NamedTypeFields,
): ScopedOperandTyping {
  const typing: ScopedOperandTyping = {
    scope,
    name: name => {
      const hit = scope.lookup(name)
      return hit ? bindingFacts(hit.binding, [], namedFields) : (names.get(name) ?? UNKNOWN_FACTS)
    },
    prop: key => {
      // A binding named `props` reads its own member (#3693); in a component
      // whose props object has another name, an unbound `props` is nothing.
      if (scope.isBound(PROPS_OBJECT_IDENTIFIER)) return typing.path(PROPS_OBJECT_IDENTIFIER, [key])
      if (scope.propsObject !== PROPS_OBJECT_IDENTIFIER) return UNKNOWN_FACTS
      return props.get(key) ?? UNKNOWN_FACTS
    },
    path: (root, path) => {
      if (path.length === 0) return typing.name(root)
      // An outer name's typing covers the name itself, not a member of it.
      const hit = scope.lookup(root)
      return hit ? bindingFacts(hit.binding, path, namedFields) : UNKNOWN_FACTS
    },
  }
  return typing
}

/** What a read of a loop / callback binding (and a field path below it) proves. */
function bindingFacts(binding: ScopeBinding, path: readonly string[], namedFields: NamedTypeFields): OperandFacts {
  if (path.length === 0 && binding.source === 'index') return { types: new Set<OperandType>(['number']), index: true }
  if (path.length === 0 && binding.stringValue === true) return factsOf('string')
  if (!binding.row) return UNKNOWN_FACTS
  const segments = [...binding.row.segments, ...path.map(key => ({ kind: 'field' as const, key, isIdent: true }))]
  return factsOfType(loopValueTypeAt(binding.row.itemType, segments, namedFields))
}

/**
 * An {@link OperandTyping}-shaped view over name tests, for the legacy
 * classifiers that take a callback instead of a typing (`isBooleanResultParsed`'s
 * `isBooleanName`). A name the test accepts is proven `type`; nothing else is.
 */
export function typingFromNameTest(
  type: 'boolean' | 'string' | 'number',
  test: ((name: string, componentProperty?: boolean) => boolean) | undefined,
): ScopedOperandTyping {
  const proven = factsOf(type)
  return {
    scope: BindingScope.EMPTY,
    name: name => (test?.(name) ? proven : UNKNOWN_FACTS),
    prop: key => (test?.(key, true) ? proven : UNKNOWN_FACTS),
    path: (root, path) => (path.length === 0 && test?.(root) ? proven : UNKNOWN_FACTS),
  }
}
