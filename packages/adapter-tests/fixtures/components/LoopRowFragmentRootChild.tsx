'use client'

// Test fixture: a `.map()` row calling a STATELESS child component whose
// root is a fragment. The child has no init body, so it is registered by
// the template-only path; that registration must declare the same
// fragment-root scope shape SSR renders (a `<!--bf-scope:-->` comment pair,
// no `bf-s` on the child's element), or a CSR mount stamps `bf-s` onto the
// child's `<span>` and diverges from SSR + hydration.

import { createSignal } from '@barefootjs/client'

function Tag({ children }: { children?: any }) {
  return (
    <>
      <span className="tag">{children}</span>
    </>
  )
}

export function LoopRowFragmentRootChild() {
  const [active, setActive] = createSignal('a')
  const opts = ['a', 'b']

  return (
    <div>
      {opts.map(opt => (
        <Tag key={opt}>
          <b data-current={active() === opt ? 'true' : 'false'}>{opt}</b>
        </Tag>
      ))}
      <button type="button" className="toggle" onClick={() => setActive('b')}>
        toggle
      </button>
    </div>
  )
}
