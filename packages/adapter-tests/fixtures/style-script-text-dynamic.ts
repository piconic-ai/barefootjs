import { createFixture } from '../src/types'

/**
 * A dynamic string expression in the text of a `<style>` element and of a
 * `<script>` element (#3810). Go's html/template treats these as CSS / JS
 * contexts and replaces a plain string with `ZgotmplZ`.
 */
export const fixture = createFixture({
  id: 'style-script-text-dynamic',
  description: 'A string prop in <style> and <script> element text',
  source: `
export function StyleScriptTextDynamic({ color }: { color: string }) {
  return (
    <div>
      <style>{color}</style>
      <script>{color}</script>
    </div>
  )
}
`,
  props: { color: 'red' },
  expectedHtml: `
    <div bf-s="test">
      <style bf="s1"><!--bf:s0-->red<!--/--></style>
      <script bf="s3"><!--bf:s2-->red<!--/--></script>
    </div>
  `,
})
