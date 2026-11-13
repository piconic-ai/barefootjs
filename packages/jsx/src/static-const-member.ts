/**
 * What a read of a literal const's member (`QS[0]`, `QS[9]`, `REC['k']`,
 * `NEST.a.c`) sees, decided from the const's parsed literal value — the ONE
 * decision behind every template adapter's compile-time member lookup of a
 * module or component-local array / object literal const.
 *
 * The template receives the props, not the module's consts, so a read the
 * lookup does not answer falls back to a lowering that reads the const as a
 * template variable. That variable does not exist: some engines render it
 * empty by accident, others fail the render (Perl `strict`, Go's field
 * lookup). So a key the literal provably lacks is answered here too, as
 * `undefined`, which every emitter already spells. A key the literal lacks
 * but its prototype has (`REC['toString']`, `QS['map']`) reads a function
 * in JS, which no template can render; that read is `inherited`, and
 * `spellStaticConstMember` refuses it with BF101 where the adapter spells
 * it.
 */

import { resolveStaticConstBinding } from './augment-inherited-props.ts'
import { exprToString, type ObjectLiteralProperty, type ParsedExpr } from './expression-parser.ts'
import { literalMemberIndex } from './literal-member-index.ts'
import type { CompilerError, IRMetadata } from './types.ts'

type StaticConstants = IRMetadata['localConstants'] | undefined

/**
 * A literal const member read:
 *
 *   - `value`: the read's value as a typed `ParsedExpr` — a string or number
 *     `literal`, a unary `-` over a number literal, or the identifier
 *     `undefined` for a key the literal provably lacks;
 *   - `inherited`: a key only the prototype has (a function in JS).
 *
 * `null` when the read is not a member of a literal const, or the literal
 * cannot answer it (a hole or spread before the element, a non-literal
 * value, an `__proto__` key); the caller falls back to its generic lowering.
 */
export type StaticConstMemberRead =
  | { kind: 'value'; expr: ParsedExpr }
  | { kind: 'inherited'; key: string }

const UNDEFINED_EXPR: ParsedExpr = { kind: 'identifier', name: 'undefined' }

/** The literal key of an index (`QS[-1]`, `QS[-0]`), as JS converts it to a property key. */
export function staticIndexKey(index: ParsedExpr): string | null {
  if (index.kind === 'literal' && (index.literalType === 'string' || index.literalType === 'number')) {
    return String(index.value)
  }
  if (
    index.kind === 'unary' && index.op === '-' &&
    index.argument.kind === 'literal' && index.argument.literalType === 'number' &&
    typeof index.argument.value === 'number'
  ) {
    return String(-index.argument.value)
  }
  return null
}

/**
 * Read `key` of `object`, where `object` is a literal const (`QS`) or a
 * literal-valued member of one (`NEST.a`). `isShadowed` is REQUIRED for the
 * same reason as in `lookupStaticRecordLiteral`.
 */
export function readStaticConstMember(
  object: ParsedExpr,
  key: string,
  constants: StaticConstants,
  isShadowed: (name: string) => boolean,
): StaticConstMemberRead | null {
  const receiver = staticLiteralValue(object, constants, isShadowed)
  if (receiver === null) return null
  const read = readLiteralMember(receiver, key)
  if (read === null || read.kind === 'inherited') return read
  return isRenderableScalar(read.expr) ? read : null
}

/**
 * The value of a literal const member read, or `null` when the read has no
 * compile-time value (including an `inherited` read, refused separately).
 */
export function lookupStaticConstMember(
  object: ParsedExpr,
  key: string,
  constants: StaticConstants,
  isShadowed: (name: string) => boolean,
): ParsedExpr | null {
  const read = readStaticConstMember(object, key, constants, isShadowed)
  return read?.kind === 'value' ? read.expr : null
}

/** Where a template adapter records the refusal of an `inherited` read. */
export interface StaticConstMemberSink {
  readonly errors: CompilerError[]
  readonly componentName: string
}

/**
 * The value a template adapter spells for a literal const member read it is
 * emitting, as `lookupStaticConstMember`; and, for a key only the literal's
 * prototype has (`REC['toString']`, `QS['map']`), BF101 recorded in `sink`.
 * Every template adapter's member and index emitters (value, condition and
 * child-prop position, and a memo or constant body the adapter inlines)
 * read through this, so the refusal fires exactly where a template would
 * spell the read: a position deferred with `/* @client *\/`, a method the
 * template never renders, or a name a binding shadows never reaches it.
 */
