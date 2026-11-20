import { createFixture } from '../src/types'

/**
 * A static end tag spelled across text nodes of a `<style>` / `<script>`
 * (JSX text next to a fragment's text) must not end the element (#3934): the
 * rewrite of each markup-opening `<` runs over the whole text, not per node.
 * The dynamic twin is `raw-text-split-boundary`.
 */
export const fixture = createFixture({
  id: 'raw-text-split-boundary-static',
  description: 'A static end tag split across the text nodes of <style> / <script> is still rewritten',
  source: `
export function RawTextSplitBoundaryStatic() {
  return (
    <div>
      <style>&lt;/sty<>le&gt;&lt;i class=&quot;pwn&quot;&gt;</></style>
      <script>&lt;/SCR<>ipt&gt;&lt;i class=&quot;pwn&quot;&gt;</></script>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <style>\\3c /style>\\3c i class="pwn"></style>
      <script>\\u003c/SCRipt>\\u003ci class="pwn"></script>
    </div>
  `,
})
