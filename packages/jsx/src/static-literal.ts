/**
 * Fully compile-time-known literal evaluation (#2208). A `ParsedExpr` that
 * is a literal, a no-substitution (or fully-static) template literal, an
 * array-literal of pure elements, or an object-literal of pure values
 * evaluates here to its plain JS value. Consumed by each adapter's
 * `renderLoop` to admit a function-scope local const whose initializer is
 * entirely known at compile time as a loop source — inlining its value the
 * same way a module-scope const already is — while still refusing a
 * runtime-computed expression (`Object.entries(props.tags).filter(...)`,
 * #2069) with BF101, since `call`/unresolvable-`member` shapes fall through
 * to `null` below.
 *
 * Analysis only: this module never emits template syntax. Each adapter
 * serializes the resolved JS value into its own native literal syntax
 * (`packages/adapter-<name>/src/adapter/lib/static-value.ts`).
 */

import type { ParsedExpr } from './expression-parser.ts'
import type { ConstantInfo } from './types.ts'

/**
 * Recursively evaluate a `ParsedExpr` that is a fully compile-time-known
 * literal to its JS value. `bindings` lets a caller resolve identifiers
 * (and member reads off them) against already-evaluated values — e.g. the
 * Go adapter binding a loop's item parameter to one already-resolved array
 * element while baking per-item child-component props. Returns `null` when
 * the expression is not statically known (depends on a prop, signal,
 * function call, or an identifier absent from `bindings`).
 */
export function evaluateStaticLiteral(
  expr: ParsedExpr,
  bindings?: ReadonlyMap<string, unknown>,
): { value: unknown } | null {
  switch (expr.kind) {
    case 'literal':
      return { value: expr.value }
    case 'template-literal': {
      let out = ''
      for (const part of expr.parts) {
        if (part.type === 'string') {
          out += part.value
          continue
        }
        const resolved = evaluateStaticLiteral(part.expr, bindings)
        if (!resolved) return null
        out += String(resolved.value)
      }
      return { value: out }
    }
    case 'array-literal': {
      const values: unknown[] = []
      for (const element of expr.elements) {
        const resolved = evaluateStaticLiteral(element, bindings)
        if (!resolved) return null
        values.push(resolved.value)
      }
      return { value: values }
    }
    case 'object-literal': {
      // Shorthand (`{ a }`) and explicit (`{ a: value }`) properties both
      // carry their resolved tree in `value` (shorthand's is an
      // `identifier`) — recursing here handles both uniformly: a shorthand
      // property only resolves when `bindings` supplies it.
      const out: Record<string, unknown> = {}
      for (const prop of expr.properties) {
        const resolved = evaluateStaticLiteral(prop.value, bindings)
        if (!resolved) return null
        out[prop.key] = resolved.value
      }
      return { value: out }
    }
    case 'unary': {
      const resolved = evaluateStaticLiteral(expr.argument, bindings)
      if (!resolved) return null
      if (expr.op === '-') return typeof resolved.value === 'number' ? { value: -resolved.value } : null
      if (expr.op === '+') return typeof resolved.value === 'number' ? { value: +resolved.value } : null
      if (expr.op === '!') return { value: !resolved.value }
      return null
    }
    case 'identifier':
      return bindings?.has(expr.name) ? { value: bindings.get(expr.name) } : null
    case 'member': {
      const base = evaluateStaticLiteral(expr.object, bindings)
      if (!base || base.value === null || typeof base.value !== 'object') return null
      return { value: (base.value as Record<string, unknown>)[expr.property] }
    }
    case 'index-access': {
      const base = evaluateStaticLiteral(expr.object, bindings)
      const index = evaluateStaticLiteral(expr.index, bindings)
      if (!base || !index || !Array.isArray(base.value) || typeof index.value !== 'number') return null
      return { value: base.value[index.value] }
    }
    default:
      return null
  }
}

/** `true` iff {@link evaluateStaticLiteral} resolves `expr` with no bindings. */
export function isFullyStaticLiteral(expr: ParsedExpr): boolean {
  return evaluateStaticLiteral(expr) !== null
}

/**
 * Shared loop-source resolution for `renderLoop` across adapters: the loop
 * array is either an inline array-literal, or a bare identifier naming a
 * FUNCTION-scope (`!isModule`) local const whose initializer evaluates
 * statically. Module-scope consts are deliberately excluded — an existing,
 * separate seeding path already handles those. Returns the evaluated items,
 * or `null` if the source isn't resolvable this way (including when it
 * resolves to something other than an array).
 */
export function resolveStaticLoopSource(
  arrayParsed: ParsedExpr | undefined,
  localConstants: ReadonlyArray<ConstantInfo> | undefined,
  opts?: { isNameShadowed?: (name: string) => boolean },
): unknown[] | null {
  if (!arrayParsed) return null
  let target = arrayParsed
  if (arrayParsed.kind === 'identifier') {
    if (opts?.isNameShadowed?.(arrayParsed.name)) return null
    const local = localConstants?.find(c => c.name === arrayParsed.name)
    if (!local || local.isModule || !local.parsed) return null
    target = local.parsed
  }
  const resolved = evaluateStaticLiteral(target)
  if (!resolved || !Array.isArray(resolved.value)) return null
  return resolved.value
}
