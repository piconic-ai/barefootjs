/**
 * Escape-by-default for client-JS HTML template strings (#2795).
 *
 * Every builder in `html-template.ts` assembles a JS template literal whose
 * `${...}` holes are evaluated in the browser and parsed as HTML
 * (`innerHTML`). Whether a hole's value is escaped used to be an OPT-IN each
 * builder remembered separately — `escapeInClientTemplate` on the IR node, a
 * pre-baked `escapeText(...)` string in `templateExpr`, an
 * `escapeLeafTextExpressions` rewrite pass, and a hand-rolled `escapeText`
 * in `buildPreambleRegionPlans` — and a forgotten opt-in shipped raw text
 * twice (#1694, #2765/#2792). This module inverts that:
 *
 *   - `SafeHtml` is a compile-time nominal brand (the `TsxSourceText`
 *     precedent, `types.ts`) on a JS EXPRESSION STRING meaning "when this
 *     evaluates in the client template, the result is HTML that is safe to
 *     concatenate in". Nothing outside this module can construct one, so a
 *     `SafeHtml` value is the compiler vouching for itself — unlike the
 *     runtime `bfMarkup()` brand (`@barefootjs/client/runtime`), which
 *     vouches for a value the compiler never saw.
 *   - `interp` is the ONLY way to turn a value into a `${...}` hole, and it
 *     accepts `SafeHtml` only. A builder holding a plain `string` cannot
 *     splice it: it must either go through a named producer below (each of
 *     which documents WHY its output is safe) or through `spliceChildValue`,
 *     the door for a child-position expression, whose default is
 *     `escapeText(...)`.
 *
 * The runtime dispatch that already existed for values the compiler cannot
 * classify statically is unchanged: a branch-slot value still goes through
 * `__bfSlot` (may be a live Node), a claim-plan `'markup'` slot still goes
 * through `escapeTextOrMarkup` (may be a `bfMarkup()`-branded prop). Those
 * are producers here too — they escape internally, so their output is safe
 * by construction.
 *
 * Attribute-value holes (`escapeAttr`, `spreadAttrs`) are a separate,
 * always-on path in `html-template.ts` and are not routed through this
 * module; `client-template-escape-soundness.test.ts` pins their count.
 */

import type { IRExpression } from '../types.ts'

/**
 * A JS expression string that evaluates, in the client template, to HTML
 * safe to splice raw. Branded at construction by the producers below; only
 * `interp` consumes it.
 */
export type SafeHtml = string & { readonly __safeHtmlBrand: unique symbol }

/** The single place the brand is applied. Module-private on purpose. */
function safeHtml(expr: string): SafeHtml {
  return expr as SafeHtml
}

/**
 * Emit a `${...}` hole. The parameter type is the whole mechanism: a builder
 * that has only a `string` in hand cannot call this, so "forgot to escape"
 * is a type error at the splice, not a runtime surprise in the browser.
 */
export function interp(span: SafeHtml): string {
  return `\${${span}}`
}

// ---------------------------------------------------------------------------
// Producers — escaping forms. Each wraps a runtime helper from
// `@barefootjs/client/runtime` (see `imports.ts`'s allowlist) that escapes
// its own input.
// ---------------------------------------------------------------------------

/** `escapeText(expr)` — the default for any child-position value. */
export function escapedText(expr: string): SafeHtml {
  return safeHtml(`escapeText(${expr})`)
}

/**
 * `escapeTextOrMarkup(expr)` — `escapeText`'s strict superset that unwraps a
 * `bfMarkup()`-branded value raw (#2651). Used only for a slot whose
 * REACTIVE claim writer is `kind: 'markup'` (`markup-slots.ts`), so the
 * initial render and the update agree on whether the slot may carry a
 * compiler-built JSX prop value.
 */
export function escapedTextOrMarkup(expr: string): SafeHtml {
  return safeHtml(`escapeTextOrMarkup(${expr})`)
}

