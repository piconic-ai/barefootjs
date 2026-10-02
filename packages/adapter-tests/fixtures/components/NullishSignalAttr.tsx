'use client'

// An attribute bound to a signal whose value is `undefined` is omitted, the
// way Hono omits any `undefined`-valued attribute. Both spellings of an
// `undefined` initial value are covered: the zero-arg `createSignal<T>()`
// (typed `T | undefined`, #3215) and an explicit
// `createSignal<T | undefined>(undefined)`. A backend that seeds the type's
// zero value instead renders `data-n="0"` / `title=""`.
import { createSignal } from '@barefootjs/client'

export function NullishSignalAttr() {
  const [n, setN] = createSignal<number>()
  const [s, setS] = createSignal<string | undefined>(undefined)
  return (
    <button
      title={s()}
      data-n={n()}
      onClick={() => {
        setN(1)
        setS('x')
      }}
    >
      {n() ?? 'none'}
    </button>
  )
}
