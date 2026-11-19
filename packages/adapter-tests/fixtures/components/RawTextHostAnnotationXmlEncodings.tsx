'use client'

// Test fixture: MathML <annotation-xml> is an HTML integration point only for
// `encoding="text/html"` / `application/xhtml+xml`. A <title> under it holds
// RCDATA (no slot markers, bare value) on the HTML side and an ordinary MathML
// element (slot markers kept) on the foreign side. All three shapes update
// their text after the same event.

import { createSignal } from '@barefootjs/client'

export function RawTextHostAnnotationXmlEncodings() {
  const [n, setN] = createSignal(1)
  return (
    <div>
      <math>
        <annotation-xml className="none">
          <title className="none-title">{'a' + n()}</title>
        </annotation-xml>
      </math>
      <math>
        <annotation-xml className="tex" encoding="application/x-tex">
          <title className="tex-title">{'b' + n()}</title>
        </annotation-xml>
      </math>
      <math>
        <annotation-xml className="html" encoding="text/html">
          <title className="html-title">{'c' + n()}</title>
        </annotation-xml>
      </math>
      <button className="go" onClick={() => setN(n() + 1)}>go</button>
    </div>
  )
}
