import { createFixture } from '../src/types'

/**
 * A backslash in front of a character the `<style>` / `<script>` encoding
 * rewrites (#3934). Inside a CSS / JS string a backslash already escapes what
 * follows: `"\<b"` is the text `<b`. Writing the language escape after that
 * backslash (`"\\u003cb"`) would change the text to a backslash and
 * `u003cb`. So the run of backslashes directly before a rewritten `<` / `&`
 * decides: after an even run the escape is inserted, and in an odd run the
 * last backslash and the character are replaced by the escape together.
 * Either way the text reads back as written, and no `<` / `&` that could
 * begin markup or a character reference is left. The backslash (`bs`) and the
 * character arrive in different children here, so the run is only visible
 * once the element's whole text is joined. go-template refuses a dynamic
 * child of these elements (#3810).
 */
export const fixture = createFixture({
  id: 'raw-text-backslash-escape',
  description: 'A backslash before a rewritten < / & in <style> / <script> keeps the text it spelled',
  source: `
export function RawTextBackslashEscape({ bs, lt, amp, whole }: { bs: string; lt: string; amp: string; whole: string }) {
  return (
    <div>
      <script>{'var one = "'}{bs}{lt}{'";'}</script>
      <script>{'var two = "'}{bs}{bs}{lt}{'";'}</script>
      <script>{'var three = "'}{bs}{bs}{bs}{amp}{'";'}</script>
      <script>{whole}</script>
      <style>{'.a::after { content: "'}{bs}{lt}{bs}{amp}{'" }'}</style>
      <style>{'.b::after { content: "'}{bs}{bs}{lt}{'" }'}</style>
      <style>{whole}</style>
    </div>
  )
}
`,
  props: {
    bs: '\\',
    lt: '<img class="pwn">',
    amp: '&quot;',
    whole: 'x = "\\<b \\\\<c \\&amp; \\\\&#60; \\< d \\";',
  },
  expectedHtml: `
    <div bf-s="test">
      <script bf="s2">var one = "\\u003cimg class="pwn">";</script>
      <script bf="s6">var two = "\\\\\\u003cimg class="pwn">";</script>
      <script bf="s11">var three = "\\\\\\u0026quot;";</script>
      <script bf="s13">x = "\\u003cb \\\\\\u003cc \\u0026amp; \\\\\\u0026#60; \\< d \\";</script>
      <style bf="s18">.a::after { content: "\\3c img class="pwn">\\26 quot;" }</style>
      <style bf="s22">.b::after { content: "\\\\\\3c img class="pwn">" }</style>
      <style bf="s24">x = "\\3c b \\\\\\3c c \\26 amp; \\\\\\26 #60; \\< d \\";</style>
    </div>
  `,
})
