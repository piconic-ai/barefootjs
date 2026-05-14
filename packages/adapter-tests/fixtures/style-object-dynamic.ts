import { createFixture } from '../src/types'

/**
 * Inline style object with a dynamic prop value.
 *
 * Hono renders the style as a CSS string at request time. The Go
 * template adapter records `BF101` via `convertExpressionToGo()`
 * (the JS object literal can't lower into Go template syntax) — the
 * `expectedDiagnostics` entry pins that as a tested contract instead
 * of leaving it as an implicit side-effect of a `skipJsx` entry
 * (#1266). Mojo currently emits invalid Perl silently for this shape
 * and stays in `skipJsx` until its expression-support gate is
 * extended.
 */
export const fixture = createFixture({
  id: 'style-object-dynamic',
  description: 'Inline style object with dynamic prop value renders as CSS string',
  source: `
export function StyleObjectDynamic({ color }: { color: string }) {
  return <div style={{ backgroundColor: color, padding: '8px' }}>Hello</div>
}
`,
  props: { color: 'red' },
  expectedHtml: `
    <div style="background-color:red;padding:8px" bf-s="test" bf="s0">Hello</div>
  `,
  expectedDiagnostics: {
    'go-template': [{ code: 'BF101', severity: 'error' }],
  },
})
