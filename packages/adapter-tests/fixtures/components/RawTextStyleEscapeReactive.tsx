'use client'

// Test fixture: signal-driven text in `<style>` / `<script>` holding the
// characters HTML text escaping rewrites (`>`, `"`) and an element-ending
// sequence (`</script>`). The parser decodes no character reference in these
// elements, so the rule only matches when the text is written as it is; the
// `<i>` elements show which selector the browser applied.

import { createSignal } from '@barefootjs/client'

export function RawTextStyleEscapeReactive() {
  const [k, setK] = createSignal('a')
  return (
    <div>
      <style className="rule">{'.w > i[data-k="' + k() + '"]{color:red}'}</style>
      <script className="data" type="application/json">{'{"k":"' + k() + '</script>"}'}</script>
      <div className="w">
        <i className="a" data-k="a">a</i>
        <i className="b" data-k="b">b</i>
      </div>
      <button className="go" onClick={() => setK('b')}>go</button>
    </div>
  )
}
