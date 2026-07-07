import { createFixture } from '../src/types'

/**
 * A long static `class` attribute written across MULTIPLE SOURCE
 * LINES inside one string, plus a template-literal class with a
 * leading/trailing space around the interpolation. Pins whitespace
 * fidelity inside attribute values (the inter-tag collapse in the
 * normalizer does not touch intra-attribute spaces).
 */
export const fixture = createFixture({
  id: 'multiline-attr-value',
  description: 'Class strings with interior spaces and interpolation spacing',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function MultilineAttrValue() {
  const [tone, setTone] = createSignal('info')
  return (
    <div className={\`alert alert-\${tone()} shadow\`}>
      <span className="icon  gap">note</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s0" class="alert alert-info shadow"><span class="icon gap">note</span></div>
  `,
})
