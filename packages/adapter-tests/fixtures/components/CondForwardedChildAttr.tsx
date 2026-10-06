'use client'

// Test fixture (#3324): a reactive attribute on an element forwarded as a
// conditional child component's `children`. The element is parent-owned
// (`bf="^sN"`) yet renders inside the child's own `bf-s` scope, so the
// branch's attribute lookup must cross that boundary. `Other`, rendered
// earlier in the same branch, forwards its own element with the SAME
// parent-owned slot id into a `Wrapper` of its own — the negative control:
// the parent's lookup must not resolve to it, so it keeps `other`.

import { createSignal } from '@barefootjs/client'

function Wrapper({ children }: { children?: unknown }) {
  return <section className="wrapper">{children}</section>
}

function Other() {
  const [value] = createSignal('other')
  return (
    <article>
      <i data-a={value()} />
      <b data-b={value()} />
      <Wrapper>
        <em className="other" data-label={value()}>other</em>
      </Wrapper>
    </article>
  )
}

export function CondForwardedChildAttr() {
  const [show, setShow] = createSignal(true)
  const [label, setLabel] = createSignal('alpha')
  return (
    <div>
      {show() && (
        <>
          <Other />
          <Wrapper>
            <strong className="forwarded" data-label={label()}>value</strong>
          </Wrapper>
        </>
      )}
      <button className="update" onClick={() => setLabel(label() === 'alpha' ? 'beta' : 'alpha')}>update</button>
      <button className="toggle" onClick={() => setShow(!show())}>toggle</button>
    </div>
  )
}
