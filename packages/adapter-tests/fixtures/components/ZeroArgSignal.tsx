'use client'

// #3215: `createSignal()` with no argument starts the signal as `undefined`,
// exactly like `createSignal(undefined)`. The analyzer used to record its
// initial value as `''`, so every emitter that splices it into an expression
// produced an empty operand: the Hono SSR getter `() =>  as string | undefined`
// and the CSR template `(() ?? 'none')`. The SSR, the CSR template and the
// hydrated page must all render the `?? 'none'` fallback before the click.
import { createSignal } from '@barefootjs/client'

export function ZeroArgSignal() {
  const [v, setV] = createSignal<string | undefined>()
  return <button onClick={() => setV('x')}>{v() ?? 'none'}</button>
}