export function spellStaticConstMember(
  object: ParsedExpr,
  key: string,
  constants: StaticConstants,
  isShadowed: (name: string) => boolean,
  sink: StaticConstMemberSink,
): ParsedExpr | null {
  const read = readStaticConstMember(object, key, constants, isShadowed)
  if (read?.kind === 'inherited') {
    recordInheritedRead(exprToString({ kind: 'member', object, property: key, computed: false, optional: false }), sink)
    return null
  }
  return read?.kind === 'value' ? read.expr : null
}

function recordInheritedRead(read: string, sink: StaticConstMemberSink): void {
  const message =
    `\`${read}\` reads a key the const's literal value does not have but its prototype does, so JS reads an inherited ` +
    'function there. A template holds the literal value without a prototype, so the server render cannot give the JS answer.'
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc: { file: `${sink.componentName}.tsx`, start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    suggestion: {
      message: 'Read a key the literal lists, or defer the read to the client with /* @client */.',
      escape: [{ kind: 'client-directive' }],
    },
  })
}

/** The literal (array / object / scalar) `expr` evaluates to, read through literal consts. */
function staticLiteralValue(
  expr: ParsedExpr,
  constants: StaticConstants,
  isShadowed: (name: string) => boolean,
): ParsedExpr | null {
  if (expr.kind === 'identifier') {
    const value = resolveStaticConstBinding(expr.name, constants, isShadowed)?.parsed
    return value?.kind === 'array-literal' || value?.kind === 'object-literal' ? value : null
  }
  const key = expr.kind === 'member' ? expr.property : expr.kind === 'index-access' ? staticIndexKey(expr.index) : null
  if (key === null || (expr.kind !== 'member' && expr.kind !== 'index-access')) return null
  const receiver = staticLiteralValue(expr.object, constants, isShadowed)
  if (receiver === null) return null
  const read = readLiteralMember(receiver, key)
  return read?.kind === 'value' ? read.expr : null
}

/**
 * `key` of an array or object literal: its value, `undefined` for a key it
 * provably lacks, `inherited` for a key only its prototype has, or `null`
 * when the literal cannot answer.
 */
export function readLiteralMember(receiver: ParsedExpr, key: string): StaticConstMemberRead | null {
  if (receiver.kind === 'array-literal') return readArrayMember(receiver.elements, key)
  if (receiver.kind === 'object-literal') return readObjectMember(receiver.properties, key)
  return null
}

/**
 * An array literal's `length`, element, or missing key. A hole or spread
 * (`unsupported`) at or before an index makes the element unknown, and
 * anywhere makes the length (so whether an index is past the end) unknown.
 */
function readArrayMember(elements: readonly ParsedExpr[], key: string): StaticConstMemberRead | null {
  const unknownAt = elements.findIndex(e => e.kind === 'unsupported')
  if (key === 'length') {
    return unknownAt >= 0 ? null : { kind: 'value', expr: numberLiteral(elements.length) }
  }
  const index = literalMemberIndex(key)
  if (index.kind === 'literal' && typeof index.value === 'number') {
    if (unknownAt >= 0 && unknownAt <= index.value) return null
    if (index.value < elements.length) return { kind: 'value', expr: elements[index.value] }
    return unknownAt >= 0 ? null : { kind: 'value', expr: UNDEFINED_EXPR }
  }
  // Not an array index (`'01'`, `'-1'`, `'foo'`): no element holds it, and a
  // spread or hole adds none.
  if (key in Array.prototype) return { kind: 'inherited', key }
  return { kind: 'value', expr: UNDEFINED_EXPR }
}

/**
 * An object literal's own key, or a key it provably lacks. A spread may
 * bring any key, and an `__proto__` entry sets the prototype instead of a
 * key, so either makes a missing key unknown. A later entry of the same key
 * overrides an earlier one.
 */
function readObjectMember(properties: readonly ObjectLiteralProperty[], key: string): StaticConstMemberRead | null {
  if (properties.some(p => p.kind === 'spread' || p.key === '__proto__')) return null
  const own = properties.filter(p => p.kind === 'prop' && p.key === key).at(-1)
  if (own?.kind === 'prop') return { kind: 'value', expr: own.value }
  if (key in Object.prototype) return { kind: 'inherited', key }
  return { kind: 'value', expr: UNDEFINED_EXPR }
}

/** A value every template emitter spells as the source would: a string or number, or `undefined`. */
function isRenderableScalar(expr: ParsedExpr): boolean {
  if (expr.kind === 'identifier') return expr.name === 'undefined'
  if (expr.kind === 'literal') return expr.literalType === 'string' || expr.literalType === 'number'
  return (
    expr.kind === 'unary' && expr.op === '-' &&
    expr.argument.kind === 'literal' && expr.argument.literalType === 'number'
  )
}

function numberLiteral(value: number): ParsedExpr {
  return { kind: 'literal', value, literalType: 'number', raw: String(value) }
}
