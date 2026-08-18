/**
 * Stringify `InnerLoopsPlan` into source lines.
 *
 * Two emission shapes (mode-discriminated, byte-identical to the legacy
 * `emitInnerLoopSetup`):
 *
 *   reactive — full mapArray:
 *     <indent>// Reactive inner loop: <arraySrc>
 *     <indent>{ const __ic<uid> = <containerExpr>
 *     <indent>if (__ic<uid>) mapArray(() => <arrayExpr> || [], __ic<uid>, <keyFn>, (<head>, __innerIdx<uid>, __existing) => {
 *     <indent>  <preludeStatements*>   // unwrap, then preamble (#1052)
 *     <indent>  let __innerEl<uid> = __existing ?? clone(template)
 *     <indent>  __innerEl<uid>.setAttribute('<keyAttr>', String(<wrappedKey>))?
 *     <indent>  emitComponentAndEventSetup(...)
 *     <indent>  recurse on childLevels
 *     <indent>  reactive text effects
 *     <indent>  return __innerEl<uid>
 *     <indent>}) }
 *
 *   static — forEach setup-only:
 *     <indent>// Initialize <arraySrc> loop components and events
 *     <indent>{ const __ic<uid> = <containerExpr>
 *     <indent>if (__ic<uid> && <arrayExpr>) <arrayExpr>.forEach((<param>, __innerIdx<uid>) => {
 *     <indent>  const __innerEl<uid> = __ic<uid>.children[__innerIdx<uid>]
 *     <indent>  if (!__innerEl<uid>) return
 *     <indent>  <preludeStatements*>   // raw preamble (#1064)
 *     <indent>  __innerEl<uid>.setAttribute('<keyAttr>', String(<rawKey>))?
 *     <indent>  emitComponentAndEventSetup(...)
 *     <indent>  recurse on childLevels
 *     <indent>}) }
 */

import { keyAttrName, profileBindingId, varSlotId } from '../../utils.ts'
import { emitComponentAndEventSetup } from '../shared.ts'
import { emitAttrUpdate } from '../../emit-reactive.ts'
import { emitMultiRootTemplateCloneLines, namespaceWrapForTemplate } from './template-parse.ts'
import { emitLoopChildRefs } from './loop.ts'
import { claimPlanLiteral, claimWriterVarName, type ClaimSlotSpec } from './claim-plan.ts'
import type {
  InnerLoopPlan,
  InnerLoopsPlan,
} from '../plan/inner-loop.ts'

export function stringifyInnerLoops(
  lines: string[],
  plan: InnerLoopsPlan,
  indent: string,
  pc?: string,
): void {
  for (const inner of plan) {
    if (inner.emit.mode === 'reactive') {
      emitReactive(lines, inner, indent, pc)
    } else {
      emitStatic(lines, inner, indent, pc)
    }
  }
}

