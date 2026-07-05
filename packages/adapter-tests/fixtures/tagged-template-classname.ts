import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `className={cn\`base \${signal()}\`}` —
 * tagged template literal as className.
 *
 * Resolved by #2092: the tag identifier `cn` resolves one hop through
 * same-file scope (reusing #2090's `findLocalConst`/`findLocalFunction`)
 * to a function structurally proven to be an "interleave tag" — the
 * `parts.reduce((acc, p, i) => acc + p + (args[i] ?? ''), '')` shape.
 * The whole tagged template then desugars to the equivalent UNTAGGED
 * template literal (`\`base \${(tone()) ?? ''}\``) before the rest of the
 * pipeline ever sees it, so it renders on every adapter — not just
 * Hono/CSR — exactly like any other className template literal.
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
    <div bf-s="test" bf="s0" class="base primary">x</div>
  `,
})
