import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `className={cn\`base \${signal()}\`}` —
 * tagged template literal as className.
 *
 * SURFACED: the compiler's type-strip step drops the `...` rest spread
 * from function parameters along with the type annotation, so
 * `function cn(parts, ...args)` becomes `function cn(parts, args)`.
 * The tag function then receives a single string instead of an array,
 * and indexing into a string per-character produces nonsense
 * (`'primary'[0] === 'p'`, `[1] === 'r'`) — hence the locked-in
 * `class="base pr"` rather than the correct `class="base primary"`.
 *
 * Both SSR and CSR produce the same wrong output, so the fixture
 * passes conformance. The expectedHtml below records the *current*
 * wrong shape so that, when the rest-spread strip is fixed, this
 * fixture flips red and prompts the expectedHtml to be regenerated
 * to the corrected `class="base primary"`. Sub-issue of #1244.
 */
export const fixture = createFixture({
  id: 'tagged-template-classname',
  description: 'Tagged-template className renders the resolved string at initial paint',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
function cn(parts: TemplateStringsArray, ...args: unknown[]): string {
  return parts.reduce<string>((acc, p, i) => acc + p + (args[i] ?? ''), '')
}
export function TaggedTemplateClassname() {
  const [tone, setTone] = createSignal('primary')
  return <div onClick={() => setTone('secondary')} className={cn\`base \${tone()}\`}>x</div>
}
`,
  expectedHtml: `
    <div class="base pr" bf-s="test" bf="s0">x</div>
  `,
})