/**
 * `__bfSlot(expr, slots)` — a conditional-branch `template()` value. The
 * runtime returns raw `<!--bf-slot:N-->` markers for live Nodes (spliced
 * back by `insert()`) and `escapeText`s every string itself
 * (`branch-slot.ts`). Wrapping this in another escape corrupts the markers
 * and drops slotted content (the #1694 regression) — hence a producer, not
 * an input to `escapedText`.
 */
export function branchSlotValue(expr: string, slotsVar: string): SafeHtml {
  return safeHtml(`__bfSlot(${expr}, ${slotsVar})`)
}

// ---------------------------------------------------------------------------
// Producers — already-HTML forms. The value is markup the compiler or
// runtime built (and escaped piecewise) BEFORE it reaches the hole.
// ---------------------------------------------------------------------------

/**
 * `markupOrEmpty(expr)` — a bare `{children}` passthrough (#2775). The value
 * is the HTML string `materializeComponent` joined from the caller's
 * children, or `undefined` when none were passed; the helper's entire job is
 * the nullish case. Never escaped: escaping would render real child markup
 * as visible `&lt;span&gt;` text.
 */
export function childrenMarkup(expr: string): SafeHtml {
  return safeHtml(`markupOrEmpty(${expr})`)
}

/**
 * Stage 3 / D4 — an element-array child (`{out}`) built by an arbitrary
 * `.map()` preamble is an array of compiled-leaf HTML strings; join it
 * rather than let `${[...]}` `String`-comma-collapse it. Each leaf's own
 * holes already went through `interp`, so the concatenation is exactly as
 * safe as any other compiler-emitted fragment. Also used by
 * `buildPreambleRegionPlans` for the region-patch effect's value so the
 * re-render matches the row template byte-for-byte.
 */
export function joinedMarkup(expr: string): SafeHtml {
  return safeHtml(`Array.isArray(${expr}) ? ${expr}.join('') : (${expr} ?? '')`)
}

/**
 * `renderChild('Name', props, ...scopeArgs)` — a child component rendered
 * from its registered template at runtime. Its output is that component's
 * own compiled template, whose holes went through this module in turn.
 */
export function renderChildCall(registryName: string, propsExpr: string, tailArgs: string): SafeHtml {
  return safeHtml(`renderChild('${registryName}', ${propsExpr}${tailArgs})`)
}

/**
 * `dangerouslySetInnerHTML={{ __html: E }}` — the intentional, React-style,
 * author-facing escape hatch, and the ONLY one: the element's content is
 * whatever `E.__html` holds, unescaped by design (mirroring every SSR
 * adapter's native handling). The name carries the warning so an audit of
 * raw-markup producers (`grep dangerousInnerHtml`) finds it.
 */
export function dangerousInnerHtml(expr: string): SafeHtml {
  return safeHtml(`((${expr}) ?? {}).__html ?? ''`)
}

/**
 * `cond ? \`whenTrue\` : \`whenFalse\`` — both branches are compiled
 * template-literal BODIES (already-assembled HTML with `interp`ed holes),
 * not values; the condition only selects between them.
 */
export function conditionalMarkup(condition: string, whenTrue: string, whenFalse: string): SafeHtml {
  return safeHtml(`${condition} ? \`${whenTrue}\` : \`${whenFalse}\``)
}

/**
 * `array.method(params => body).join('')` — a loop rendered inline. `body`
 * is either a compiled row template literal (\`...\`), a preamble block
 * returning one, or a flatMap descriptor body rendered through
 * `renderPreamble`; every hole inside it went through `interp`.
 */
export function mappedRowsMarkup(arrayExpr: string, method: string, params: string, body: string): SafeHtml {
  return safeHtml(`${arrayExpr}.${method}(${params} => ${body}).join('')`)
}

/** The empty string literal — a deferred placeholder the init effect fills (#1128). */
export const EMPTY_MARKUP: SafeHtml = safeHtml("''")

