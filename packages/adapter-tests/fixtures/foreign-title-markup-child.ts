import { createFixture } from '../src/types'

/**
 * A `<title>` in SVG content holding an element child that carries a dynamic
 * attribute (#3937). The child's own template actions would land in what Go
 * `html/template` reads as RCDATA (it escapes by tag name, whatever the
 * namespace), so go-template refuses the shape (BF101) rather than render it
 * wrong. The text-and-expression case renders: `foreign-title-slot`.
 */
export const fixture = createFixture({
  id: 'foreign-title-markup-child',
  description: 'An element child of an SVG <title> with a dynamic attribute',
  source: `
export function ForeignTitleMarkupChild({ label }: { label: string }) {
  return (
    <svg>
      <title>
        <b title={label}>x</b>
      </title>
    </svg>
  )
}
`,
  props: { label: 'tip' },
  expectedHtml: `
    <svg bf-s="test"><title><b bf="s0" title="tip">x</b></title></svg>
  `,
})
