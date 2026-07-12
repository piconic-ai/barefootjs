/**
 * Stringify `StaticArrayChildInitsPlan` to source lines.
 *
 * Three output shapes (preserved byte-identical from the legacy
 * `emitStaticArrayChildInits`):
 *
 *   single-comp:
 *     <i>// Initialize static array children (hydrate skips nested instances)
 *     <i>if (<container>) {
 *     <i>  const __childScopes = qsaChildScopes(<container>, <selector>)
 *     <i>  __childScopes.forEach((childScope, <idx>) => {
 *     <i>    const <param> = <array>[<idx>]
 *     <i>    <outerPreludeStatements*>   // raw outer preamble (#1064)
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
 *     <i>      <outerPreludeStatements*>   // raw outer preamble (#1064)
 *     <i>      const __compEl = qsaChildScope(__iterEl, <selector>)
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
 *     <i>    <outerPreludeStatements*>   // raw outer preamble (#1064)
 *     <i>    const __ic = <innerContainer-or-outerEl>
 *     <i>    <innerArr>.forEach((<innerParam>, <innerIdx>) => {
 *     <i>      const __innerEl = __ic.children[<innerOffset>]
 *     <i>      if (!__innerEl) return
 *     <i>      <innerPreludeStatements*>   // raw inner preamble (#1064)
 *     <i>      <per-comp lookup + initChild>
 *     <i>    })
 *     <i>  })
 *     <i>}
 *
 * Each block is followed by a single blank line for readability — same
 * as the legacy emitter.
 */

import type {
  ComponentRootedInnerLoopInitPlan,
  InnerLoopNestedInitPlan,
  OuterNestedInitPlan,
  SingleCompInitPlan,
  StaticArrayChildInitPlan,
  StaticArrayChildInitsPlan,
} from '../plan/static-array-child-init.ts'
import { nameForRegistryRef } from '../component-scope.ts'

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
    case 'component-rooted-inner-loop':
      emitComponentRootedInnerLoop(lines, plan)
      break
  }
}

