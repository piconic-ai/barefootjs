'use client'

// Sibling of `ChildPropRestForward` (#3055/#3056), for #3057: the forwarded
// `tag` prop starts `undefined` — SSR renders `RestForwardTag`'s root with
// NO `tag` attribute at all, not merely a falsy one. `ChildPropRestForward`
// cycles `tag` THROUGH `undefined` after it has already been present once
// (`hasAttribute('tag')` seeds true on that first SSR render), which is a
// different starting condition from this fixture's "never rendered yet."
//
// Before #3057's fix, nothing ever wrote `tag` here: the parent-side mirror
// (`emitReactiveChildProps`) seeds its gate from `hasAttribute('tag')` on
// first run, which reads `false` forever since SSR never rendered the
// attribute, and the child's own statically-expanded `{...rest}` binding
// (`RestForwardTag`'s template) only applied the value once, at construction
// time — no `createEffect` re-ran it. So setting `tag` on the first click
// never reached the DOM at all.
import { createSignal } from '@barefootjs/client'
import { RestForwardTag } from './RestForwardTag'

export function ChildPropRestForwardUndefinedStart() {
  const [tag, setTag] = createSignal<string | undefined>(undefined)
  return (
    <div>
      <RestForwardTag tag={tag()} />
      <button onClick={() => setTag(t => (t === undefined ? 'x' : undefined))}>toggle</button>
    </div>
  )
}
