import { createFixture } from '../src/types'

/**
 * A dynamic child of a `<title>` / `<textarea>` in SVG content (#3937). Inside
 * `<svg>` the element holds foreign content, whose children read comments, so
 * the `<!--bf:sN-->…<!--/-->` slot markers stay (`raw-text-host-svg-style` is
 * the `<style>` twin). A template engine that sees `<title>` as RCDATA by
 * name (Go `html/template`) must still emit the markers as comment nodes, not
 * as escaped text. Covers a lone expression, text mixed with expressions, a
 * value that needs escaping, a nested `<svg>` under a `<foreignObject>`
 * (whose `<title>` is foreign again), and the HTML `<title>` of a
 * `<foreignObject>` child (an HTML integration point, so bare).
 */
export const fixture = createFixture({
  id: 'foreign-title-slot',
  description: 'A dynamic child of an SVG <title> / <textarea> keeps its slot markers',
  source: `
export function ForeignTitleSlot({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <svg>
        <title>{label}</title>
        <title>{'a'}{n}{label}</title>
        <textarea>{label}</textarea>
      </svg>
      <svg>
        <foreignObject>
          <title>{label}</title>
          <svg>
            <title>{n}</title>
          </svg>
        </foreignObject>
      </svg>
    </div>
  )
}
`,
  props: { label: 'a<b & "c"', n: 3 },
  expectedHtml: `
    <div bf-s="test">
      <svg>
        <title bf="s1"><!--bf:s0-->a&lt;b &amp; &quot;c&quot;<!--/--></title>
        <title bf="s4">a<!--bf:s2-->3<!--/--><!--bf:s3-->a&lt;b &amp; &quot;c&quot;<!--/--></title>
        <textarea bf="s6"><!--bf:s5-->a&lt;b &amp; &quot;c&quot;<!--/--></textarea>
      </svg>
      <svg><foreignObject><title bf="s8">a&lt;b &amp; &quot;c&quot;</title><svg><title bf="s10"><!--bf:s9-->3<!--/--></title></svg></foreignObject></svg>
    </div>
  `,
})
