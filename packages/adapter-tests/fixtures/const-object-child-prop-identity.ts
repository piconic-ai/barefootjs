import { createFixture } from '../src/types'

/**
 * A const whose initializer allocates (an object or array literal, a
 * module-scope object) and reads nothing reactive, passed as a child prop,
 * beside a primitive const. The client used to splice the initializer into
 * the prop getter, so every read built a new object (#3868); it now reads the
 * binding. This fixture pins what every backend renders for those positions.
 * The identity itself and the `new`, arrow, forwarding and loop-row shapes
 * are driven in a real browser by `const-object-prop-identity-hydrate`; a
 * const object that reads a signal is `signal-const-object-child-prop`.
 */
export const fixture = createFixture({
  id: 'const-object-child-prop-identity',
  description: 'A non-reactive allocating const passed as a child prop renders its value in the child',
  source: `
'use client'
const MODULE_TOKEN = { n: 5 }
function Show(props: { token: { n: number } }) {
  return <output>{props.token.n}</output>
}
function Count(props: { items: number[] }) {
  return <output>{props.items.length}</output>
}
function Label(props: { text: string }) {
  return <b>{props.text}</b>
}
export function Host() {
  const obj = { n: 1 }
  const arr = [1, 2, 3]
  const text = 'x'
  return (
    <div>
      <Show token={obj} />
      <Count items={arr} />
      <Show token={MODULE_TOKEN} />
      <Label text={text} />
    </div>
  )
}
`,
  componentName: 'Host',
  expectedHtml: `
    <div bf-s="test">
      <output bf-s="test_s0" bf="s1"><!--bf:s0-->1<!--/--></output>
      <output bf-s="test_s1" bf="s1"><!--bf:s0-->3<!--/--></output>
      <output bf-s="test_s2" bf="s1"><!--bf:s0-->5<!--/--></output>
      <b bf-s="test_s3" bf="s1"><!--bf:s0-->x<!--/--></b>
    </div>
  `,
})
