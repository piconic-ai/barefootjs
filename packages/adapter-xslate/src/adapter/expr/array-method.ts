/**
 * Array / string method lowering for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure free functions shared by both the filter-context emitter and
 * the top-level emitter — they take an `emit` callback for receiver / argument
 * recursion and read no adapter instance state.
 *
 * The receiver/array helpers are the same runtime methods the Mojo adapter
 * calls, invoked as `$bf.NAME(...)` on the Kolon `$bf` object instead of
 * `bf->NAME`.
 */

import type {
  ParsedExpr,
  ArrayMethod,
  SortComparator,
  ReduceOp,
  FlatDepth,
  FlatMapOp,
} from '@barefootjs/jsx'

export function renderArrayMethod(
  method: ArrayMethod,
  object: ParsedExpr,
  args: ParsedExpr[],
  emit: (e: ParsedExpr) => string,
): string {
  switch (method) {
    case 'join': {
      // Route through the runtime (`$bf.join`) rather than Kolon's builtin
      // `.join`, so the JS-compat element handling (undef → empty, default
      // separator) is applied consistently — same reasoning as $bf.lc / etc.
      const obj = emit(object)
      const sep = args.length >= 1 ? emit(args[0]) : `','`
      return `$bf.join(${obj}, ${sep})`
    }
    case 'includes': {
      const obj = emit(object)
      const needle = emit(args[0])
      return `$bf.includes(${obj}, ${needle})`
    }
    case 'indexOf':
    case 'lastIndexOf': {
      const fn = method === 'indexOf' ? 'index_of' : 'last_index_of'
      const obj = emit(object)
      const needle = emit(args[0])
      return `$bf.${fn}(${obj}, ${needle})`
    }
    case 'at': {
      const obj = emit(object)
      const idx = args.length >= 1 ? emit(args[0]) : '0'
      return `$bf.at(${obj}, ${idx})`
    }
    case 'concat': {
      if (args.length === 0) {
        return emit(object)
      }
      const a = emit(object)
      const b = emit(args[0])
      return `$bf.concat(${a}, ${b})`
    }
    case 'slice': {
      const recv = emit(object)
      const start = args.length >= 1 ? emit(args[0]) : '0'
      // Kolon's undefined literal is `nil`, not Perl's `undef` — the
      // runtime `slice` treats it as "to end".
      const end = args.length >= 2 ? emit(args[1]) : 'nil'
      return `$bf.slice(${recv}, ${start}, ${end})`
    }
    case 'reverse':
    case 'toReversed': {
      const recv = emit(object)
      return `$bf.reverse(${recv})`
    }
    case 'toLowerCase': {
      // Kolon has no builtin string `lc` / `uc`, so these go through the
      // runtime object (consistent with $bf.includes / $bf.slice / etc.).
      const recv = emit(object)
      return `$bf.lc(${recv})`
    }
    case 'toUpperCase': {
      const recv = emit(object)
      return `$bf.uc(${recv})`
    }
    case 'trim': {
      const recv = emit(object)
      return `$bf.trim(${recv})`
    }
    case 'toFixed': {
      // `.toFixed(digits?)` — `$bf.to_fixed` mirrors JS rounding +
      // zero-padding (default 0 digits). #1897.
      const recv = emit(object)
      const digits = args.length >= 1 ? emit(args[0]) : '0'
      return `$bf.to_fixed(${recv}, ${digits})`
    }
    case 'split': {
      const recv = emit(object)
      if (args.length === 0) {
        return `$bf.split(${recv})`
      }
      const sep = emit(args[0])
      if (args.length === 1) {
        return `$bf.split(${recv}, ${sep})`
      }
      const limit = emit(args[1])
      return `$bf.split(${recv}, ${sep}, ${limit})`
    }
    case 'startsWith':
    case 'endsWith': {
      const fn = method === 'startsWith' ? 'starts_with' : 'ends_with'
      const recv = emit(object)
      const arg = emit(args[0])
      if (args.length >= 2) {
        return `$bf.${fn}(${recv}, ${arg}, ${emit(args[1])})`
      }
      return `$bf.${fn}(${recv}, ${arg})`
    }
    case 'replace': {
      const recv = emit(object)
      const oldS = emit(args[0])
      const newS = emit(args[1])
      return `$bf.replace(${recv}, ${oldS}, ${newS})`
    }
    case 'repeat': {
      const recv = emit(object)
      const count = args.length === 0 ? '0' : emit(args[0])
      return `$bf.repeat(${recv}, ${count})`
    }
    case 'padStart':
    case 'padEnd': {
      const fn = method === 'padStart' ? 'pad_start' : 'pad_end'
      const recv = emit(object)
      if (args.length === 0) {
        return `$bf.${fn}(${recv}, 0)`
      }
      const target = emit(args[0])
      if (args.length === 1) {
        return `$bf.${fn}(${recv}, ${target})`
      }
      const pad = emit(args[1])
      return `$bf.${fn}(${recv}, ${target}, ${pad})`
    }
    default: {
      // TS-level exhaustiveness guard.
      const _exhaustive: never = method
      throw new Error(
        `renderArrayMethod: unhandled ArrayMethod '${(_exhaustive as string)}'`,
      )
    }
  }
}

/**
 * Shared Kolon emit for `.sort(cmp)` / `.toSorted(cmp)`. Used by both the
 * filter-context emitter and the top-level emitter, plus the loop-array
 * wrap in `renderLoop`. The runtime `$bf.sort` accepts a hashref opts bag and
 * returns a fresh array ref.
 */
export function renderSortMethod(recv: string, c: SortComparator): string {
  const keyHashes = c.keys.map((k) => {
    const keyEntry =
      k.key.kind === 'self'
        ? `key_kind => 'self'`
        : `key_kind => 'field', key => '${k.key.field}'`
    return `{ ${keyEntry}, compare_type => '${k.type}', direction => '${k.direction}' }`
  })
  return `$bf.sort(${recv}, { keys => [${keyHashes.join(', ')}] })`
}

/**
 * Render a `.reduce(fn, init)` arithmetic fold as a `$bf.reduce(...)` call.
 */
export function renderReduceMethod(recv: string, op: ReduceOp, direction: 'left' | 'right'): string {
  const keyEntry =
    op.key.kind === 'self'
      ? `key_kind => 'self'`
      : `key_kind => 'field', key => '${op.key.field}'`
  const init =
    op.type === 'string'
      ? `'${op.init.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      : op.init
  return `$bf.reduce(${recv}, { op => '${op.op}', ${keyEntry}, type => '${op.type}', init => ${init}, direction => '${direction}' })`
}

// `.flat(depth?)` → `$bf.flat($recv, $depth)`.
export function renderFlatMethod(recv: string, depth: FlatDepth): string {
  const d = depth === 'infinity' ? -1 : depth
  return `$bf.flat(${recv}, ${d})`
}

// `.flatMap(...)` → `$bf.flat_map(...)` / `$bf.flat_map_tuple(...)`.
export function renderFlatMapMethod(recv: string, op: FlatMapOp): string {
  const proj = op.projection
  if (proj.kind === 'tuple') {
    const specs = proj.elements
      .map(l => (l.kind === 'self' ? `['self', '']` : `['field', '${l.field}']`))
      .join(', ')
    return `$bf.flat_map_tuple(${recv}, ${specs})`
  }
  if (proj.kind === 'self') return `$bf.flat_map(${recv}, 'self', '')`
  return `$bf.flat_map(${recv}, 'field', '${proj.field}')`
}
