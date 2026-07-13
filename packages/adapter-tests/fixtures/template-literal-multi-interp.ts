import { createFixture } from '../src/types'

/**
 * A template literal with several interpolations and literal segments
 * between them, in text position. Pins segment/interpolation
 * interleaving (leading literal, back-to-back interpolations, trailing
 * literal) in one expression.
 */
export const fixture = createFixture({
  id: 'template-literal-multi-interp',
  description: 'Template literal with multiple interpolations in text content',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
export function TemplateLiteralMultiInterp(props: { greeting?: string }) {
  const [name, setName] = createSignal('World')
  const [punct, setPunct] = createSignal('!')
  return <p>{\`\${props.greeting ?? 'Hello'}, \${name()}\${punct()} bye\`}</p>
}
`,
  props: { greeting: 'Hi' },
  // `??` INSIDE a template literal is a distinct lowering path from
  // text-position `??`: absent falls back, but a present-but-empty ''
  // must be kept (JS nullish), and markup must arrive escaped.
  dataPoints: [
    { name: 'absent', props: {} },
    { name: 'empty-greeting', props: { greeting: '' } },
    { name: 'markup-greeting', props: { greeting: '<b>&' } },
  ],
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->Hi, World! bye<!--/--></p>
  `,
})
