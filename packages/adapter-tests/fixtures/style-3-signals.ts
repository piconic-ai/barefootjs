import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `style={{}}` with three independent signal
 * members. Layer 1 surfaced that the compiler currently emits only two
 * of the three reactive update paths; this fixture pins the *initial*
 * SSR render and the CSR template's first-eval output so a future fix
 * keeps the static shape correct while the per-signal binding count is
 * tracked at the unit layer.
 */
export const fixture = createFixture({
  id: 'style-3-signals',
  description: 'style={{}} with three signal members renders all three CSS declarations at initial paint',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function Style3Signals() {
  const [bg, setBg] = createSignal('red')
  const [fg, setFg] = createSignal('white')
  const [pad, setPad] = createSignal('8px')
  return (
    <div onClick={() => setBg('blue')} style={{ background: bg(), color: fg(), padding: pad() }}>
      hello
    </div>
  )
}
`,
  expectedHtml: `
    <div style="background:red;color:white;padding:8px" bf-s="test" bf="s0"> hello </div>
  `,
})
