import { raw } from 'hono/html'

/**
 * Output HTML comment marker for conditional reconciliation.
 * Same signature as Go template bfComment function.
 */
export function bfComment(key: string) {
  return raw(`<!--bf-${key}-->`)
}

/**
 * Neutralize a value for splicing into `bfComment`'s HTML comment content
 * (#2795 follow-up). `comment`/`bfComment` itself is `<!--bf-${text}-->`
 * with no escaping — fine for every OTHER caller (`cond-start:s0`,
 * `loop:l0`, ...), whose text is entirely compiler-generated marker IDs,
 * but the whole-item-conditional loop's `loop-i:<key>` anchor
 * (`hono-adapter.ts`'s `bodyIsItemConditional` branch) carries a
 * user-controlled key. Standard HTML escaping doesn't help inside a
 * comment — only the literal sequence `-->` terminates it early, and
 * `&`/`<`/`>`/`"`/`'` are not special there. The key's exact text doesn't
 * need to round-trip (the client's `mapArrayAnchored` matches items
 * positionally and by its own JS-computed key, never by re-parsing the
 * anchor `Comment.nodeValue`), so replacing every `-` with the
 * visually-similar U+2010 is sufficient and needs no decoding.
 */
export function escapeCommentKey(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/-/g, '‐')
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
 * The throw set is narrower than BF049's flag set, but NOT because
 * `RegExp` / `Error` / `URLSearchParams` preserve more data than a `Map` or
 * `Set` — `JSON.stringify` degrades `RegExp` and `Error` to `{}` exactly
 * like a `Map`/`Set` (only `URLSearchParams` happens to round-trip its
 * key/value pairs as a plain object). They're excluded from the runtime
 * throw purely to avoid a breaking behavior change: `site/ui`'s InputOTP
 * demo already ships a live `RegExp` `pattern` prop that degrades to `{}`
 * today, and the component's own design tolerates that. They stay
 * diagnosable at compile time (BF049) only, not a runtime hard-stop.
 *
 * `liveOnlyProps` (Move C, Prop Boundary Contract, #2760's own follow-up) is
 * a DIFFERENT check bolted onto the same function, not another BF049-style
 * entry in the offender ladder above: a function VALUE is only ever a
 * problem when this specific prop is one this component's own client code
 * actually calls live (`ir.metadata.clientAnalysis.liveOnlyProps`, computed
 * by `computeLiveOnlyProps` in `packages/jsx/src/ir-to-client-js/index.ts`
 * — keyed by the prop's caller-facing name, valued by its declared type's
 * printable text so the error can name it without re-deriving it). A
 * function-typed prop this component declares but never actually reads is
 * simply not in that map, and is left to `JSON.stringify`'s own existing
 * behavior (silently dropped from the payload, exactly like an unused
 * `Symbol`-typed prop already is) — throwing for it would be a false
 * refusal.
 *
 * The caller (`hono-adapter.ts`) only ever invokes this for a ROOT mount
 * (`!__bfChild`) — a CHILD's serialization is skipped entirely at codegen,
 * so a live-only function prop never reaches here for a component that's
 * always used as a compiled child (`initChild`/`createComponent`) the way
 * BF049's own declaration-time check can't distinguish.
 */
export function serializeHydrationProps(
  props: Record<string, unknown>,
  componentName: string,
  liveOnlyProps: Record<string, string> = {},
): string | undefined {
  const keys = Object.keys(props)
  if (keys.length === 0) return undefined
  for (const key of keys) {
    const value = props[key]
    if (typeof value === 'function') {
      const declaredType = liveOnlyProps[key]
      if (declaredType === undefined) continue
      throw new TypeError(
        `[barefootjs] Cannot serialize prop '${key}' of <${componentName}> for hydration: it is declared ` +
          `\`${declaredType}\` and read by the component's client code, but a function cannot cross the bf-p ` +
          `JSON boundary (the client would hydrate against \`undefined\` and throw). A function-typed prop can ` +
          `only reach <${componentName}> live — render <${componentName}> from a compiled parent component ` +
          `(initChild) or mount it client-side (createComponent); from a route handler pass the data and let the ` +
          `component own the accessor.`,
      )
    }
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
      const consequence =
        offender === 'BigInt'
          ? ''
          : offender === 'Symbol'
            ? ' (the prop would be silently omitted from the payload entirely)'
            : offender === 'Promise'
              ? " (its eventual value would be silently unreachable — JSON.stringify can't wait for a promise to settle)"
              : ' (its entries would be silently dropped, serializing to {})'
      throw new TypeError(
        `[barefootjs] Cannot serialize prop '${key}' of <${componentName}> for hydration: a ${offender} does not ` +
          `survive the bf-p JSON boundary${consequence}. Pre-compute a JSON-safe value (string/number/array/plain ` +
          `object) server-side and pass that instead. See BF049 (https://github.com/piconic-ai/barefootjs/issues/2643).`,
      )
    }
  }
  return JSON.stringify(props)
}

