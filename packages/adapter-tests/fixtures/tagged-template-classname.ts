import { createFixture } from '../src/types'

/**
 * Compiler stress (#1244): `className={cn\`base \${signal()}\`}` —
 * tagged template literal as className.
 *
 * Resolved by #1321: rest-parameter `...` token now survives the type-strip
 * pass and module-level helper emission, so `function cn(parts, ...args)`
 * stays variadic and the tagged-template result resolves to the expected
 * `class="base primary"`.
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
