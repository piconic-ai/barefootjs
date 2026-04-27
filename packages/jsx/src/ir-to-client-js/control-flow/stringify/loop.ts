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

import { varSlotId } from '../../utils'
import { emitAttrUpdate } from '../../emit-reactive'
import { stringifyReactiveEffects } from './reactive-effects'
import { emitTemplateCloneInline } from './template-parse'
import type { PlainLoopPlan, StaticLoopPlan } from '../plan/types'

export function stringifyPlainLoop(
  lines: string[],
  plan: PlainLoopPlan,
  topIndent: string = '  ',
): void {
  const {
    containerVar,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    mapPreambleWrapped,
    template,
    reactiveEffects,
  } = plan

  if (reactiveEffects === null) {
    // Single-line renderItem (no reactive effects).
    const unwrapInline = paramUnwrap ? `${paramUnwrap} ` : ''
    const preamble = mapPreambleWrapped ? `${mapPreambleWrapped}; ` : ''
    const cloneExpr = emitTemplateCloneInline(template)
    lines.push(
      `${topIndent}mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => { ${unwrapInline}${preamble}if (__existing) return __existing; ${cloneExpr} })`,
    )
    return
  }

  // Multi-line renderItem (reactive effects present).
  lines.push(`${topIndent}mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
  const bodyIndent = topIndent + '  '
  if (paramUnwrap) lines.push(`${bodyIndent}${paramUnwrap}`)
  if (mapPreambleWrapped) lines.push(`${bodyIndent}${mapPreambleWrapped}`)
  const cloneExpr = emitTemplateCloneInline(template)
  lines.push(`${bodyIndent}const __el = __existing ?? (() => { ${cloneExpr} })()`)
  stringifyReactiveEffects(lines, reactiveEffects, { indent: bodyIndent, elVar: '__el' })
  lines.push(`${bodyIndent}return __el`)
  lines.push(`${topIndent}})`)
}

export function stringifyStaticLoop(lines: string[], plan: StaticLoopPlan): void {
  const { containerVar, arrayExpr, param, indexParam, childIndexExpr, attrsBySlot, texts } = plan
  const hasAttrs = attrsBySlot.length > 0
  const hasTexts = texts.length > 0
  if (!hasAttrs && !hasTexts) return

  // Single forEach pass that handles both reactive attrs and reactive texts.
  // Pre-O-4 the legacy emitter wrote two parallel forEach blocks (one per
  // concern) over the same array — a wasted second iteration plus a second
  // `__iterEl = container.children[…]` lookup. Merging them keeps the loop
  // contract identical (`createEffect`s subscribe to the same signals;
  // attrs run before texts within each iteration) while halving the
  // setup cost.
  const heading = hasAttrs && hasTexts
    ? '// Reactive attributes and texts in static array children'
    : hasAttrs
      ? '// Reactive attributes in static array children'
      : '// Reactive texts in static array children'
  lines.push(`  ${heading}`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    ${arrayExpr}.forEach((${param}, ${indexParam}) => {`)
  lines.push(`      const __iterEl = ${containerVar}.children[${childIndexExpr}]`)
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
  lines.push(`      }`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}
