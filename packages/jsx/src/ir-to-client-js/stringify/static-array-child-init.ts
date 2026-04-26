/**
 * Stringify `StaticArrayChildInitsPlan` to source lines.
 *
 * Three output shapes (preserved byte-identical from the legacy
 * `emitStaticArrayChildInits`):
 *
 *   single-comp:
 *     <i>// Initialize static array children (hydrate skips nested instances)
 *     <i>if (<container>) {
 *     <i>  const __childScopes = <container>.querySelectorAll('<selector>')
 *     <i>  __childScopes.forEach((childScope, <idx>) => {
 *     <i>    const <param> = <array>[<idx>]
 *     <i>    initChild('<name>', childScope, <props>)
 *     <i>  })
 *     <i>}
 *
 *   outer-nested:
 *     <i>// Initialize nested <name> in static array
 *     <i>if (<container>) {
 *     <i>  <array>.forEach((<param>, <idx>) => {
 *     <i>    const __iterEl = <container>.children[<offset>]
 *     <i>    if (__iterEl) {
 *     <i>      const __compEl = __iterEl.querySelector('<selector>')
 *     <i>      if (__compEl) initChild('<name>', __compEl, <props>)
 *     <i>    }
 *     <i>  })
 *     <i>}
 *
 *   inner-loop-nested:
 *     <i>// Initialize inner-loop components in static array (depth N)
 *     <i>if (<container>) {
 *     <i>  <outerArr>.forEach((<outerParam>, <outerIdx>) => {
 *     <i>    const __outerEl = <container>.children[<outerOffset>]
 *     <i>    if (!__outerEl) return
 *     <i>    const __ic = <innerContainer-or-outerEl>
 *     <i>    <innerArr>.forEach((<innerParam>, __innerIdx) => {
 *     <i>      const __innerEl = __ic.children[<innerOffset>]
 *     <i>      if (!__innerEl) return
 *     <i>      <per-comp lookup + initChild>
 *     <i>    })
 *     <i>  })
 *     <i>}
 *
 * Each block is followed by a single blank line for readability — same
 * as the legacy emitter.
 */

import type {
  InnerLoopNestedInitPlan,
  OuterNestedInitPlan,
  SingleCompInitPlan,
  StaticArrayChildInitPlan,
  StaticArrayChildInitsPlan,
} from '../plan/static-array-child-init'

export function stringifyStaticArrayChildInits(
  lines: string[],
  plans: StaticArrayChildInitsPlan,
): void {
  for (const plan of plans) {
    stringifyOne(lines, plan)
  }
}

function stringifyOne(lines: string[], plan: StaticArrayChildInitPlan): void {
  switch (plan.kind) {
    case 'single-comp':
      emitSingleComp(lines, plan)
      break
    case 'outer-nested':
      emitOuterNested(lines, plan)
      break
    case 'inner-loop-nested':
      emitInnerLoopNested(lines, plan)
      break
  }
}

function emitSingleComp(lines: string[], plan: SingleCompInitPlan): void {
  const { containerVar, componentName, childSelector, arrayExpr, param, indexParam, propsExpr } = plan
  lines.push(`  // Initialize static array children (hydrate skips nested instances)`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    const __childScopes = ${containerVar}.querySelectorAll('${childSelector}')`)
  lines.push(`    __childScopes.forEach((childScope, ${indexParam}) => {`)
  lines.push(`      const ${param} = ${arrayExpr}[${indexParam}]`)
  lines.push(`      initChild('${componentName}', childScope, ${propsExpr})`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}

function emitOuterNested(lines: string[], plan: OuterNestedInitPlan): void {
  const { containerVar, componentName, selector, arrayExpr, param, indexParam, offsetExpr, propsExpr } = plan
  lines.push(`  // Initialize nested ${componentName} in static array`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    ${arrayExpr}.forEach((${param}, ${indexParam}) => {`)
  lines.push(`      const __iterEl = ${containerVar}.children[${offsetExpr}]`)
  lines.push(`      if (__iterEl) {`)
  lines.push(`        const __compEl = __iterEl.querySelector('${selector}')`)
  lines.push(`        if (__compEl) initChild('${componentName}', __compEl, ${propsExpr})`)
  lines.push(`      }`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}

function emitInnerLoopNested(lines: string[], plan: InnerLoopNestedInitPlan): void {
  const {
    containerVar,
    outerArrayExpr,
    outerParam,
    outerIndexParam,
    outerOffsetExpr,
    innerContainerSlotId,
    innerArrayExpr,
    innerParam,
    innerOffsetExpr,
    depth,
    comps,
  } = plan
  lines.push(`  // Initialize inner-loop components in static array (depth ${depth})`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    ${outerArrayExpr}.forEach((${outerParam}, ${outerIndexParam}) => {`)
  lines.push(`      const __outerEl = ${containerVar}.children[${outerOffsetExpr}]`)
  lines.push(`      if (!__outerEl) return`)
  if (innerContainerSlotId) {
    lines.push(`      const __ic = __outerEl.querySelector('[bf="${innerContainerSlotId}"]') || __outerEl`)
  } else {
    lines.push(`      const __ic = __outerEl`)
  }
  lines.push(`      ${innerArrayExpr}.forEach((${innerParam}, __innerIdx) => {`)
  lines.push(`        const __innerEl = __ic.children[${innerOffsetExpr}]`)
  lines.push(`        if (!__innerEl) return`)
  for (const comp of comps) {
    lines.push(`        const __compEl = __innerEl.querySelector('${comp.selector}')`)
    lines.push(`        if (__compEl) initChild('${comp.componentName}', __compEl, ${comp.propsExpr})`)
  }
  lines.push(`      })`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}
