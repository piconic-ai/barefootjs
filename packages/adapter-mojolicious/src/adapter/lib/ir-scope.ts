/**
 * IR traversal helpers for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over the IR tree — no adapter instance state.
 *
 * SHARED CANDIDATE: the bodies here are byte-identical to the Xslate
 * adapter's `lib/ir-scope.ts`. They are adapter-agnostic (no Perl/Kolon
 * specifics), so they are the obvious first extraction into a shared
 * Perl-family codegen module once one exists — the groundwork for the
 * future Perl evaluator integration (issue #2018 track D). Kept per-adapter
 * for now, matching the repo convention (the Go adapter keeps its own copy).
 */

import type { IRNode, IRProp, IRIfStatement, IRFragment } from '@barefootjs/jsx'

/**
 * Find the `children` prop's `jsx-children` payload (#1326). Narrowed
 * via the AttrValue `kind` discriminator so adapter code stays type-
 * safe if the IR shape evolves — adding a new AttrValue variant or
 * renaming `children` to `jsxChildren` becomes a TS compile error
 * here instead of silently dropping the children at runtime.
 */
export function resolveJsxChildrenProp(props: readonly IRProp[]): IRNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children
}

/**
 * Collect the component's root scope element node(s) — the elements that
 * become the rendered root and so carry `data-key` for a keyed loop item. A
 * plain element root is itself; an `if-statement` (early-return) root
 * contributes the top element of each branch (`consequent` + the `alternate`
 * chain), since exactly one branch renders at runtime. Non-element branch
 * tops (fragments / nested shapes) are walked one level so an
 * `if (…) return <A/>` still resolves to `<A>`. (#1297)
 */
export function collectRootScopeNodes(node: IRNode): Set<IRNode> {
  const out = new Set<IRNode>()
  const visit = (n: IRNode | null): void => {
    if (!n) return
    if (n.type === 'element') { out.add(n); return }
    if (n.type === 'if-statement') {
      const s = n as IRIfStatement
      visit(s.consequent)
      visit(s.alternate)
      return
    }
    if (n.type === 'fragment') {
      for (const c of (n as IRFragment).children) visit(c)
    }
  }
  visit(node)
  return out
}

/**
 * True when every `$var` the lowered (Perl / Kolon) expression references is
 * in the available set — i.e. the template already has that var in scope.
 * Guards in-template memo seeding from referencing an out-of-scope binding
 * (which would trip Perl strict mode). (#1297)
 */
export function referencedVarsAreAvailable(expr: string, available: ReadonlySet<string>): boolean {
  for (const m of expr.matchAll(/\$([A-Za-z_]\w*)/g)) {
    if (!available.has(m[1])) return false
  }
  return true
}