// ---------------------------------------------------------------------------
// The door for a child-position expression node.
// ---------------------------------------------------------------------------

/**
 * Recognizes a JSX child-position expression that is exactly a reference to
 * the reserved `children` prop — bare `children` (destructured) or
 * `<receiver>.children` for any single-identifier receiver (`props.children`,
 * a custom props-param name, a loop-scoped alias closing over props, ...).
 *
 * Deliberately LOOSER than `isTransparentFragment` (`jsx-to-ir.ts`), which
 * runs on the TS AST with the analyzer-resolved props name in hand. This
 * layer works on IR text with no analyzer, so any single-identifier receiver
 * is the available approximation. The looseness costs nothing measurable: an
 * unrelated `.children` member (a tree node's own `children` array, say) is a
 * reactive member expression that gets a `slotId` and takes the slotted arm
 * of `spliceChildValue` before this predicate is consulted.
 */
function isChildrenPassthroughExpr(expr: string): boolean {
  return /^([A-Za-z_$][\w$]*\.)?children$/.test(expr.trim())
}

export interface ChildSpliceContext {
  /**
   * Set while emitting inside a conditional-branch `template()` arrow
   * (`irToHtmlTemplate`'s `branchSlotsVar`): every value in that context is
   * routed through `__bfSlot`, which owns its own coercion.
   */
  readonly branchSlotsVar?: string
  /**
   * Slot ids whose reactive claim writer is `kind: 'markup'`
   * (`markupSlotIdsOf(ctx)`, `markup-slots.ts`). Absent for the loop-row /
   * branch-row builders, whose reactive twin is a `kind: 'text'` writer
   * (`String(...)` into `nodeValue`) — plain `escapeText` is the consistent
   * choice there, and it is also the choice that never unwraps a
   * `bfMarkup()`-shaped object arriving in JSON-sourced loop data.
   */
  readonly markupSlotIds?: ReadonlySet<string>
}

/**
 * THE door for a child-position `IRExpression` value entering a client HTML
 * template. Takes the caller's already-wrapped/transformed expression text
 * (`wrapExpr` / `transformExpr` output) and decides, in exactly one place,
 * which producer it goes through. The last arm is the default, and it
 * escapes: there is no arm that returns `valueExpr` unwrapped.
 *
 * Arms, first match wins:
 *   1. `joinArrayChild`         → `joinedMarkup`      (array of compiled leaves)
 *   2. `branchSlotsVar`         → `branchSlotValue`   (runtime coercion, may be a Node)
 *   3. `slotId` ∈ markupSlotIds → `escapedTextOrMarkup`
 *   4. `slotId`                 → `escapedText`
 *   5. `{children}` passthrough → `childrenMarkup`    (bare splice only, #2775/#2786)
 *   6. otherwise                → `escapedText`
 *
 * Arm 5 tests BOTH `node.expr` (the original source text, stable across
 * builders) and the caller's resolved form (parens stripped): a
 * destructured-and-renamed children (`const { children: kids } = props`)
 * reads `kids` in the source and `(_p.children)` after substitution, and
 * either alone misses one of the two shapes (#2786).
 */
export function spliceChildValue(
  node: Pick<IRExpression, 'expr' | 'slotId' | 'joinArrayChild'>,
  valueExpr: string,
  cx: ChildSpliceContext,
): SafeHtml {
  if (node.joinArrayChild) return joinedMarkup(valueExpr)
  if (cx.branchSlotsVar) return branchSlotValue(valueExpr, cx.branchSlotsVar)
  if (node.slotId) {
    return cx.markupSlotIds?.has(node.slotId) ? escapedTextOrMarkup(valueExpr) : escapedText(valueExpr)
  }
  const resolved = valueExpr.trim().replace(/^\(+|\)+$/g, '')
  if (isChildrenPassthroughExpr(node.expr) || isChildrenPassthroughExpr(resolved)) {
    return childrenMarkup(valueExpr)
  }
  return escapedText(valueExpr)
}
