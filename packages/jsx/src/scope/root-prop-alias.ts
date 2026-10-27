import { collectLoopBoundNames } from '../adapters/loop-bound-names.ts'
import type { ParsedExpr } from '../expression-parser.ts'
import type { ComponentIR } from '../types.ts'
import { PROPS_OBJECT_IDENTIFIER, type BindingScope } from './binding-scope.ts'

/**
 * Root-prop aliases for template engines that flatten `props.X` to the bare
 * template variable `X` (#3314). A loop that binds the same name (`.map(value
 * => …)`) shadows that variable for its whole body, so an explicit
 * `props.value` inside the row read the ROW's `value` instead of the prop.
 *
 * The adapter assigns each shadowed prop to an alias just before the loop
 * header — where the bare name still means the prop — and an explicit
 * `props.X` read inside the row uses the alias. Only the template syntax
 * of the assignment is per-adapter; which names need one, and their alias
 * name, are decided here once.
 */

/**
 * The template variable each prop in `propNames` is aliased to: `__bf_root_<name>`,
 * extended with `_` until it names nothing else the component turns into a
 * template variable — a prop, a local const or function, a signal or memo,
 * any loop binding, or another prop's alias. The `__bf_` namespace is
 * reserved only by convention, so an alias must not overwrite a user prop
 * spelled `__bf_root_value` nor be shadowed by a binding of that name.
 * Computed once per component so the assignment before a loop and every
 * `props.X` read inside it agree on the name.
 */
export function rootPropAliasNames(ir: ComponentIR, propNames: Iterable<string>): ReadonlyMap<string, string> {
  const { metadata } = ir
  const props = [...propNames]
  const taken = new Set<string>([
    ...props,
    ...metadata.localConstants.map(c => c.name),
    ...metadata.localFunctions.map(f => f.name),
    ...metadata.signals.flatMap(s => (s.setter ? [s.getter, s.setter] : [s.getter])),
    ...metadata.memos.map(m => m.name),
    ...collectLoopBoundNames(ir),
  ])
  const aliases = new Map<string, string>()
  for (const name of props) {
    let alias = `__bf_root_${name}`
    while (taken.has(alias)) alias += '_'
    taken.add(alias)
    aliases.set(name, alias)
  }
  return aliases
}

/**
 * Props the loop row newly shadows, with their aliases: names `row` binds
 * that `outer` did not (an enclosing loop that already bound a name already
 * aliased it, and a re-assignment here would capture that loop's row value)
 * and that are component props (keys of `aliases`). In source order of
 * `row`'s bindings.
 */
export function rootPropAliasesForLoop(
  outer: BindingScope,
  row: BindingScope,
  aliases: ReadonlyMap<string, string>,
): { name: string; alias: string }[] {
  const shadowed: { name: string; alias: string }[] = []
  for (const name of row.boundNames()) {
    const alias = aliases.get(name)
    if (alias !== undefined && !outer.isBound(name)) shadowed.push({ name, alias })
  }
  return shadowed
}

/**
 * The template variable an explicit `props.<name>` read resolves to at a
 * position with `scope`: the alias (from `rootPropAliasNames`) while a loop
 * binding shadows `name`, else `name` itself.
 */
export function rootPropReadName(
  name: string,
  scope: BindingScope,
  aliases: ReadonlyMap<string, string>,
): string {
  if (!scope.isBound(name)) return name
  return aliases.get(name) ?? name
}

/**
 * Whether `expr` reads the component's props object at a position where
 * `isBound` answers which names a binding shadows: the bare identifier
 * `props` that no binding shadows (#3693). A `.map((props) => …)` row, a
 * destructured `({ props })` field, a preamble local or a callback param
 * named `props` is that binding instead, so `props.X` reads its member
 * rather than flattening to the component's prop `X`. Template emitters
 * flatten a `props.X` read only when this holds; `isBound` is the
 * adapter's current `BindingScope` (`scope.isBound`), or, in a filter
 * predicate, the predicate's own params plus the enclosing scope.
 */
export function isRootPropsObject(expr: ParsedExpr, isBound: (name: string) => boolean): boolean {
  return expr.kind === 'identifier' && expr.name === PROPS_OBJECT_IDENTIFIER && !isBound(expr.name)
}
