/**
 * Loop-row reads → Go field paths, one answer for every site that asks
 * "does this expression read the loop row, and through which fields?"
 * (#3313). A row is read either through a plain callback param
 * (`o => o.tone`) or through a destructured binding
 * (`({ tone }) => tone`, whose structured `segments` already spell the
 * path from the row to the binding). Both resolve to the same segment
 * path, so the constructor's `data-key`, the row wrappers and the test
 * harness's handler stand-in agree on `item.Tone`.
 */

import { parseExpression, type LoopBindingPathSegment, type LoopParamBinding, type ParsedExpr, type TemplatePart } from '@barefootjs/jsx'
import { capitalizeFieldName } from './go-naming.ts'

/** The loop callback's row binding: a plain `param`, or a destructure (`paramBindings`, which wins when non-empty). */
export interface LoopRowBinding {
  param?: string
  paramBindings?: readonly LoopParamBinding[]
  /**
   * The callback's index param (`(item, i) => …`), when it binds one. Only
   * the key lowering reads it (`loopKeyToGoRowExpr`): it is the Go range
   * index `i` of the constructor's row loop.
   */
  index?: string | null
}

/**
 * Path from the loop row to the value `expr` reads, or null when `expr`
 * is not a (non-computed, non-optional) read of the row. The bare plain
 * param resolves to `[]`; a destructured binding to its own `segments`
 * (a rest binding is not a fixed path and resolves to null).
 */
export function rowItemPath(expr: ParsedExpr, row: LoopRowBinding): LoopBindingPathSegment[] | null {
  if (expr.kind === 'identifier') {
    if (row.paramBindings && row.paramBindings.length > 0) {
      const binding = row.paramBindings.find(b => b.name === expr.name && !b.rest)
      return binding?.segments ? [...binding.segments] : null
    }
    return row.param !== undefined && expr.name === row.param ? [] : null
  }
  if (expr.kind === 'member' && !expr.computed && !expr.optional) {
    const base = rowItemPath(expr.object, row)
    return base ? [...base, { kind: 'field', key: expr.property, isIdent: true }] : null
  }
  return null
}

/**
 * Go expression reading `segments` off the row variable `base`
 * (`item.Tone`), or null when a segment has no Go field spelling (an
 * array index or a non-identifier key).
 */
export function goItemAccessor(segments: readonly LoopBindingPathSegment[], base = 'item'): string | null {
  let accessor = base
  for (const segment of segments) {
    if (segment.kind !== 'field' || !segment.isIdent) return null
    accessor += `.${capitalizeFieldName(segment.key)}`
  }
  return accessor
}

/**
 * What the row variable `item` holds: a scalar row (`string[]`, whose
 * `item` IS the value) or a struct row. `hasFieldPath`, when given, says
 * whether a field path exists on the struct row's Go type, so a read
 * through a field the struct doesn't carry (`item.label.length`) declines
 * instead of emitting Go that won't compile. `readGoType`, when given,
 * answers the Go type of a row read at `segments` (`[]` is the whole row),
 * or null when it can't tell — what a caller assigning the read into
 * another struct's field checks assignability against.
 *
 * `boxedNumber` marks a scalar number row whose source slice is
 * `[]interface{}` rather than `[]float64` (a `number[]` prop, #3310):
 * `readGoType` still answers `float64`, which is what the row means, but
 * the range variable `item` holds the number boxed, so a read assigned
 * into a `float64` field is spelled through `rowReadGoValue`.
 */
export interface LoopRowShape {
  scalar?: boolean
  boxedNumber?: boolean
  hasFieldPath?: (segments: readonly LoopBindingPathSegment[]) => boolean
  readGoType?: (segments: readonly LoopBindingPathSegment[]) => string | null
}

/**
 * Go expression reading `expr` off the source row variable `item`: the
 * whole row (`i` → `item`), or a field path off a struct row
 * (`item.meta.id` → `item.Meta.ID`). Null when `expr` isn't a plain row
 * read, reads a field off a scalar row, or names a field path the row's Go
 * type doesn't have.
 */
