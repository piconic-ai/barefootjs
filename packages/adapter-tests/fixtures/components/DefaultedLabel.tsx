'use client'

// Child for the `destructure-default-null-hydrate` fixture: a destructure
// default (`label = 'D'`) read as text and as a directly bound nullable
// attribute. JS applies the default to an absent or `undefined` prop only,
// so a `null` label renders empty text and no `title`.
export function DefaultedLabel({ label = 'D' }: { label?: string | null }) {
  return <p data-slot="label" title={label}>{label}</p>
}
