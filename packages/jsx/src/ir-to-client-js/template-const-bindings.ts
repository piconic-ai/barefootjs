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
 * never counts as one. The parameter's spelling avoids every `__bf_` name of
 * the source file (`IRMetadata.generatedNameSpellings`), so no source
 * binding can capture it. A const whose initializer reads another fresh
 * const is left to the splice (`freshValueCarriers`).
 */

import type { ConstantInfo, MemoInfo, SignalInfo } from '../types.ts'
import type { CsrEnv, CsrSubstitution } from './csr-substitute.ts'
import { interp, templateLiteralMarkup, withOuterBindings } from './safe-html.ts'

/** The parts of a component's context the binding decision reads. */
export interface TemplateBindingSources {
  readonly localConstants: readonly ConstantInfo[]
  readonly signals: readonly SignalInfo[]
  readonly memos: readonly MemoInfo[]
  readonly generatedNameSpellings?: ReadonlySet<string>
}

/**
 * The consts a template binds once instead of splicing at each read. A name
 * qualifies only when every const declared with it (a module const and a
 * component const may share one) is a plain, unwritten declaration whose
 * initializer evaluates to a fresh value, and reads nothing that carries
 * another fresh value (`readsFreshValue`).
 */
function templateBoundConstNames(sources: TemplateBindingSources): Set<string> {
  const fresh = new Set<string>()
  const excluded = new Set<string>()
  const carriers = freshValueCarriers(sources)
  for (const c of sources.localConstants) {
    const bindable = c.freshPerEvaluation && !c.mutatedAfterDeclaration && !c.isJsx && !c.isJsxFunction && !c.systemConstructKind
      && !readsAny(c.freeIdentifiers, carriers)
    if (bindable) fresh.add(c.name)
    else excluded.add(c.name)
  }
  for (const name of excluded) fresh.delete(name)
  return fresh
}

/**
 * The names whose substituted value carries a fresh value of its own: a
 * fresh const that is not a function literal, and, to a fixpoint, any const,
 * signal or memo whose initializer reads one (a function literal included,
 * since its call evaluates what it reads).
 *
 * A const that reads such a name is not bound (#4021). The substituted value
 * of `const B = { a: A }` is chain-closed (`{ a: Math.random() }`), so binding
 * `B` would still sample `A` separately from `A`'s own binding: `A === B.a`
 * would stay false while looking bound. Leaving `B` spliced keeps main's
 * behaviour for that shape (the `module-const-alias-identity` limitation).
 * A fresh function literal itself carries nothing: calling a second copy of
 * `() => ({ k: V })` gives what the first gives.
 */
function freshValueCarriers(sources: TemplateBindingSources): Set<string> {
  const carriers = new Set<string>()
  const reads: Array<[string, ReadonlySet<string> | undefined]> = []
  for (const c of sources.localConstants) {
    if (c.freshPerEvaluation && !c.isFunctionValue) carriers.add(c.name)
    reads.push([c.name, c.freeIdentifiers])
  }
  for (const s of sources.signals) reads.push([s.getter, s.initialFreeIdentifiers])
  for (const m of sources.memos) reads.push([m.name, m.computationFreeIdentifiers])
  let grew = true
  while (grew) {
    grew = false
    for (const [name, freeIdentifiers] of reads) {
      if (carriers.has(name) || !readsAny(freeIdentifiers, carriers)) continue
      carriers.add(name)
      grew = true
    }
  }
  return carriers
}

function readsAny(names: ReadonlySet<string> | undefined, of: ReadonlySet<string>): boolean {
  if (!names) return false
  for (const name of names) {
    if (of.has(name)) return true
  }
  return false
}

/** Which consts a template binds, and the spellings their parameters avoid. */
export interface TemplateBindingPlan {
  readonly names: ReadonlySet<string>
  readonly reserved: ReadonlySet<string>
}

export function templateBindingPlan(sources: TemplateBindingSources): TemplateBindingPlan {
  return { names: templateBoundConstNames(sources), reserved: sources.generatedNameSpellings ?? new Set() }
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
  plan: TemplateBindingPlan,
  valueOf: (name: string) => string | null,
): { env: CsrEnv; bindings: TemplateConstBindings } {
  const { names, reserved } = plan
  const values = new Map<string, string>()
  const substitutions = new Map<string, CsrSubstitution>(env.substitutions)
  for (const name of names) {
    const sub = env.substitutions.get(name)
    if (!sub || sub.kind !== 'identifier') continue
    const value = valueOf(name)
    if (value === null) continue
    const param = freshParamName(name, reserved, values)
    values.set(param, value)
    substitutions.set(name, { kind: 'identifier', replacement: param, freeIdentifiers: new Set([param]) })
  }
  return { env: { ...env, substitutions }, bindings: { values, read: new Set() } }
}

/**
 * `__bf_const_<name>`, suffixed until it is no spelling of the source file
 * (`reserved`, which covers every source binding and reference that could
 * capture or shadow it) and no parameter already chosen. Every other name the
 * compiler generates into a template has a different prefix.
 */
function freshParamName(name: string, reserved: ReadonlySet<string>, chosen: ReadonlyMap<string, string>): string {
  const base = `__bf_const_${name}`
  let param = base
  for (let n = 1; reserved.has(param) || chosen.has(param); n++) param = `${base}_${n}`
  return param
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
