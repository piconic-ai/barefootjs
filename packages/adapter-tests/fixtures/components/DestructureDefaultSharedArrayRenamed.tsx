'use client'

// Root for the `destructure-default-shared-array-renamed` fixture: the same over a renamed binding (`{ a: x = [], b = x }`).
export function DestructureDefaultSharedArrayRenamed(props: { a?: string[]; b?: string[] }) {
  let { a: x = [], b = x } = props
  const n = x.push('x') && b.length
  return <p data-slot="count">{n}</p>
}
