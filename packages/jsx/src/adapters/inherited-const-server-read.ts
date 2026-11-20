/**
 * BF101 for an inherited literal-const read (`R.toString`, see
 * `spellStaticConstMember`) in a value the server render computes (#3813).
 *
 * An emitter refuses the read where it spells it, but not every read the
 * server render performs is spelled by an emitter whose refusal survives. A
 * signal's seed, a memo's body, a const's initializer and the expression a
 * called function returns are computed apart from the position that reads
 * them: by the SSR seed plan (whose lowering failures fall back silently, on
 * purpose, to the static SSR defaults), by the static evaluator, or on the
 * backend. A position's own value can be dropped the same way (a child prop
 * the Go constructor cannot compute is left out). The value then renders as
 * if the key were missing.
 *
 * This pass refuses the read in each server-rendered position
 * (`walkTemplatePositions`, read in the position's own scope) and in each
 * declaration the server render reads (`walkServerReads`, the one walk of
 * that relation). Both skip `/* @client *\/` positions and resolve each name
 * lexically, so a loop row or a callback param named like a declaration is
 * not that declaration. Within an expression only the reads its evaluation
 * performs are refused: a function is entered where it is called or handed
 * to a call (a callback, an IIFE, a local function or a method of a literal
 * const called by name), not where it is stored
 * (`{ get: () => R.toString }` read for another key, an event handler). A
 * const that only names another (`const A = R`) is read as that one.
 *
 * A block-bodied memo no single expression stands for has no server value
 * computed from its statements: it renders its static default. The browser
 * still evaluates them for the same slot, so an inherited read in one of
 * them (as far as the parse represents the block) is refused all the same;
 * the block's own `const` / `let` names shadow the component's there.
 */

import { isEventHandlerName } from '../event-handler-name.ts'
import { evaluatedWalkContext, throughAliases, walkEvaluated, type EvaluatedAt, type EvaluatedUse, type EvaluatedWalkContext } from '../evaluated-expr-walk.ts'
import type { ParsedExpr, ParsedStatement } from '../expression-parser.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkServerReads } from '../server-read-walk.ts'
import { refuseComputedConstRead, spellStaticConstMember, staticIndexKey, type InheritedReadPlace, type StaticConstMemberSink } from '../static-const-member.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR } from '../types.ts'


/** Record BF101 for each inherited literal-const read the server render of `ir` performs. */
export function refuseInheritedConstServerReads(ir: ComponentIR, sink: StaticConstMemberSink): void {
  const constants = ir.metadata.localConstants ?? []
  if (constants.length === 0) return
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  const shared: Omit<Check, 'place'> = { ...evaluatedWalkContext(ir.metadata, { component, module: BindingScope.EMPTY }), sink }
  // This pass runs before any emitter, so its record of a read is the one that stands.
  walkTemplatePositions(ir.root, ({ expr, scope, attrName, loc, role }) => {
    if (attrName !== undefined && isEventHandlerName(attrName)) return
    // A component renders on the server whatever directive its prop carries.
    const place = { loc, deferrable: role !== 'prop' }
    refuseReads(expr, { scope: scope ?? component, from: 'component' }, { ...shared, place }, 'value')
  }, component)
  walkServerReads(ir, (read) => {
    const check = { ...shared, place: { loc: read.loc } }
    const outer = shared.scopes[read.scope]
    if (read.expr) refuseReads(read.expr, { scope: outer, from: read.scope }, check, 'value')
    else if (read.block) {
      const parts = blockParts(read.block)
      const at = { scope: outer.enterCallback(parts.locals), from: read.scope }
      for (const expr of parts.exprs) refuseReads(expr, at, check, 'value')
    }
  })
}

/** The expressions parsed statements evaluate and the names they declare, nested `if` blocks included. */
function blockParts(statements: readonly ParsedStatement[], into: { exprs: ParsedExpr[]; locals: string[] } = { exprs: [], locals: [] }) {
  for (const s of statements) {
    if (s.kind === 'var-decl') {
      into.locals.push(s.name)
      into.exprs.push(s.init)
    } else if (s.kind === 'return') into.exprs.push(s.value)
    else {
      into.exprs.push(s.condition)
      blockParts(s.consequent, into)
      if (s.alternate) blockParts(s.alternate, into)
    }
  }
  return into
}

interface Check extends EvaluatedWalkContext {
  sink: StaticConstMemberSink
  place: InheritedReadPlace
}

function refuseReads(expr: ParsedExpr, at: EvaluatedAt, check: Check, use: EvaluatedUse): void {
  walkEvaluated(expr, at, check, (e, eAt, eUse) => {
    if (eUse === 'callee' || (e.kind !== 'member' && e.kind !== 'index-access')) return
    const key = e.kind === 'member' ? e.property : staticIndexKey(e.index)
    const isShadowed = (name: string): boolean => eAt.scope.isBound(name)
    const object = throughAliases(e.object, check.constants[eAt.from], isShadowed)
    if (key !== null) spellStaticConstMember(object, key, check.constants[eAt.from], isShadowed, check.sink, check.place)
    else if (e.kind === 'index-access') refuseComputedConstRead(object, check.constants[eAt.from], isShadowed, check.sink, check.place)
  }, use)
}
