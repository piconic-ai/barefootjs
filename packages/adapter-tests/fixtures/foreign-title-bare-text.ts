import { createFixture } from '../src/types'

/**
 * The shapes of a `<title>` / `<textarea>` near foreign content that need no
 * slot marker and so render on every adapter, Go `html/template` included
 * (#3937; the reactive twin is `foreign-title-slot`): literal text, a
 * slotless constant expression, and an HTML-namespace `<title>` reached
 * through an SVG `<foreignObject>` or a MathML `<annotation-xml
 * encoding="text/html">` (both HTML integration points, so a bare raw-text
 * host).
 */
export const fixture = createFixture({
  id: 'foreign-title-bare-text',
  description: 'Literal and constant text in an SVG <title> / <textarea>, and HTML titles under integration points, render without a refusal',
  source: `
export function ForeignTitleBareText({ label }: { label: string }) {
  return (
    <div>
      <svg>
        <title>Chart</title>
        <title>{'a'}{'b'}</title>
        <textarea>x &amp; y</textarea>
      </svg>
      <svg>
        <foreignObject>
          <title>{label}</title>
        </foreignObject>
      </svg>
      <math>
        <annotation-xml encoding="text/html">
          <title>{label}</title>
        </annotation-xml>
      </math>
    </div>
  )
}
`,
  props: { label: 'a<b & "c"' },
  expectedHtml: `
    <div bf-s="test">
      <svg>
        <title>Chart</title>
        <title>ab</title>
        <textarea>x &amp; y</textarea>
      </svg>
      <svg><foreignObject><title bf="s1">a&lt;b &amp; &quot;c&quot;</title></foreignObject></svg>
      <math><annotation-xml encoding="text/html"><title bf="s3">a&lt;b &amp; &quot;c&quot;</title></annotation-xml></math>
    </div>
  `,
})
