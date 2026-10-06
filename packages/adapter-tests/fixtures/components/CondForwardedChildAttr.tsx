'use client'

// Test fixture (#3324): a reactive attribute on an element forwarded as a
// conditional child component's `children`. The element is parent-owned
// (`bf="^sN"`) yet renders inside the child's own `bf-s` scope, so the
// branch's attribute lookup must cross that boundary. `Badge` renders its
// own `data-label` slot with the same local slot number, the negative
// control: it must keep its static value.

import { createSignal } from '@barefootjs/client'

function Wrapper({ children }: { children?: unknown }) {
  return <section className="wrapper">{children}</section>
}

function Badge() {
  return <span className="badge" data-label="badge">badge</span>
}

export function CondForwardedChildAttr() {
  const [show, setShow] = createSignal(true)
  const [label, setLabel] = createSignal('alpha')
  return (
    <div>
      {show() && (
        <Wrapper>
          <Badge />
          <strong className="forwarded" data-label={label()}>value</strong>
        </Wrapper>
      )}
      <button className="update" onClick={() => setLabel(label() === 'alpha' ? 'beta' : 'alpha')}>update</button>
      <button className="toggle" onClick={() => setShow(!show())}>toggle</button>
    </div>
  )
}
