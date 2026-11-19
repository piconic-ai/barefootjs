'use client'

// Test fixture: the HTML parser routes an <svg> start tag placed directly
// under a MathML <annotation-xml> into the SVG namespace, whatever the
// annotation-xml's `encoding`. An SVG <title> is an HTML integration point, so
// the <style> inside it is an HTML raw-text host: its dynamic text renders
// without slot markers and updates after an event.

import { createSignal } from '@barefootjs/client'

export function RawTextHostAnnotationXmlSvg() {
  const [n, setN] = createSignal(1)
  return (
    <div>
      <math>
        <annotation-xml>
          <svg>
            <title>
              <style className="deep">{'x' + n()}</style>
            </title>
          </svg>
        </annotation-xml>
      </math>
      <button className="go" onClick={() => setN(n() + 1)}>go</button>
    </div>
  )
}
