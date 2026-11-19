'use client'

// Test fixture: signal-driven text in the raw-text / RCDATA elements
// (`<style>`, `<script>`, `<textarea>`, `<title>`). Their content holds no
// comment node, so the update rewrites the element's content instead of a
// slot marker's range. A `<span>` runs the same signal as the control.

import { createSignal } from '@barefootjs/client'

export function RawTextHostReactive() {
  const [color, setColor] = createSignal('red')
  const [n, setN] = createSignal(1)
  return (
    <div>
      <style className="rule">{'.t{color:' + color() + '}'}</style>
      <script className="code">{'window.__n=' + n()}</script>
      <textarea className="area">{'v' + n()}</textarea>
      <title className="ttl">{'t' + n()}</title>
      <span className="ctl">{'c' + n()}</span>
      <i className="t">x</i>
      <button className="go" onClick={() => { setColor('blue'); setN(n() + 1) }}>go</button>
    </div>
  )
}
