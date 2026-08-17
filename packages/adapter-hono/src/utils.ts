import { raw } from 'hono/html'

/**
 * Output HTML comment marker for conditional reconciliation.
 * Same signature as Go template bfComment function.
 */
export function bfComment(key: string) {
  return raw(`<!--bf-${key}-->`)
}

/**
 * Output opening comment marker for reactive text expressions.
 * Renders <!--bf:slotId-->
 */
export function bfText(slotId: string) {
  return raw(`<!--bf:${slotId}-->`)
}

/**
 * Output closing comment marker for reactive text expressions.
 * Renders <!--/-->
 */
export function bfTextEnd() {
  return raw('<!--/-->')
}

/**
 * Serialize a component's hydration props into the `bf-p` JSON payload,
 * throwing a clear, actionable error instead of `JSON.stringify`'s opaque
 * `TypeError` (for a `BigInt`) or silently succeeding with data loss (for a
 * `Map`/`Set`/etc.) — the runtime backstop for #2643's compile-time check
 * (`checkRichTypePropSerialization`, BF049), which can only catch a prop
 * whose type is PROVABLE from `propsType`. An imported/aliased type
 * (`type Timestamp = Map<…>`), or a prop typed too loosely to resolve
 * statically, reaches this function uncaught by BF049, so it needs its own
 * check here to avoid regressing to the pre-#2643 failure modes.
 *
 * Deliberately checks only TOP-LEVEL prop values, not nested shapes —
 * `JSON.stringify`'s existing deep-degradation behavior for a nested rich
 * value (e.g. a `RegExp` inside a plain object) is unchanged, matching a
 * real, shipped, TOLERATED pattern in this repo (`site/ui`'s InputOTP demo
 * passes a live `RegExp` `pattern` prop that degrades to `{}` today; the
 * component's own design accounts for that). Widening this to a deep walk
 * would turn that accepted degradation into a new SSR 500.
 *
 * The throw set is narrower than BF049's flag set for the same reason:
 * `RegExp` / `Error` / `URLSearchParams` degrade to SOMETHING (`{}` — no
 * different from any other type-erased plain object) rather than either
 * throwing or losing structurally-required data, so they stay diagnosable
 * at compile time only, not a runtime hard-stop.
 */
export function serializeHydrationProps(props: Record<string, unknown>, componentName: string): string | undefined {
  const keys = Object.keys(props)
  if (keys.length === 0) return undefined
  for (const key of keys) {
    const value = props[key]
    const offender =
      typeof value === 'bigint'
        ? 'BigInt'
        : typeof value === 'symbol'
          ? 'Symbol'
          : value instanceof Map
            ? 'Map'
            : value instanceof Set
              ? 'Set'
              : value instanceof WeakMap
                ? 'WeakMap'
                : value instanceof WeakSet
                  ? 'WeakSet'
                  : value instanceof Promise
                    ? 'Promise'
                    : null
    if (offender !== null) {
      const consequence = offender === 'BigInt' ? '' : ' (its contents would be silently dropped)'
      throw new TypeError(
        `[barefootjs] Cannot serialize prop '${key}' of <${componentName}> for hydration: a ${offender} does not ` +
          `survive the bf-p JSON boundary${consequence}. Pre-compute a JSON-safe value (string/number/array/plain ` +
          `object) server-side and pass that instead. See BF049 (https://github.com/piconic-ai/barefootjs/issues/2643).`,
      )
    }
  }
  return JSON.stringify(props)
}

