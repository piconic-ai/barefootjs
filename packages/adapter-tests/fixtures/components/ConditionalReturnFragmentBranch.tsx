'use client'

// Root for the `conditional-return-fragment-branch` fixture: the shape the
// mutation sweep's `fragment-wrap` mutant produces from a conditional-return
// component, written out as real source. One early-return branch is a bare
// element, the other is wrapped in a fragment. `emit-registration.ts`
// decides `comment` / `fragmentRoot` once per component from `ir.root.type`
// (here `'if-statement'`, so neither fires), so hydration never claims the
// fragment-wrapped branch's comment-scoped root: no `bf-s`, no bound events.
// A pure client mount renders it correctly. Registry limitation
// `fragment-wrapped-conditional-return-branch-scope`.
import { createSignal } from '@barefootjs/client'

export function ConditionalReturnFragmentBranch(props: { asLink?: boolean }) {
  const [count, setCount] = createSignal(0)
  if (props.asLink) {
    return (
      <a class="cr-link" href="#" onClick={() => setCount(count() + 1)}>
        link: {count()}
      </a>
    )
  }
  return (
    <>
      <button class="cr-button" onClick={() => setCount(count() + 1)}>
        button: {count()}
      </button>
    </>
  )
}
