import { createFixture } from '../src/types'

/**
 * A presentational child that forwards the caller's leftover props and
 * carries NO state of its own — `<span className="plain" {...props}>` —
 * with a caller-supplied attribute (`data-probe`) that exists only at the
 * call site.
 *
 * Sibling of `rest-spread-child-attrs`, minus every reactive attribute:
 * there the child's root also binds `type` and `className` from props, so
 * it earned a slot id incidentally. Here nothing else on the root is
 * dynamic, which is the case #2754 reports — Phase 1 gave the element no
 * slot and `needsClientJs` did not count the rest-attrs application, so
 * `init` was empty and a pure `createComponent` mount dropped every
 * caller-supplied attribute while SSR and hydration looked correct.
 *
 * The `bf` slot in the expected output IS the fix: it is the address
 * `applyRestAttrs` uses, and without it the client has no patch point.
 */
export const fixture = createFixture({
  id: 'stateless-rest-spread-forward',
  description: 'A stateless {...props} forwarder gets a slot so CSR mount can apply caller attrs (#2754)',
  source: `
import { Plain } from './plain'

export function SpreadProbe() {
  return (
    <div>
      <Plain data-probe="1">hi</Plain>
    </div>
  )
}
`,
  components: {
    './plain.tsx': `
export function Plain({ children, ...props }: { children?: unknown; [key: string]: unknown }) {
  return <span className="plain" {...props}>{children}</span>
}
`,
  },
  expectedHtml: `
    <div bf-s="test"><span bf-s="test_s0" bf="s0" class="plain" data-probe="1">hi</span></div>
  `,
})
