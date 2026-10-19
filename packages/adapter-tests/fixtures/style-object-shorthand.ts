import { createFixture } from '../src/types'

/**
 * A style object with a shorthand property (`style={{ color, padding }}`)
 * next to an explicit one. Every template adapter used to re-parse the
 * attribute text, whose style parser refused a shorthand, so this was BF101
 * everywhere but Hono; the adapters now lower from the IR's parsed object
 * literal (#3541).
 */
export const fixture = createFixture({
  id: 'style-object-shorthand',
  description: 'A style object with shorthand properties renders as a CSS string on every adapter (#3541)',
  source: `
export function StyleObjectShorthand({ color, padding }: { color: string; padding: string }) {
  return <div style={{ color, padding, marginTop: '4px' }}>Hello</div>
}
`,
  props: { color: 'red', padding: '8px' },
  expectedHtml: `
    <div bf-s="test" bf="s0" style="color:red;padding:8px;margin-top:4px">Hello</div>
  `,
})
