'use client'

// Root for the `destructure-default-earlier-assignment` fixture: a default that assigns an earlier binding (`{ a = 1, b = (a = 2), c = a }`): the assignment runs although `b` is never read, so `c` is `2`.
export function DestructureDefaultEarlierAssignment(props: { a?: number; b?: number; c?: number }) {
  let { a = 1, b = (a = 2), c = a } = props
  return <p data-slot="value">{c}</p>
}
