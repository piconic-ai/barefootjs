import { createFixture } from '../src/types'

/**
 * An end tag spelled across the children of a `<style>` / `<script>` must not
 * end the element (#3934). The text of these elements is not HTML-escaped;
 * each `<` that could begin markup is rewritten instead, and that
 * rewrite has to see the WHOLE text: `{'<'}{tail}` with `tail` =
 * `/style><i class="pwn">` holds `</style` in neither child. Every shape
 * below would otherwise put an `<i class="pwn">` after the element:
 * static + dynamic, dynamic + dynamic, a fragment's children, dynamic +
 * static, three pieces in mixed case, and a `<!--` whose `<script` (the
 * double-escaped state, where the real end tag no longer closes the
 * element) arrives in a later child. go-template refuses a dynamic child of
 * these elements (#3810).
 */
export const fixture = createFixture({
  id: 'raw-text-split-boundary',
  description: 'An end tag split across the children of <style> / <script> is still rewritten',
  source: `
export function RawTextSplitBoundary({ tail, head, rest, sTail, sHead, sRest }: { tail: string; head: string; rest: string; sTail: string; sHead: string; sRest: string }) {
  return (
    <div>
      <style>{'<'}{tail}</style>
      <style>{head}{rest}</style>
      <style>&lt;/sty<>{rest}</></style>
      <style>{head}le&gt;&lt;i class=&quot;pwn&quot;&gt;</style>
      <style><>{'<'}</>{'/ST'}{'YLE'}{rest}</style>
      <script>{'<'}{sTail}</script>
      <script>{sHead}{sRest}</script>
      <script>&lt;/scr<>{sRest}</></script>
      <script>{sHead}ipt&gt;&lt;i class=&quot;pwn&quot;&gt;</script>
      <script><>{'<'}</>{'/SCR'}{sRest}</script>
      <script>{'<!--<scr'}{sRest}</script>
    </div>
  )
}
`,
  props: {
    tail: '/style><i class="pwn">',
    head: '</sty',
    rest: 'le><i class="pwn">',
    sTail: '/script><i class="pwn">',
    sHead: '</scr',
    sRest: 'ipt><i class="pwn">',
  },
  expectedHtml: `
    <div bf-s="test">
      <style bf="s1">\\3c /style>\\3c i class="pwn"></style>
      <style bf="s4">\\3c /style>\\3c i class="pwn"></style>
      <style bf="s6">\\3c /style>\\3c i class="pwn"></style>
      <style bf="s8">\\3c /style>\\3c i class="pwn"></style>
      <style bf="s10">\\3c /STYLEle>\\3c i class="pwn"></style>
      <script bf="s12">\\u003c/script>\\u003ci class="pwn"></script>
      <script bf="s15">\\u003c/script>\\u003ci class="pwn"></script>
      <script bf="s17">\\u003c/script>\\u003ci class="pwn"></script>
      <script bf="s19">\\u003c/script>\\u003ci class="pwn"></script>
      <script bf="s21">\\u003c/SCRipt>\\u003ci class="pwn"></script>
      <script bf="s23">\\u003c!--\\u003cscript>\\u003ci class="pwn"></script>
    </div>
  `,
})
