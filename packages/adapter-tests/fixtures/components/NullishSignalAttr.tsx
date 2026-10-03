'use client'

// An attribute bound to a signal whose value is `undefined` is omitted, the
// way Hono omits any `undefined`-valued attribute. Both spellings of an
// `undefined` initial value are covered: the zero-arg `createSignal<T>()`
// (typed `T | undefined`, #3215) and an explicit
// `createSignal<T | undefined>(undefined)`. A backend that seeds the type's
// zero value instead renders `data-n="0"` / `title=""`. `aria-label` reads a
// signal of the same nullable type that holds a value, so its attribute must
// still render (#3304: the omission guard is presence-only).
import { createSignal } from '@barefootjs/client'

export function NullishSignalAttr() {
  const [n, setN] = createSignal<number>()
  const [s, setS] = createSignal<string | undefined>(undefined)
  const [label] = createSignal<string | undefined>('go')
  return (
    <button
      title={s()}
      data-n={n()}
      aria-label={label()}
      onClick={() => {
        setN(1)
        setS('x')
      }}
    >
      {n() ?? 'none'}
    </button>
  )
}
