'use client'

// Test fixture: a MathML <annotation-xml> whose `encoding` comes from an
// attribute spread. It is an HTML integration point only for the HTML
// encodings, so a <title> inside it is an RCDATA host exactly when the spread
// supplies one — and the spread can only be known at runtime. The compiler
// therefore treats it as HTML (bare value, no slot markers) and the title
// text updates through the element's own content.

import { createSignal } from '@barefootjs/client'

export function RawTextHostAnnotationXml({ ...rest }: { encoding?: string }) {
  const [n, setN] = createSignal(1)
  return (
    <div>
      <math>
        <annotation-xml className="plain" {...rest}>
          <title className="plain-title">{'t' + n()}</title>
        </annotation-xml>
      </math>
      <button className="go" onClick={() => setN(n() + 1)}>go</button>
    </div>
  )
}
