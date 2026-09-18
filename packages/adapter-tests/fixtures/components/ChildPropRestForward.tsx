'use client'

// Root for the `child-prop-rest-forward` fixture (#3055 coverage).
//
// Forwards two live props into `RestForwardTag`: `variant` (consumed
// internally by the child, never forwarded to its root — the
// `child-prop-mirror-attr-ssr` regression pin) and `tag` (NOT
// destructured by the child, so it reaches the root via `{...rest}` —
// the "child DOES forward the prop" case the #3055 fix must keep
// reactive). Both cycle off the same click so a single interaction
// exercises both legs together. The forwarded value cycles THROUGH
// `undefined` (`one` → `undefined` → `two` → `one` …) via a boolean gate
// (`shown() ? tag() : undefined`) rather than a `string | undefined`
// signal, so every signal keeps a plain inferred type: the mirror removes
// the attribute on the `undefined` step and must put it back on the
// next — a gate that re-read `hasAttribute` live would see its own
// removal and never write again.
import { createSignal } from '@barefootjs/client'
import { RestForwardTag } from './RestForwardTag'

export function ChildPropRestForward() {
  const [variant, setVariant] = createSignal<'a' | 'b'>('a')
  const [tag, setTag] = createSignal('one')
  const [shown, setShown] = createSignal(true)
  return (
    <div>
      <RestForwardTag variant={variant()} tag={shown() ? tag() : undefined} />
      <button
        onClick={() => {
          setVariant(v => (v === 'a' ? 'b' : 'a'))
          // (shown, tag): (true, one) → (false, one) → (true, two) → (true, one) → …
          if (shown() && tag() === 'one') setShown(false)
          else if (!shown()) { setShown(true); setTag('two') }
          else setTag('one')
        }}
      >
        cycle
      </button>
    </div>
  )
}
