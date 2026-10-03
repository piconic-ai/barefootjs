import type { BindingScope } from './binding-scope.ts'

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

/** The template variable a shadowed root prop `name` is aliased to. */
export function rootPropAliasName(name: string): string {
  return `__bf_root_${name}`
}

/**
 * Props the loop row newly shadows: names `row` binds that `outer` did not
 * (an enclosing loop that already bound a name already aliased it, and a
 * re-assignment here would capture that loop's row value) and that are
 * component props. In source order of `row`'s bindings.
 */
export function rootPropAliasesForLoop(
  outer: BindingScope,
  row: BindingScope,
  propNames: ReadonlySet<string>,
): string[] {
  return [...row.boundNames()].filter(name => !outer.isBound(name) && propNames.has(name))
}

/**
 * The template variable an explicit `props.<name>` read resolves to at a
 * position with `scope`: the alias while a loop binding shadows `name`,
 * else `name` itself.
 */
export function rootPropReadName(name: string, scope: BindingScope): string {
  return scope.isBound(name) ? rootPropAliasName(name) : name
}
