'use client'

// Test fixture: a conditional branch renders a stateless child whose root is
// a transparent fragment (`<>{children}</>`). SSR renders the passed-through
// `<mark>` with no scope marker of its own, so hydrating the branch must not
// add `bf-s` / `bf-h` / `bf-m` to it, and a client-side mount must render it
// the same way (#3355).

import { createSignal } from '@barefootjs/client'

function Passthrough({ children }: { children?: unknown }) {
  return <>{children}</>
}

export function FragmentChildInConditional() {
  const [show, setShow] = createSignal(true)
  return (
    <div>
      {show() && <Passthrough><mark className="m">value</mark></Passthrough>}
      <button className="toggle" onClick={() => setShow(!show())}>toggle</button>
    </div>
  )
}
