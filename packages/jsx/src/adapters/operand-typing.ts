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

/** A prop's facts: its declared type, and `undefined` when it may be omitted. */
function propFacts(param: TypingMetadata['propsParams'][number]): OperandFacts {
  const declared = factsOfType(param.declaredType ?? param.type)
  return param.optional && param.defaultValue === undefined ? withNil(declared, 'undefined') : declared
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
  for (const param of metadata.propsParams) {
    const facts = propFacts(param)
    props.set(param.sourceName ?? param.name, facts)
    if (!metadata.propsObjectName) names.set(param.name, facts)
  }
  for (const signal of metadata.signals) names.set(signal.getter, signalFacts(signal))
  for (const memo of metadata.memos ?? []) names.set(memo.name, factsOfType(memo.type))
  for (const constant of metadata.localConstants ?? []) {
    names.set(constant.name, declaredOrSeeded(constant.type, constant.parsed))
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
