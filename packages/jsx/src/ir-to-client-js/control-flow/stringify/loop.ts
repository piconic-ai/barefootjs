/**
 * Stringify LoopPlan variants to source lines.
 *
 * Output shapes (preserved byte-identical from the legacy emitter):
 *
 *   PlainLoopPlan, no reactive effects (single-line renderItem):
 *     <indent>mapArray(() => <arr>, <container>, <keyFn>, (<head>, <idx>, __existing) =>
 *       { <unwrap?> <preamble?>; if (__existing) return __existing; const __tpl = ...; return ... })
 *
 *   PlainLoopPlan, with reactive effects (multi-line renderItem):
 *     <indent>mapArray(() => <arr>, <container>, <keyFn>, (<head>, <idx>, __existing) => {
 *     <indent>  <unwrap?>
 *     <indent>  <preamble?>
 *     <indent>  const __el = __existing ?? (() => { ... })()
 *     <indent>  <reactive effects via stringifyReactiveEffects>
 *     <indent>  return __el
 *     <indent>})
 *
 *   StaticLoopPlan: two parallel forEach blocks (attrs / texts) — see
 *     emitStaticLoop. The forEach-duplication noted in observation O-4 is
 *     preserved bug-for-bug; PR 5+ collapses them.
 *
 * Indent convention for plain loops: top-level emission uses `'  '` (2 sp);
 * passed in via `topIndent`.
 */

import { emitRefCall, varSlotId } from '../../utils'
import { emitAttrUpdate } from '../../emit-reactive'
import { stringifyReactiveEffects } from './reactive-effects'
import { emitTemplateCloneInline, emitLoopItemElementSetup } from './template-parse'
import { stringifyComponentLoop } from './component-loop'
import { stringifyCompositeLoop } from './composite-loop'
import type { LoopChildRefBinding, LoopPlan, PlainLoopPlan, StaticLoopPlan } from '../plan/types'

/**
 * Emit `(callback)(__rf)` for each ref on a per-item slot, looking up the
 * target element via `qsa(__el, '[bf="<slot>"]')` (or `qsaItem` for
 * multi-root bodies). A ref on the body root and a ref on any descendant
 * share the same emit shape — `qsa` matches root-or-descendant.
 *
 * Fires unconditionally on every renderItem invocation, which corresponds
 * to every actual mount: SSR hydration, initial CSR creation, and same-key
 * remount after unmount. mapArray does not call renderItem for same-key
 * reactive updates (those flow through per-item signal `setItem(...)`),
 * so the callback does not over-fire on plain prop changes (#1244).
 */
export function emitLoopChildRefs(
  lines: string[],
  refs: readonly LoopChildRefBinding[],
  opts: { indent: string; elVar: string; bodyIsMultiRoot: boolean },
): void {
  if (refs.length === 0) return
  const { indent, elVar, bodyIsMultiRoot } = opts
  const lookup = bodyIsMultiRoot ? 'qsaItem' : 'qsa'
  for (const ref of refs) {
    const varName = `__rf_${varSlotId(ref.childSlotId)}`
    lines.push(`${indent}{ const ${varName} = ${lookup}(${elVar}, '[bf="${ref.childSlotId}"]')`)
    lines.push(`${indent}if (${varName}) ${emitRefCall(ref.callback, varName)} }`)
  }
}

/**
 * Single dispatch over `LoopPlan` (#1253). Narrows on `plan.kind` and
 * delegates to the per-variant stringifier. Callers should consume this
 * rather than the per-variant functions so future shared-helper extraction
 * happens in one place.
 *
 * Trailing-newline policy: every variant ends its emission with a single
 * blank line so downstream code blocks (event delegation, child-init) are
 * separated from the loop body. `stringifyStaticLoop` already pushes its
 * trailing `''` internally; the dynamic variants push one here.
 */
export function stringifyLoop(lines: string[], plan: LoopPlan): void {
  switch (plan.kind) {
    case 'static':
      stringifyStaticLoop(lines, plan)
      return
    case 'composite':
      stringifyCompositeLoop(lines, plan)
      lines.push('')
      return
    case 'component':
      stringifyComponentLoop(lines, plan)
      lines.push('')
      return
    case 'plain':
      stringifyPlainLoop(lines, plan)
      lines.push('')
      return
    default:
      return assertNever(plan)
  }
}