export function rowReadGoAccessor(expr: ParsedExpr, row: LoopRowBinding, shape: LoopRowShape = {}): string | null {
  const path = rowItemPath(expr, row)
  if (!path) return null
  if (path.length === 0) return 'item'
  if (shape.scalar) return null
  if (shape.hasFieldPath && !shape.hasFieldPath(path)) return null
  return goItemAccessor(path)
}

/**
 * The Go value a row read (`accessor`, from `rowReadGoAccessor`) assigns
 * into a field of the row's own `readGoType`: the accessor itself, or a
 * boxed number row unboxed with `bf.ToFloat64` (#3625), which reads both a
 * JSON-decoded `float64` and a Go caller's `int`.
 */
export function rowReadGoValue(accessor: string, shape: LoopRowShape): string {
  return shape.boxedNumber && accessor === 'item' ? `bf.ToFloat64(${accessor})` : accessor
}

/**
 * The one answer to "what Go expression is this keyed loop's `key`,
 * evaluated against the SOURCE row `item`?" — the datum the `.map()`
 * callback receives, never a child component's `Input` built from it
 * (`item.id` → `item.ID`, `({ id }) => … key={id}` → `item.ID`, a scalar
 * row's `key={i}` → `item`). Beyond a plain row read, the key may be built
 * from the row and the index param (`key={i}` → the range index `i`) with
 * `String(x)` / `x.toString()`, a template literal or `+`
 * (`lowerRowKeyExpr`); the caller stringifies `go` with `bf.String`.
 * `readsRow` says whether the key reads the row variable `item`, so a
 * caller deciding whether to bind it asks the lowering, never the emitted
 * text (a literal like `` `item-${i}` `` names no row).
 *
 * A key reading a callback-preamble local never gets here: Phase 1 refuses
 * it, since the key is evaluated before the body runs. Null for anything
 * else — a read of outer state, a struct row as a whole (`key={item}`,
 * which JS stringifies as `[object Object]`), a `+` whose operand types
 * aren't known — so the caller can refuse loudly rather than emit something
 * that won't compile or silently drop the key.
 */
export function loopKeyToGoRowExpr(key: string | undefined, row: LoopRowBinding, shape: LoopRowShape = {}): LoweredLoopKey | null {
  if (!key) return null
  const parsed = parseExpression(key)
  // `String(x)` is what `bf.String` already does: hand back `x` itself.
  const stringified = stringCallArgument(parsed)
  const lowered = lowerRowKeyExpr(stringified ?? parsed, row, shape)
  return lowered ? { go: lowered.go, readsRow: lowered.readsRow } : null
}

/** A loop key lowered to Go code in the row loop (`loopKeyToGoRowExpr`). */
export interface LoweredLoopKey {
  go: string
  /** Whether `go` reads the row variable `item`. */
  readsRow: boolean
}

/** What a lowered key operand is known to hold, which decides what `+` means. */
type KeyOperandKind = 'string' | 'number' | 'unknown'

interface LoweredKeyOperand {
  go: string
  kind: KeyOperandKind
  readsRow: boolean
}

const NUMERIC_GO_TYPES: ReadonlySet<string> = new Set(['int', 'int64', 'float64'])

/** `String(x)` / `x.toString()` → `x`, else null. */
function stringCallArgument(expr: ParsedExpr): ParsedExpr | null {
  if (expr.kind !== 'call') return null
  if (expr.callee.kind === 'identifier' && expr.callee.name === 'String' && expr.args.length === 1) return expr.args[0]
  if (expr.callee.kind === 'member' && !expr.callee.computed && !expr.callee.optional && expr.callee.property === 'toString' && expr.args.length === 0) {
    return expr.callee.object
  }
  return null
}

/**
 * Lower one operand of a row key to Go code in the constructor's row loop
 * (`for i, item := range …`), or null when it can't be.
 */
