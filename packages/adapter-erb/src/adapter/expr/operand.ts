/**
 * Operand-type classification + index-access lowering for the ERB template
 * adapter.
 *
 * Ported from the Mojolicious adapter's `expr/operand.ts` (issue #2018
 * track D lineage). Pure functions over `ParsedExpr` — they take an
 * `isStringName` predicate (supplied by the emitter from adapter state)
 * rather than reading adapter instance state directly.
 *
 * `isStringTypedOperand` is byte-identical to the Mojo/Xslate adapters'
 * copy — NOTE: this is a stale pre-#2212 fork with no `identifier` arm;
 * Mojo has since migrated to the shared analyzer-backed version. Left
 * as-is here (out of scope for #2491; a separate cleanup).
 * `emitIndexAccessRuby` no longer uses it: it always routes through the
 * runtime's polymorphic `bf.get` helper (#2491) rather than guessing at
 * compile time whether an index is a string key or numeric index — see
 * its own docstring below.
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison/index operand is string-typed. Covers a string
 * literal, a string-signal getter call (`sel()`), and a string prop access
 * (`props.x`). `isStringName` reports whether a getter/prop name is
 * known-string. Loop-element fields (`t.id`) on untyped arrays have no known
 * type and stay undetected — a separate, narrower gap.
 */
export function isStringTypedOperand(expr: ParsedExpr, isStringName: (n: string) => boolean): boolean {
  if (expr.kind === 'literal' && expr.literalType === 'string') return true
  if (expr.kind === 'call' && expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return isStringName(expr.callee.name)
  }
  if (expr.kind === 'member' && expr.object.kind === 'identifier' && expr.object.name === 'props') {
    return isStringName(expr.property)
  }
  return false
}

/**
 * Lower `arr[index]` to the runtime's polymorphic `bf.get` accessor
 * (`lib/barefoot_js.rb`) rather than guessing at compile time whether
 * `index` is a string key or a numeric index (#2491). Row hashes
 * deserialize with `symbolize_names: true`, so keys are Symbols while a
 * dynamic key (e.g. a destructured `.map()` param used as a key,
 * `tone[k]`) is a runtime String — `isStringTypedOperand` can't see
 * that shape (the shared analyzer types it `{kind:'unknown'}`), so the
 * previous `.to_sym`-or-not compile-time branch guessed wrong for that
 * case and silently returned nil. `bf.get` tries the Hash key as-is,
 * then as a Symbol, then as a String, and falls back to numeric Array
 * indexing — a strict superset of the two hand-picked forms this used
 * to emit, so the common loop-index case (`selected()[index]`) keeps
 * working unchanged.
 */
export function emitIndexAccessRuby(
  object: ParsedExpr,
  index: ParsedExpr,
  emit: (e: ParsedExpr) => string,
  isStringName: (n: string) => boolean,
): string {
  return `bf.get(${emit(object)}, ${emit(index)})`
}