function emitReactive(lines: string[], inner: InnerLoopPlan, indent: string, pc: string | undefined): void {
  const uid = inner.uidSuffix
  const emit = inner.emit
  if (emit.mode !== 'reactive') return // narrow

  lines.push(`${indent}// Reactive inner loop: ${inner.arraySrc}`)
  lines.push(`${indent}{ const __ic${uid} = ${inner.containerExpr}`)
  lines.push(`${indent}if (__ic${uid}) mapArray(() => ${inner.arrayExpr} || [], __ic${uid}, ${emit.keyFn}, (${emit.paramHead}, __innerIdx${uid}, __existing) => {`)
  // Body-entry statements: optional destructure unwrap, then optional
  // inner-`.map()` preamble locals (signal-accessor wrapped, #1052).
  // The clone IIFE below depends on both being in scope.
  for (const stmt of emit.preludeStatements) {
    lines.push(`${indent}  ${stmt}`)
  }
  if (emit.bodyIsMultiRoot) {
    // Multi-root inner loop body (Fragment with sibling roots, #1212).
    // Capture each cloned sibling alongside the primary, and stash on
    // `.__bfExtras` so the outer mapArray pairs all of them with the key.
    const innerIndent = `${indent}  `
    lines.push(`${indent}  let __innerEl${uid}, __innerExtras${uid}`)
    lines.push(`${indent}  if (__existing) {`)
    lines.push(`${innerIndent}  __innerEl${uid} = __existing`)
    lines.push(`${indent}  } else {`)
    for (const ln of emitMultiRootTemplateCloneLines(emit.wrappedTemplate, `${innerIndent}  `, `__innerEl${uid}`, `__innerExtras${uid}`)) lines.push(ln)
    lines.push(`${innerIndent}  __innerEl${uid}.__bfExtras = __innerExtras${uid}`)
    lines.push(`${indent}  }`)
  } else {
    // SVG/MathML-rooted item templates must parse inside a synthetic
    // namespace wrap (#2219, #1096): `template.innerHTML` parses in the
    // HTML namespace, so a bare `<line>`/`<circle>`/`<mrow>` root clones as
    // an HTMLUnknownElement and the SVG/MathML renderer silently draws
    // nothing. Mirrors `namespaceWrapForTemplate` handling on the top-level
    // (#135/#1088) and branch-arm paths; HTML-rooted templates keep
    // byte-identical output.
    const { wrapTag, childPath } = namespaceWrapForTemplate(emit.wrappedTemplate)
    const innerHtml = wrapTag ? `<${wrapTag}>${emit.wrappedTemplate}</${wrapTag}>` : emit.wrappedTemplate
    lines.push(`${indent}  let __innerEl${uid} = __existing ?? (() => { const __t = document.createElement('template'); __t.innerHTML = \`${innerHtml}\`; return __t.content${childPath}.cloneNode(true) })()`)
  }
  if (emit.wrappedKey) {
    lines.push(`${indent}  __innerEl${uid}.setAttribute('${keyAttrName(inner.keyDepth)}', String(${emit.wrappedKey}))`)
  }
  if (emit.components.length > 0 || emit.events.length > 0) {
    emitComponentAndEventSetup(
      lines,
      `${indent}  `,
      `__innerEl${uid}`,
      [...emit.components],
      [...emit.events],
      inner.outerLoopParam,
      inner.outerLoopParamBindings,
    )
  }
  if (inner.childLevels.length > 0) {
    stringifyInnerLoops(lines, inner.childLevels, `${indent}  `, pc)
  }
  const conditionalTexts = emit.reactiveTexts.filter(t => t.insideConditional)
  const plainTexts = emit.reactiveTexts.filter(t => !t.insideConditional)
  for (const text of conditionalTexts) {
    const bf = profileBindingId(pc, text.slotId)
    // A fresh `claimSlots` claim on every run (not the cached `lazySlots`
    // door): insert() may swap the branch's DOM between runs, and 'text'
    // writes are a plain, idempotent `nodeValue` assignment with no
    // dedup/trust-first-run state to go stale — so re-claiming here is exactly
    // as safe as, and replaces, the old re-query-$t-on-every-run discipline.
    lines.push(`${indent}  createEffect(() => { claimSlots(__innerEl${uid}, [{ id: '${text.slotId}', kind: 'text', path: [] }]).write('${text.slotId}', String(${text.wrappedExpression})) }${bf})`)
  }
  if (plainTexts.length > 0) {
    const slots: ClaimSlotSpec[] = plainTexts.map(t => ({ id: t.slotId, kind: 'text', path: [] }))
    const writer = claimWriterVarName(slots, varSlotId)
    lines.push(`${indent}  const ${writer} = lazySlots(__innerEl${uid}, ${claimPlanLiteral(slots)})`)
    for (const text of plainTexts) {
      lines.push(`${indent}  createEffect(() => { ${writer}('${text.slotId}', String(${text.wrappedExpression})) }${profileBindingId(pc, text.slotId)})`)
    }
  }
  for (const attr of emit.reactiveAttrs) {
    const targetVar = `__ta_${attr.slotId.replace(/[^a-zA-Z0-9]/g, '_')}`
    lines.push(`${indent}  { const ${targetVar} = qsa(__innerEl${uid}, '[bf="${attr.slotId}"]')`)
    lines.push(`${indent}  if (${targetVar}) createEffect(() => {`)
    for (const stmt of emitAttrUpdate(targetVar, attr.attrName, attr.wrappedExpression, attr.meta)) {
      lines.push(`${indent}    ${stmt}`)
    }
    lines.push(`${indent}  }${profileBindingId(pc, attr.slotId)}) }`)
  }
  // Imperative ref callbacks fire on every renderItem invocation, which
  // means every mount: SSR hydration, initial CSR creation, and same-key
  // remount after unmount (#1244).
  emitLoopChildRefs(lines, emit.childRefs, {
    indent: `${indent}  `,
    elVar: `__innerEl${uid}`,
    bodyIsMultiRoot: emit.bodyIsMultiRoot,
  })
  lines.push(`${indent}  return __innerEl${uid}`)
  lines.push(`${indent}}, '${inner.markerId}'${profileBindingId(pc, inner.slotId)}) }`)
}

function emitStatic(lines: string[], inner: InnerLoopPlan, indent: string, pc: string | undefined): void {
  const uid = inner.uidSuffix
  const emit = inner.emit
  if (emit.mode !== 'static') return

  lines.push(`${indent}// Initialize ${inner.arraySrc} loop components and events`)
  lines.push(`${indent}{ const __ic${uid} = ${inner.containerExpr}`)
  // Guard: inner array may be undefined when inside a conditional branch.
  lines.push(`${indent}if (__ic${uid} && ${inner.arrayExpr}) ${inner.arrayExpr}.forEach((${inner.param}, __innerIdx${uid}) => {`)
  lines.push(`${indent}  const __innerEl${uid} = __ic${uid}.children[__innerIdx${uid}]`)
  lines.push(`${indent}  if (!__innerEl${uid}) return`)
  // Body-entry statements: inner-`.map()` preamble locals (raw, since the
  // forEach param is the literal item — #1064). Emitted before component
  // and event setup so their prop getters / handlers resolve the locals.
  for (const stmt of emit.preludeStatements) {
    lines.push(`${indent}  ${stmt}`)
  }
  if (emit.rawKey) {
    lines.push(`${indent}  __innerEl${uid}.setAttribute('${keyAttrName(inner.keyDepth)}', String(${emit.rawKey}))`)
  }
  emitComponentAndEventSetup(
    lines,
    `${indent}  `,
    `__innerEl${uid}`,
    [...emit.components],
    [...emit.events],
    inner.outerLoopParam,
    inner.outerLoopParamBindings,
  )
  if (inner.childLevels.length > 0) {
    stringifyInnerLoops(lines, inner.childLevels, `${indent}  `, pc)
  }
  // Imperative ref callbacks for static inner loops — fire once per
  // forEach iteration (#1244). Static arrays don't reactively re-iterate,
  // so this is effectively a one-shot per item.
  emitLoopChildRefs(lines, emit.childRefs, {
    indent: `${indent}  `,
    elVar: `__innerEl${uid}`,
    bodyIsMultiRoot: false,
  })
  lines.push(`${indent}}) }`)
}
