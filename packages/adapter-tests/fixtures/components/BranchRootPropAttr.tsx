'use client'

// Root for the `branch-root-prop-attr` fixture (#2472 regression pin).
//
// Forwards a signal as a LIVE prop (`variant={variant()}`) into
// `VariantTag`, whose component-level if/else early return puts a
// prop-driven reactive class on the INACTIVE branch's own root element
// (`asChild` stays false for the whole test — only `variant` cycles).
// Mirrors how a real page forwards a playground signal into e.g.
// `<Badge variant={variant()}/>` — the shape `site/ui/e2e/badge.spec.ts`
// exercises and the #2472 regression broke.
import { createSignal } from '@barefootjs/client'
import { VariantTag } from './VariantTag'

export function BranchRootPropAttr() {
  const [variant, setVariant] = createSignal<'a' | 'b'>('a')
  return (
    <div>
      <VariantTag variant={variant()} />
      <button onClick={() => setVariant(v => (v === 'a' ? 'b' : 'a'))}>cycle</button>
    </div>
  )
}
