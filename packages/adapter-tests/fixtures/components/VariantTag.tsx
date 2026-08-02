'use client'

// Child for the `branch-root-prop-attr` fixture (#2477 coverage).
//
// Mirrors `ui/components/ui/badge`'s shape: a component-level
// `if (asChild) { return <A/> } return <B/>` early return whose branch
// root elements carry a class computed as `variantClasses[variant]` — a
// local `Record` const indexed by a destructured prop with a default.
// The one-hop const (`const cls = variantClasses[variant]`) is the shape
// #2477 fixed: it must lower to the shared `lookup` template part, not a
// bare reference to a name the template never defines. The literal-union
// prop type additionally pins the Go adapter's union collapse.
export function VariantTag({ variant = 'a', asChild = false }: { variant?: 'a' | 'b'; asChild?: boolean }) {
  const variantClasses: Record<'a' | 'b', string> = { a: 'cls-a', b: 'cls-b' }
  const cls = variantClasses[variant]
  if (asChild) {
    return <em data-slot="alt" className={cls}>alt</em>
  }
  return <span data-slot="tag" className={cls}>tag</span>
}
