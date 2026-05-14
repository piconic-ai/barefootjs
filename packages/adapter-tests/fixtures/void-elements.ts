import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'void-elements',
  description: 'Void HTML elements (br, hr, img, input)',
  source: `
export function VoidElements() {
  return (
    <div>
      <br />
      <hr />
      <img src="test.png" alt="test" />
      <input type="text" />
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <br>
      <hr>
      <img src="test.png" alt="test">
      <input type="text">
    </div>
  `,
})
