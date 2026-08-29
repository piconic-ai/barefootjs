/**
 * IR traversal helpers for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over the IR tree — no adapter instance state.
 *
 * SHARED CANDIDATE: `resolveJsxChildrenProp` is byte-identical to the Mojo
 * adapter's `lib/ir-scope.ts`. It is adapter-agnostic (no Perl/Kolon
 * specifics), so it is the obvious first extraction into a shared
 * Perl-family codegen module once one exists — the groundwork for the
 * future Perl evaluator integration (issue #2018 track D). Kept per-adapter
 * for now, matching the repo convention (the Go adapter keeps its own copy).
 *
 * This file used to also carry `collectRootScopeNodes` — the "which
 * elements are this component's own render root(s)" walk, byte-identical
 * across every one of these per-adapter copies. It moved into
 * `jsx-to-ir.ts`'s `resolveRootKeyAttr` (#2753): the decision it fed (a
 * `data-key` relay attribute) is resolved once, onto `IRElement.keyAttr`,
 * instead of re-derived at emit time by every adapter.
 */

import type { IRNode, IRProp } from '@barefootjs/jsx'

/**
 * Find the `children` prop's `jsx-children` payload. Narrowed via the
 * AttrValue `kind` discriminator so adapter code stays type-safe if the IR
 * shape evolves.
 */
export function resolveJsxChildrenProp(props: readonly IRProp[]): IRNode[] {
  const prop = props.find(p => p.name === 'children')
  if (!prop) return []
  if (prop.value.kind !== 'jsx-children') return []
  return prop.value.children
}