/**
 * Exhaustiveness guard. Adding a new `LoopPlan` variant without a matching
 * `case` in `stringifyLoop` becomes a compile-time error (the parameter
 * stops narrowing to `never`) instead of a silent no-op at runtime.
 */
function assertNever(plan: never): never {
  const kind = (plan as { kind?: string } | null)?.kind
  throw new Error(`stringifyLoop: unhandled LoopPlan kind ${JSON.stringify(kind)}`)
}

export function stringifyPlainLoop(
  lines: string[],
  plan: PlainLoopPlan,
  topIndent: string = '  ',
): void {
  const {
    containerVar,
    markerId,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    mapPreambleWrapped,
    template,
    reactiveEffects,
    childRefs,
    bodyIsMultiRoot,
  } = plan

  // `childRefs` need `__el` as a handle to invoke the user's callback inside
  // the factory, so non-empty refs force the multi-line layout the same way
  // reactive effects do (#1244).
  if (reactiveEffects === null && !bodyIsMultiRoot && childRefs.length === 0) {
    // Single-line renderItem (no reactive effects, single root, no refs).
    const unwrapInline = paramUnwrap ? `${paramUnwrap} ` : ''
    const preamble = mapPreambleWrapped ? `${mapPreambleWrapped}; ` : ''
    const cloneExpr = emitTemplateCloneInline(template)
    lines.push(
      `${topIndent}mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => { ${unwrapInline}${preamble}if (__existing) return __existing; ${cloneExpr} }, '${markerId}')`,
    )
    return
  }

  // Multi-line renderItem (reactive effects present and/or multi-root and/or refs).
  lines.push(`${topIndent}mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
  const bodyIndent = topIndent + '  '
  if (paramUnwrap) lines.push(`${bodyIndent}${paramUnwrap}`)
  if (mapPreambleWrapped) lines.push(`${bodyIndent}${mapPreambleWrapped}`)
  emitLoopItemElementSetup(lines, {
    template,
    bodyIsMultiRoot,
    indent: bodyIndent,
    singleRootLayout: 'inline',
  })
  if (reactiveEffects !== null) {
    stringifyReactiveEffects(lines, reactiveEffects, { indent: bodyIndent, elVar: '__el', bodyIsMultiRoot })
  }
  emitLoopChildRefs(lines, childRefs, { indent: bodyIndent, elVar: '__el', bodyIsMultiRoot })
  lines.push(`${bodyIndent}return __el`)
  lines.push(`${topIndent}}, '${markerId}')`)
}

export function stringifyStaticLoop(lines: string[], plan: StaticLoopPlan): void {
  const { containerVar, arrayExpr, param, indexParam, childIndexExpr, attrsBySlot, texts, childRefs, csrMaterialize } = plan
  const hasAttrs = attrsBySlot.length > 0
  const hasTexts = texts.length > 0
  const hasRefs = childRefs.length > 0
  if (!hasAttrs && !hasTexts && !hasRefs && !csrMaterialize) return

  // Single forEach pass that handles reactive attrs, reactive texts, and
  // imperative ref callbacks. Pre-O-4 the legacy emitter wrote two parallel
  // forEach blocks (one per concern) over the same array — a wasted second
  // iteration plus a second `__iterEl = container.children[…]` lookup.
  // Merging them keeps the loop contract identical (`createEffect`s
  // subscribe to the same signals; attrs run before texts run before refs
  // within each iteration) while halving the setup cost.
  //
  // When `csrMaterialize` is set, the same forEach also self-heals an
  // empty container by cloning the per-iteration template — the CSR path
  // for a static loop whose array references an init-scope local (#1247).
  const parts: string[] = []
  if (hasAttrs) parts.push('Reactive attributes')
  if (hasTexts) parts.push('reactive texts')
  if (hasRefs) parts.push('ref callbacks')
  if (csrMaterialize) parts.push('CSR materialize')
  // Capitalise the first segment regardless of position so the comment reads
  // naturally when only `csrMaterialize` is set.
  if (parts.length > 0) parts[0] = parts[0][0].toUpperCase() + parts[0].slice(1)
  lines.push(`  // ${parts.join(' / ')} in static array children`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    ${arrayExpr}.forEach((${param}, ${indexParam}) => {`)
  // `mapPreamble` (the user's pre-return statements inside the .map callback's
  // block body, e.g. `const reacted = ...`) is emitted at the forEach body's
  // top so its bindings are visible BOTH to the materialize-clone branch (which
  // may interpolate them into the per-item template) AND to the reactive
  // bind branch below. Pinning it inside `if (!__iterEl)` only would leave
  // any preamble-declared local invisible to reactive-text / reactive-attr
  // expressions — a silent hidden dependency on `expandConstantForReactivity`
  // rescuing every such reference (#1247 follow-up).
  if (csrMaterialize?.mapPreamble) {
    lines.push(`      ${csrMaterialize.mapPreamble}`)
  }
  // `let` (not `const`) so the materialize branch can reassign after cloning.
  lines.push(`      let __iterEl = ${containerVar}.children[${childIndexExpr}]`)
  if (csrMaterialize) {
    lines.push(`      if (!__iterEl) {`)
    if (csrMaterialize.bodyIsMultiRoot) {
      // Multi-root: clone every top-level sibling of the per-item template and
      // insert them in order. `__iterEl` is the first root (the one reactive
      // bindings attach to); the rest land alongside it via insertBefore.
      lines.push(`        const __mtpl = document.createElement('template')`)
      lines.push(`        __mtpl.innerHTML = \`${csrMaterialize.itemTemplate}\``)
      lines.push(`        const __anchor = ${containerVar}.children[${childIndexExpr}] ?? null`)
      lines.push(`        let __first = null`)
      lines.push(`        let __sib = __mtpl.content.firstElementChild`)
      lines.push(`        while (__sib) {`)
      lines.push(`          const __next = __sib.nextElementSibling`)
      lines.push(`          const __cloned = __sib.cloneNode(true)`)
      lines.push(`          ${containerVar}.insertBefore(__cloned, __anchor)`)
      lines.push(`          if (!__first) __first = __cloned`)
      lines.push(`          __sib = __next`)
      lines.push(`        }`)
      lines.push(`        __iterEl = __first`)
    } else {
      lines.push(`        const __tpl = document.createElement('template')`)
      lines.push(`        __tpl.innerHTML = \`${csrMaterialize.itemTemplate}\``)
      lines.push(`        const __cloned = __tpl.content.firstElementChild`)
      lines.push(`        if (__cloned) {`)
      lines.push(`          const __anchor = ${containerVar}.children[${childIndexExpr}] ?? null`)
      lines.push(`          ${containerVar}.insertBefore(__cloned, __anchor)`)
      lines.push(`          __iterEl = __cloned`)
      lines.push(`        }`)
    }
    lines.push(`      }`)
  }
  lines.push(`      if (__iterEl) {`)
  for (const [slotId, attrs] of attrsBySlot) {
    const varName = `__t_${varSlotId(slotId)}`
    lines.push(`        const ${varName} = qsa(__iterEl, '[bf="${slotId}"]')`)
    lines.push(`        if (${varName}) {`)
    for (const attr of attrs) {
      lines.push(`          createEffect(() => {`)
      for (const stmt of emitAttrUpdate(varName, attr.attrName, attr.expression, attr)) {
        lines.push(`            ${stmt}`)
      }
      lines.push(`          })`)
    }
    lines.push(`        }`)
  }
  for (const text of texts) {
    const vn = `__rt_${varSlotId(text.slotId)}`
    lines.push(`        { const [${vn}] = $t(__iterEl, '${text.slotId}')`)
    lines.push(`        if (${vn}) createEffect(() => { ${vn}.textContent = String(${text.expression}) }) }`)
  }
  // Ref callbacks fire on every forEach iteration — initial mount and any
  // future array-change-driven re-iteration (#1244). For static arrays the
  // array is non-reactive, so refs effectively fire once per item.
  emitLoopChildRefs(lines, childRefs, { indent: '        ', elVar: '__iterEl', bodyIsMultiRoot: false })
  lines.push(`      }`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}
