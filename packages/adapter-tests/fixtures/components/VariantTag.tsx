'use client'

// Child for the `branch-root-prop-attr` fixture (#2472 regression pin).
//
// Mirrors `ui/components/ui/badge`'s exact shape: a component-level
// `if (asChild) { return <A/> } return <B/>` early return whose INACTIVE
// branch's own root element (no synthetic wrapper — this lowers through
// `insertRoot()`'s root-swap path, `ConditionalElement.rootSwap`) carries a
// class attribute computed from a destructured prop with a default
// (`variantClasses[variant]`). PR #2472 routed this through a different
// expression transformer than the top-level (non-branch) reactive-attribute
// path, so the branch effect read the once-captured destructured local
// (`variant`, snapshotted at the top of `init`) instead of re-reading the
// live props object (`_p.variant`) on every effect run — freezing the class
// after the first render even though the prop kept changing.
export function VariantTag({ variant = 'a', asChild = false }: { variant?: 'a' | 'b'; asChild?: boolean }) {
  const variantClasses: Record<'a' | 'b', string> = { a: 'cls-a', b: 'cls-b' }
  const cls = variantClasses[variant]
  if (asChild) {
    return <em data-slot="alt" className={cls}>alt</em>
  }
  return <span data-slot="tag" className={cls}>tag</span>
}
