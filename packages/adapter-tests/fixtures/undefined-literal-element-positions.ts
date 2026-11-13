import { createFixture } from '../src/types'

/**
 * A written `undefined` / `null` as an element attribute value is omitted,
 * and as a condition is falsy. A backend that reads `undefined` as a
 * template variable named `Undefined` fails the render, and one that spells
 * the value as an empty string keeps the attribute (`data-a=""`).
 */
export const fixture = createFixture({
  id: 'undefined-literal-element-positions',
  description: 'a written undefined or null omits an attribute and is falsy in a condition',
  source: `
export function UndefinedLiteralElementPositions() {
  return (
    <div data-a={undefined} data-n={null}>
      <p>{undefined ? 'y' : 'n'}|{null ? 'y' : 'n'}|{!undefined ? 'not' : 'is'}</p>
      {undefined && <b>u</b>}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test"><p>n|n|not</p></div>
  `,
})
