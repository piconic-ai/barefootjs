'use client'

// Test fixture: an end tag spelled across the children of a `<style>` /
// `<script>`, on the server render and after a signal update. The text of
// these elements is not HTML-escaped, so the element-ending sequences are
// rewritten over the whole text; encoded per child, `'<'` + `/style><i>`
// would close the element and add an `<i class="pwn">` after it.

import { createSignal } from '@barefootjs/client'

export function RawTextSplitBoundaryReactive() {
  const [tail, setTail] = createSignal('/style><i class="pwn">a')
  const [name, setName] = createSignal('ipt><i class="pwn">a')
  return (
    <div>
      <style className="css">{'<'}{tail()}</style>
      <script className="js" type="text/plain">{'</scr'}{name()}</script>
      <script className="esc" type="text/plain">{'<!--<scr'}{name()}</script>
      <b className="after">after</b>
      <button className="go" onClick={() => { setTail('/STYLE><i class="pwn">b'); setName('IPT><i class="pwn">b') }}>go</button>
    </div>
  )
}
