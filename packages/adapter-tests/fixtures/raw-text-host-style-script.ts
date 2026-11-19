import { createFixture } from '../src/types'

/**
 * A dynamic child of `<style>` and `<script>` (#3910): raw text, where the
 * HTML parser reads no comment, so `<!--bf:sN-->…<!--/-->` slot markers would
 * be literal CSS / JS (a rule dropped, a statement commented out). The value
 * renders bare. go-template refuses the shape (#3810): html/template escapes
 * an action in these elements as CSS / JS.
 */
export const fixture = createFixture({
  id: 'raw-text-host-style-script',
  description: 'A dynamic child of <style> and <script> renders without slot markers',
  source: `
export function RawTextHostStyleScript({ color, label }: { color: string; label: string }) {
  return (
    <div>
      <style>{'.t{color:' + color + '}'}</style>
      <script>{'var x=' + label.length}</script>
      <style>{'.u{color:'}{color}{'}'}</style>
    </div>
  )
}
`,
  props: { color: 'red', label: 'a<b & "c"' },
  expectedHtml: `
    <div bf-s="test">
      <style bf="s1">.t{color:red}</style>
      <script bf="s3">var x=9</script>
      <style bf="s6">.u{color:red}</style>
    </div>
  `,
})