function lowerRowKeyExpr(expr: ParsedExpr, row: LoopRowBinding, shape: LoopRowShape): LoweredKeyOperand | null {
  switch (expr.kind) {
    case 'literal':
      return lowerKeyLiteral(expr)
    case 'identifier':
      if (row.index && expr.name === row.index) return { go: 'i', kind: 'number', readsRow: false }
      return lowerRowKeyRead(expr, row, shape)
    case 'member':
      return lowerRowKeyRead(expr, row, shape)
    case 'call': {
      const arg = stringCallArgument(expr)
      const inner = arg ? lowerRowKeyExpr(arg, row, shape) : null
      return inner ? asKeyString(inner) : null
    }
    case 'template-literal':
      return lowerKeyTemplate(expr.parts, row, shape)
    case 'binary':
      return expr.op === '+' ? lowerKeyPlus(expr.left, expr.right, row, shape) : null
    default:
      return null
  }
}

function lowerKeyLiteral(expr: Extract<ParsedExpr, { kind: 'literal' }>): LoweredKeyOperand | null {
  if (expr.literalType === 'string') return { go: JSON.stringify(expr.value), kind: 'string', readsRow: false }
  if (expr.literalType === 'number') return { go: expr.raw ?? String(expr.value), kind: 'number', readsRow: false }
  return null
}

/** `operand` as a Go string: as is when it already is one, else through `bf.String`. */
function asKeyString(operand: LoweredKeyOperand): LoweredKeyOperand {
  return operand.kind === 'string' ? operand : { ...operand, go: `bf.String(${operand.go})`, kind: 'string' }
}

/** A template literal key: its literal chunks and stringified substitutions, joined. */
function lowerKeyTemplate(parts: readonly TemplatePart[], row: LoopRowBinding, shape: LoopRowShape): LoweredKeyOperand | null {
  const pieces: string[] = []
  let readsRow = false
  for (const part of parts) {
    if (part.type === 'string') {
      if (part.value !== '') pieces.push(JSON.stringify(part.value))
      continue
    }
    const inner = lowerRowKeyExpr(part.expr, row, shape)
    if (!inner) return null
    pieces.push(asKeyString(inner).go)
    readsRow ||= inner.readsRow
  }
  return { go: pieces.length === 0 ? '""' : pieces.join(' + '), kind: 'string', readsRow }
}

/**
 * JS `+` concatenates when either side is a string and adds when both are
 * numbers; with an operand of unknown type the two can't be told apart, so
 * it declines.
 */
function lowerKeyPlus(leftExpr: ParsedExpr, rightExpr: ParsedExpr, row: LoopRowBinding, shape: LoopRowShape): LoweredKeyOperand | null {
  const left = lowerRowKeyExpr(leftExpr, row, shape)
  const right = lowerRowKeyExpr(rightExpr, row, shape)
  if (!left || !right) return null
  const readsRow = left.readsRow || right.readsRow
  if (left.kind === 'string' || right.kind === 'string') return { go: `bf.ConcatStr(${left.go}, ${right.go})`, kind: 'string', readsRow }
  if (left.kind === 'number' && right.kind === 'number') return { go: `bf.Add(${left.go}, ${right.go})`, kind: 'number', readsRow }
  return null
}

/** A plain row read as a key operand; a struct row as a whole declines. */
function lowerRowKeyRead(expr: ParsedExpr, row: LoopRowBinding, shape: LoopRowShape): LoweredKeyOperand | null {
  const accessor = rowReadGoAccessor(expr, row, shape)
  if (accessor === null || (accessor === 'item' && !shape.scalar)) return null
  const path = rowItemPath(expr, row)
  const goType = path && shape.readGoType ? shape.readGoType(path) : null
  const kind: KeyOperandKind = goType === 'string' ? 'string' : goType && NUMERIC_GO_TYPES.has(goType) ? 'number' : 'unknown'
  return { go: accessor, kind, readsRow: true }
}

/** A loop row's value type, structurally (`TypeInfo` or the scope's `LoopValueType`). */
interface RowValueType {
  readonly primitive?: string
  readonly unionTypes?: readonly RowValueType[]
}

/**
 * A row whose value is a string, number or boolean (or a union of them) has
 * no fields: `g.length` on it reads the value (`bf_length .`), never a
 * `.Length` field of a row record. Unknown types keep the field reading.
 */
export function isFieldlessRowType(type: RowValueType | null | undefined): boolean {
  if (!type) return false
  if (type.primitive !== undefined) return true
  return type.unionTypes !== undefined && type.unionTypes.length > 0 && type.unionTypes.every(isFieldlessRowType)
}
