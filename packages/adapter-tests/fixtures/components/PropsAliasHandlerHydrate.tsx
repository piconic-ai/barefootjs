'use client'

// Root for the `props-alias-handler-hydrate` fixture. The only read of the
// prop `n` is `p.n`, where `p` aliases the props object (`const p = props`),
// and `q.n`, where `q` aliases `p`. The client graph must still count `n` as a
// use of the prop through the alias chain so the caller-supplied value is
// serialized and the handler adds it on click.
import { createSignal } from '@barefootjs/client'

export function PropsAliasHandlerHydrate(props: { n: number }) {
  const p = props
  const q = p
  const [count, setCount] = createSignal(0)
  return (
    <button onClick={() => setCount(count() + q.n)}>{count()}</button>
  )
}
