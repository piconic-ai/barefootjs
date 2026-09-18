'use client'

// Root for the `child-prop-rest-forward` fixture (#3055 coverage).
//
// Forwards two live props into `RestForwardTag`: `variant` (consumed
// internally by the child, never forwarded to its root — the
// `child-prop-mirror-attr-ssr` regression pin) and `tag` (NOT
// destructured by the child, so it reaches the root via `{...rest}` —
// the "child DOES forward the prop" case the #3055 fix must keep
// reactive). Both cycle off the same click so a single interaction
// exercises both legs together.
import { createSignal } from '@barefootjs/client'
import { RestForwardTag } from './RestForwardTag'

export function ChildPropRestForward() {
  const [variant, setVariant] = createSignal<'a' | 'b'>('a')
  const [tag, setTag] = createSignal('one')
  return (
    <div>
      <RestForwardTag variant={variant()} tag={tag()} />
      <button
        onClick={() => {
          setVariant(v => (v === 'a' ? 'b' : 'a'))
          setTag(t => (t === 'one' ? 'two' : 'one'))
        }}
      >
        cycle
      </button>
    </div>
  )
}
