import { createFixture } from '../src/types'

/**
 * A dynamic child of `<textarea>` and `<title>` (#3910). The content of these
 * elements is RCDATA: the HTML parser does not read a comment inside it, so
 * the `<!--bf:sN-->…<!--/-->` slot markers would become literal text (a
 * textarea that shows the markers as its value). The value renders bare. The
 * `<style>` / `<script>` twin is `raw-text-host-style-script`.
 */
export const fixture = createFixture({
  id: 'raw-text-host-dynamic',
  description: 'A dynamic child of <textarea> and <title> renders without slot markers',
  source: `
export function RawTextHostDynamic({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <textarea>{label}</textarea>
      <title>{label}</title>
      <textarea>{'a'}{n}{label}</textarea>
    </div>
  )
}
`,
  props: { label: 'a<b & "c"', n: 3 },
  expectedHtml: `
    <div bf-s="test">
      <textarea bf="s1">a&lt;b &amp; &quot;c&quot;</textarea>
      <title bf="s3">a&lt;b &amp; &quot;c&quot;</title>
      <textarea bf="s6">a3a&lt;b &amp; &quot;c&quot;</textarea>
    </div>
  `,
})
