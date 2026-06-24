/**
 * IR traversal helpers for the Go html/template adapter.
 *
 * Extracted from `go-template-adapter.ts` (Phase 2 refactor). Pure functions
 * over the IR tree — no adapter instance state.
 */

import type { IRNode, IRIfStatement, IRFragment } from '@barefootjs/jsx'

/**
 * Collect the component's root scope element node(s) — the elements that become
 * the rendered root and so carry `data-key` for a keyed loop item. A plain
 * element root is itself; an `if-statement` (early-return) root contributes the
 * top element of each branch, since exactly one renders at runtime. (#1297)
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
