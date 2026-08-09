/**
 * Every name a `.map()`/`.filter()` loop callback binds as its item or
 * index parameter, anywhere in a component's IR tree (#2212 review
 * finding). `isStringTypedOperand`'s identifier arm resolves a bare
 * identifier against `collectStringValueNames`'s flat, scope-BLIND
 * `Set<string>` — so a loop callback whose param happens to reuse a
 * string prop's name (`items.map((name) => ... 1 + name ...)`, where the
 * component also has a string `name` prop) would otherwise be
 * misdetected as string-typed, silently lowering a NUMERIC `+` to the
 * adapter's string-concat operator instead of leaving it numeric — wrong
 * rendered output, not a refusal. Subtracting every loop-bound name from
 * the string-name set (in each adapter's `collectStringValueNames`) is a
 * coarse but SAFE mitigation: a name used as a loop param anywhere in the
 * component never gets string-concat treatment anywhere in the
 * component, even at a non-shadowed use site outside that loop — which
 * degrades to the ALREADY-accepted residual (`+` falls back to numeric,
 * same as before #2212 for an unresolvable operand) rather than ever
 * producing silently-wrong output.
 *
 * #2482 (BindingScope) does NOT replace this: it answers "is NAME bound
 * AT THIS POSITION", a live, position-accurate query built by walking
 * INTO scopes during a render-time (or render-shaped) tree walk. This
 * function answers a deliberately different, coarser question —
 * "is NAME EVER a loop-bound name ANYWHERE in the component" — a single
 * whole-component prepass run once at `generate()` entry, before any
 * loop scope exists to thread. The two are complementary, not
 * duplicative: swapping this for `BindingScope` would require re-deriving
 * a position-accurate answer at every string-typed-operand call site,
 * which is exactly the coarse-but-safe trade-off this function exists to
 * avoid. Stays outside the `binding-scope-ratchet.test.ts` ledger for an
 * incidental reason too — a lowercase-`l`-led spelling of this file's own
 * export once lived as a per-adapter ref-counted-map field name (fully
 * migrated away in an earlier #2482 stage) that the ledger's scan tracked;
 * this function's own `collectLoopBoundNames` name is capitalized
 * differently (a capital `L`) and so was never inside that scan's reach in
 * the first place.
 */

import type { ComponentIR, IRNode } from '../types.ts'

export function collectLoopBoundNames(ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const visit = (node: IRNode | null | undefined): void => {
    if (!node) return
    switch (node.type) {
      case 'element':
      case 'component':
      case 'fragment':
      case 'provider':
        for (const child of node.children) visit(child)
        break
      case 'async':
        visit(node.fallback)
        for (const child of node.children) visit(child)
        break
      case 'loop':
        names.add(node.param)
        if (node.index) names.add(node.index)
        // A destructured callback param (`.map(({ name }) => ...)`) binds
        // its extracted names via `paramBindings`, not `param` itself
        // (`param` holds the raw pattern text there) — adapters that lower
        // the destructure to a `{% set name = __bf_item.name %}`-style
        // local (#2087) leave `name` reachable as a bare identifier in the
        // body, so it needs the same exclusion as a plain loop param.
        for (const binding of node.paramBindings ?? []) names.add(binding.name)
        // A `.filter(pred).map(cb)` chain's filter predicate is emitted
        // through the same binary/string-name machinery, using its OWN
        // param (which may differ from the map callback's `param`) before
        // any rename to the loop param happens.
        if (node.filterPredicate) names.add(node.filterPredicate.param)
        // A `.map()` callback preamble's declarations lower to per-row locals
        // in the loop body on every DSL adapter (#2447), so a preamble name is
        // bound in body scope exactly like a param — and must get the same
        // exclusion, or a same-named module const would inline over the local
        // the loop just declared.
        for (const name of node.preamble?.declaredNames ?? []) names.add(name)
        for (const child of node.children) visit(child)
        if (node.childComponent) {
          for (const child of node.childComponent.children) visit(child)
        }
        for (const nested of node.nestedComponents ?? []) {
          for (const child of nested.children) visit(child)
        }
        for (const seg of node.flatMapCallback?.segments ?? []) {
          if (seg.kind === 'jsx') visit(seg.ir)
        }
        // Preamble leaves (array-builder bodies) are nested IR the same way.
        for (const seg of node.preamble?.segments ?? []) {
          if (seg.kind === 'jsx') visit(seg.ir)
        }
        break
      case 'conditional':
        visit(node.whenTrue)
        visit(node.whenFalse)
        break
      case 'if-statement':
        visit(node.consequent)
        if (node.alternate) visit(node.alternate)
        break
      case 'text':
      case 'expression':
      case 'slot':
        break
    }
  }
  visit(ir.root)
  return names
}
