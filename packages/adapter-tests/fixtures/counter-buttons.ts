import { createFixture } from '../src/types'

/**
 * Counter with three `<Button>` children-forwarding slots (#2158).
 *
 * Lifted from the #2157 reproduction app: a stock `Counter` (signal +
 * memo, same shape as `fixtures/counter.ts`) composed with a `Button`
 * child component that forwards `props.children` into a native
 * `<button>`. That composition — a manifest-registered child rendering
 * `children` — is the exact shape whose children rendered EMPTY on Ruby
 * before the #2157 fix (`derive_vars_from_defaults` silently dropped the
 * `children` prop), a bug invisible to the compile-matrix corpus because
 * every fixture there compiled clean; only a real backend *executing*
 * the template surfaced it.
 *
 * This fixture anchors the render-stage conformance contract
 * (`assertRenderContract` in `../src/render.contract.ts`, #2158) AND
 * joins the regular cross-adapter HTML conformance corpus below, so the
 * same shape is guaranteed to compile clean *and* SSR-render correct
 * children on every adapter.
 */
export const fixture = createFixture({
  id: 'counter-buttons',
  description: 'Counter composed with a children-forwarding Button child component',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from './button'

export function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter-container">
      <p className="counter-value">{count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <Button className="btn-increment" onClick={() => setCount(n => n + 1)}>+1</Button>
        <Button className="btn-decrement" onClick={() => setCount(n => n - 1)}>-1</Button>
        <Button className="btn-reset" onClick={() => setCount(0)}>Reset</Button>
      </div>
    </div>
  )
}
`,
  components: {
    // Class composition uses JS binary `+` (not a template literal) —
    // exercising #2163's fix: `isStringConcatBinary` detects the
    // string-literal `'btn '` operand and lowers `+` to each target's
    // string-concat operator (Twig `~`, Blade/PHP `.`) instead of its
    // numeric `+`, which used to compile clean but fatal at PHP render
    // time (`Unsupported operand types: string + string`).
    './button.tsx': `
export function Button({ children, className = '', onClick }: { children?: unknown; className?: string; onClick?: () => void }) {
  return <button className={'btn ' + className} onClick={onClick}>{children}</button>
}
`,
  },
  expectedHtml: `
    <div bf-s="test" class="counter-container">
      <p bf="s1" class="counter-value"><!--bf:s0-->0<!--/--></p>
      <p bf="s3" class="counter-doubled">doubled: <!--bf:s2-->0<!--/--></p>
      <div class="counter-buttons">
        <button bf-s="test_s4" bf="s0" class="btn btn-increment">+1</button>
        <button bf-s="test_s5" bf="s0" class="btn btn-decrement">-1</button>
        <button bf-s="test_s6" bf="s0" class="btn btn-reset">Reset</button>
      </div>
    </div>
  `,
})