function emitSingleComp(lines: string[], plan: SingleCompInitPlan): void {
  const { containerVar, componentName, childSelector, arrayExpr, param, indexParam, outerPreludeStatements, propsExpr } = plan
  lines.push(`  // Initialize static array children (hydrate skips nested instances)`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    const __childScopes = qsaChildScopes(${containerVar}, ${childSelector})`)
  lines.push(`    __childScopes.forEach((childScope, ${indexParam}) => {`)
  lines.push(`      const ${param} = ${arrayExpr}[${indexParam}]`)
  // Outer `.map()` callback preamble locals — emitted unwrapped after
  // the `param` lookup so they can read it (#1064). Must precede the
  // `initChild` call because the propsExpr getter resolves them lazily.
  for (const stmt of outerPreludeStatements) {
    lines.push(`      ${stmt}`)
  }
  lines.push(`      initChild('${nameForRegistryRef(componentName)}', childScope, ${propsExpr})`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}

function emitOuterNested(lines: string[], plan: OuterNestedInitPlan): void {
  const { containerVar, componentName, selector, arrayExpr, param, indexParam, offsetExpr, outerPreludeStatements, propsExpr } = plan
  lines.push(`  // Initialize nested ${componentName} in static array`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    ${arrayExpr}.forEach((${param}, ${indexParam}) => {`)
  lines.push(`      const __iterEl = ${containerVar}.children[${offsetExpr}]`)
  lines.push(`      if (__iterEl) {`)
  // Outer `.map()` callback preamble locals — emitted unwrapped (forEach
  // param is the literal item, #1064). Placed inside the `if (__iterEl)`
  // block so the "no SSR element ⇒ skip work" semantics match
  // `inner-loop-nested`'s post-guard placement.
  for (const stmt of outerPreludeStatements) {
    lines.push(`        ${stmt}`)
  }
  lines.push(`        const __compEl = qsaChildScope(__iterEl, ${selector})`)
  lines.push(`        if (__compEl) initChild('${nameForRegistryRef(componentName)}', __compEl, ${propsExpr})`)
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
    outerPreludeStatements,
    innerContainerSlotId,
    innerArrayExpr,
    innerParam,
    innerIndexParam,
    innerOffsetExpr,
    innerPreludeStatements,
    depth,
    comps,
  } = plan
  lines.push(`  // Initialize inner-loop components in static array (depth ${depth})`)
  lines.push(`  if (${containerVar}) {`)
  lines.push(`    ${outerArrayExpr}.forEach((${outerParam}, ${outerIndexParam}) => {`)
  lines.push(`      const __outerEl = ${containerVar}.children[${outerOffsetExpr}]`)
  lines.push(`      if (!__outerEl) return`)
  // Outer `.map()` callback preamble — locals declared here may be read
  // by inner forEach's component setup (#1064).
  for (const stmt of outerPreludeStatements) {
    lines.push(`      ${stmt}`)
  }
  if (innerContainerSlotId) {
    lines.push(`      const __ic = __outerEl.querySelector('[bf="${innerContainerSlotId}"]') || __outerEl`)
  } else {
    lines.push(`      const __ic = __outerEl`)
  }
  lines.push(`      ${innerArrayExpr}.forEach((${innerParam}, ${innerIndexParam}) => {`)
  lines.push(`        const __innerEl = __ic.children[${innerOffsetExpr}]`)
  lines.push(`        if (!__innerEl) return`)
  // Inner `.map()` callback preamble — must precede the per-component
  // prop getters so they can resolve the locals (#1064).
  for (const stmt of innerPreludeStatements) {
    lines.push(`        ${stmt}`)
  }
  // Each inner-loop component gets a uniquely-suffixed `__compEl` binding.
  // Multiple comps share one inner `forEach` body, so a fixed name would
  // re-declare `const __compEl` in the same scope (#1664).
  comps.forEach((comp, i) => {
    const compElVar = comps.length > 1 ? `__compEl${i}` : '__compEl'
    lines.push(`        const ${compElVar} = qsaChildScope(__innerEl, ${comp.selector})`)
    lines.push(`        if (${compElVar}) initChild('${nameForRegistryRef(comp.componentName)}', ${compElVar}, ${comp.propsExpr})`)
  })
  lines.push(`      })`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}

/**
 * Emit shape for `component-rooted-inner-loop` (#1725):
 *
 *   <i>// Initialize component-rooted inner-loop components (depth N)
 *   <i>if (<container>) {
 *   <i>  const <scopes_c> = qsaChildScopes(<container>, <selector_c>)   // per comp
 *   <i>  let <cursor_c> = 0
 *   <i>  <outerArr>.forEach((<outerParam>[, <outerIdx>]) => {
 *   <i>    <outerPreludeStatements*>
 *   <i>    <innerArr>.forEach((<innerParam>[, <innerIdx>]) => {
 *   <i>      <innerPreludeStatements*>
 *   <i>      const <compEl_c> = <scopes_c>[<cursor_c>++]              // per comp
 *   <i>      if (<compEl_c>) initChild('<name>', <compEl_c>, <props>)
 *   <i>    })
 *   <i>  })
 *   <i>}
 *
 * The scopes are queried once over the whole container and consumed in
 * document order by a per-component cursor, so the SSR render order
 * (outer-then-inner, depth-first) pairs each scope with its data item
 * whether the outer component root is an element or a fragment.
 */
function emitComponentRootedInnerLoop(lines: string[], plan: ComponentRootedInnerLoopInitPlan): void {
  const {
    containerVar,
    outerArrayExpr,
    outerParam,
    outerIndexParam,
    outerPreludeStatements,
    innerArrayExpr,
    innerParam,
    innerIndexParam,
    innerPreludeStatements,
    depth,
    comps,
  } = plan
  // A single comp uses the bare `__compScopes` / `__ci` names; multiple
  // comps (e.g. `{items.map(it => <><A/><B/></>)}`) get index suffixes so
  // each keeps its own document-order cursor.
  const scopesVar = (i: number) => (comps.length > 1 ? `__compScopes${i}` : '__compScopes')
  const cursorVar = (i: number) => (comps.length > 1 ? `__ci${i}` : '__ci')
  const compElVar = (i: number) => (comps.length > 1 ? `__compEl${i}` : '__compEl')

  lines.push(`  // Initialize component-rooted inner-loop components (depth ${depth})`)
  lines.push(`  if (${containerVar}) {`)
  comps.forEach((comp, i) => {
    lines.push(`    const ${scopesVar(i)} = qsaChildScopes(${containerVar}, ${comp.selector})`)
    lines.push(`    let ${cursorVar(i)} = 0`)
  })
  // Declared index names are appended to the forEach heads (#2231);
  // index-less loops keep the bare single-param head byte-identical.
  lines.push(`    ${outerArrayExpr}.forEach((${outerParam}${outerIndexParam ? `, ${outerIndexParam}` : ''}) => {`)
  for (const stmt of outerPreludeStatements) {
    lines.push(`      ${stmt}`)
  }
  lines.push(`      ${innerArrayExpr}.forEach((${innerParam}${innerIndexParam ? `, ${innerIndexParam}` : ''}) => {`)
  for (const stmt of innerPreludeStatements) {
    lines.push(`        ${stmt}`)
  }
  comps.forEach((comp, i) => {
    lines.push(`        const ${compElVar(i)} = ${scopesVar(i)}[${cursorVar(i)}++]`)
    lines.push(`        if (${compElVar(i)}) initChild('${nameForRegistryRef(comp.componentName)}', ${compElVar(i)}, ${comp.propsExpr})`)
  })
  lines.push(`      })`)
  lines.push(`    })`)
  lines.push(`  }`)
  lines.push('')
}
