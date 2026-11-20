import { createFixture } from '../src/types'

/**
 * Static `<style>` / `<script>` text with a backslash in front of a
 * character the raw-text encoding rewrites (#3934): after an even run of
 * backslashes the escape is inserted, in an odd run it replaces the last
 * backslash and the character together, so `"\<b"` still spells `<b`. The
 * second `<style>` spells the pair across two text nodes. The dynamic twin
 * is `raw-text-backslash-escape`.
 */
export const fixture = createFixture({
  id: 'raw-text-backslash-escape-static',
  description: 'Static <style> / <script> text keeps what a backslash before a rewritten < / & spelled',
  source: `
export function RawTextBackslashEscapeStatic() {
  return (
    <div>
      <script>var s = &quot;\\&lt;b \\\\&lt;c \\&amp;amp; \\\\&amp;#60;&quot;</script>
      <style>.a::after &#123; content: &quot;\\&lt;b \\\\&lt;c \\&amp;d&quot; &#125;</style>
      <style>.b::after &#123; content: &quot;\\<>&lt;i&gt;</>&quot; &#125;</style>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <script>var s = "\\u003cb \\\\\\u003cc \\u0026amp; \\\\\\u0026#60;"</script>
      <style>.a::after { content: "\\3c b \\\\\\3c c \\26 d" }</style>
      <style>.b::after { content: "\\3c i>" }</style>
    </div>
  `,
})
