'use client'

// Test fixture: a `<style>` / `<script>` written in HTML but rendered inside
// an `<svg>` (`Frame` places its children there), where the HTML parser
// reads the element's text as markup. The text holds an `<img class="pwn">`
// and an end tag, which must not become elements, and character references
// (`&quot;`, a split `&#60;`), which must not be decoded.

import { createSignal } from '@barefootjs/client'

function Frame({ children }: { children?: unknown }) {
  return <svg className="frame">{children}</svg>
}

export function RawTextForeignContentReactive() {
  const [n, setN] = createSignal(1)
  return (
    <div>
      <Frame>
        <style className="css">{'<img class="pwn"><i class="pwn"></style><!--<?x <![CDATA[.z < 1'}</style>
        <script className="js" type="text/plain">{'<'}{'img class="pwn"></script><a class="pwn">&quot;&'}{'#60;img class="pwn">&amp;'}</script>
      </Frame>
      <b className="after">{'after' + n()}</b>
      <button className="go" onClick={() => setN(n() + 1)}>go</button>
    </div>
  )
}
