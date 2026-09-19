'use client'

// A signal declared with an explicit `T | undefined` type argument and a
// literal initial value. The reference renders that initial value at SSR
// (`title="one"` and the text `one`) — the type argument says nothing
// about the value the signal starts with. Pinned because a template
// adapter that types the field from the union (`interface{}` seeded as
// `nil`) loses the literal and renders an empty attribute and empty text.
// The click cycles the value through `undefined` and back so the
// hydrated reactive path is exercised too.
import { createSignal } from '@barefootjs/client'

export function SignalOptionalInit() {
  const [label, setLabel] = createSignal<string | undefined>('one')
  return (
    <div>
      <span data-slot="target" title={label()}>
        {label()}
      </span>
      <button onClick={() => setLabel(l => (l === undefined ? 'one' : undefined))}>toggle</button>
    </div>
  )
}
