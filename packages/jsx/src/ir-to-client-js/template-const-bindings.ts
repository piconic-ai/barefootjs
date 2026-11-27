/**
 * Per-template bindings for inlined consts (#4021).
 *
 * The CSR template lambda runs at module scope, so it cannot read a
 * component's (or a relocated module's) const by name: each read is
 * substituted with the const's resolved value. For a value that is a
 * primitive this is invisible. For an initializer that creates a new value
 * each time it runs (`{ k: 'v' }`, `mk()`, `new Date(0)`, `Math.random()`)
 * it is not: two reads in one template evaluation see two objects, or two
 * samples, where the server evaluates the declaration once.
 *
 * Such a const (`ConstantInfo.freshPerEvaluation`, decided in Phase 1) is
 * instead bound once per template evaluation: the template body is wrapped
 * in `((__bf_const_B) => \`…\`)(<value>)`, every read of `B` inside it is
 * substituted with `__bf_const_B`, and `<value>` is exactly what a read of
 * `B` at the top of the template substitutes to, so the value is the one
 * main spliced at a top-level read. Only consts the template actually reads
 * are bound; a read the template leaves to init (an unsafe expression)
 * never counts as one.
 */

import type { ConstantInfo } from '../types.ts'
import type { CsrEnv, CsrSubstitution } from './csr-substitute.ts'
import { interp, templateLiteralMarkup, withOuterBindings } from './safe-html.ts'

/**
 * The consts a template binds once instead of splicing at each read. A name
 * qualifies only when every const declared with it (a module const and a
 * component const may share one) is a plain, unwritten declaration whose
 * initializer evaluates to a fresh value.
 */
export function templateBoundConstNames(localConstants: readonly ConstantInfo[]): Set<string> {
  const fresh = new Set<string>()
  const excluded = new Set<string>()
  for (const c of localConstants) {
    const bindable = c.freshPerEvaluation && !c.mutatedAfterDeclaration && !c.isJsx && !c.isJsxFunction && !c.systemConstructKind
    if (bindable) fresh.add(c.name)
    else excluded.add(c.name)
  }
  for (const name of excluded) fresh.delete(name)
  return fresh
}

/** The bindings one template evaluation declares, and which of them it reads. */
export interface TemplateConstBindings {
  /** Parameter name → the value it is bound to, in binding order. */
  readonly values: ReadonlyMap<string, string>
  /** The parameters a substituted (and emitted) expression reads. */
  readonly read: Set<string>
}

/**
 * Re-point each bindable const of `env` at a parameter. `valueOf` gives the
 * value a top-level read of the const substitutes to, or null when the
 * template cannot evaluate it (the const keeps its spliced substitution).
 */
export function bindTemplateConsts(
  env: CsrEnv,
  names: ReadonlySet<string>,
  valueOf: (name: string) => string | null,
): { env: CsrEnv; bindings: TemplateConstBindings } {
  const values = new Map<string, string>()
  const substitutions = new Map<string, CsrSubstitution>(env.substitutions)
  for (const name of names) {
    const sub = env.substitutions.get(name)
    if (!sub || sub.kind !== 'identifier') continue
    const value = valueOf(name)
    if (value === null) continue
    const param = `__bf_const_${name}`
    values.set(param, value)
    substitutions.set(name, { kind: 'identifier', replacement: param, freeIdentifiers: new Set([param]) })
  }
  return { env: { ...env, substitutions }, bindings: { values, read: new Set() } }
}

/** Record the bound parameters an emitted expression reads. */
export function noteBindingReads(freeIdentifiers: ReadonlySet<string>, bindings: TemplateConstBindings | undefined): void {
  if (!bindings) return
  for (const name of freeIdentifiers) {
    if (bindings.values.has(name)) bindings.read.add(name)
  }
}

/**
 * Wrap a template body in the bindings it reads. Returned unchanged when it
 * reads none, so a template without such a const is byte-identical.
 */
export function wrapTemplateConstBindings(templateHtml: string, bindings: TemplateConstBindings): string {
  const params = [...bindings.values.keys()].filter(param => bindings.read.has(param))
  if (params.length === 0) return templateHtml
  const values = params.map(param => bindings.values.get(param)!)
  return interp(withOuterBindings(params, values, templateLiteralMarkup(templateHtml)))
}
