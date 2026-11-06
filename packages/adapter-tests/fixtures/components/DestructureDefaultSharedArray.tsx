'use client'

// Root for the `destructure-default-shared-array` fixture: a `let` body destructure whose second default is the first binding (`{ a = [], b = a }`): `b` is the same array as `a`, so a push onto `a` shows in `b.length`.
export function DestructureDefaultSharedArray(props: { a?: string[]; b?: string[] }) {
  let { a = [], b = a } = props
  const n = a.push('x') && b.length
  return <p data-slot="count">{n}</p>
}
