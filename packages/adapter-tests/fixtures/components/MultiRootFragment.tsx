'use client'

// Test fixture (#2735): a component whose ENTIRE render is a genuine
// multi-root JSX Fragment — `return <>...</>` with two top-level sibling
// elements, neither of them a `.map()` loop row. The existing
// `fragment-wrap` mutation (#2481) only ever wraps a SINGLE root
// (`<>{originalRoot}</>`), so no fixture in the corpus exercised this
// shape through the real `createComponent()` CSR-mount path
// (`fixture-host.ts`'s `'csr-mount'` host mode) before this one.
//
// The SECOND root carries the only reactive text slot AND the only event
// handler on purpose: it is exactly the content
// `materializeComponent`'s `parseHTML(html.trim()).firstChild`
// (`@barefootjs/client/runtime/component.ts` step 6) used to throw away,
// since it kept only the fragment template's first parsed node.
//
// The bare text between the two elements is load-bearing too: a fragment's
// top level is not only elements, and the first fix for this kept only
// `nodeType === ELEMENT_NODE` siblings — which passed with two adjacent
// elements while still dropping any text (and, worse, any `<!--bf:sN-->`
// slot marker) that sat between them.

import { createSignal } from '@barefootjs/client'

export function MultiRootFragment() {
  const [count, setCount] = createSignal(0)
  return (
    <>
      <h1>title</h1>
      between
      <p onClick={() => setCount(count() + 1)}>{count()}</p>
    </>
  )
}
