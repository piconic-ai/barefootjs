import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'style-attribute',
  description: 'Inline style string attribute',
  source: `
export function StyleAttribute() {
  return <div style="color: red; font-size: 16px">Styled</div>
}
`,
  expectedHtml: `
    <div style="color: red; font-size: 16px" bf-s="test">Styled</div>
  `,
})

export const fixtureStaticObject = createFixture({
  id: 'style-object-static',
  description: 'Inline style object with static string values converts to CSS string',
  source: `
export function StyleObjectStatic() {
  return <div style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)' }}>Hello</div>
}
`,
  expectedHtml: `
    <div style="background:var(--bg-surface);color:var(--text-primary)" bf-s="test">Hello</div>
  `,
})

export const fixtureDynamicObject = createFixture({
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
})
