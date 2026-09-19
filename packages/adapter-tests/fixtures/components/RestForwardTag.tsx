'use client'

// Child for the `child-prop-rest-forward` fixture (#3055 coverage).
//
// `variant` is destructured and consumed ONLY to compute `cls` — it is
// never re-included in `...rest`, so it must NEVER reach the root as a
// `variant` attribute (the exact shape `child-prop-mirror-attr-ssr`
// tracked: `branch-root-prop-attr`'s `VariantTag` is this component's
// twin). `tag` is NOT destructured, so it falls into `...rest` and DOES
// reach the root via the spread — the shape the mirror mechanism was
// legitimately built for (#3055's "still updates reactively"
// requirement), pinned here so the #3055 fix cannot regress it.
export function RestForwardTag({ variant = 'a', ...rest }: { variant?: 'a' | 'b'; tag?: string }) {
  const variantClasses: Record<'a' | 'b', string> = { a: 'cls-a', b: 'cls-b' }
  const cls = variantClasses[variant]
  return <span data-slot="rest-tag" className={cls} {...rest}>content</span>
}
