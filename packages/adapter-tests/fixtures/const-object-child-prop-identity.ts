import { createFixture } from '../src/types'

/**
 * A const whose initializer allocates (an object or array literal, a
 * module-scope object) and reads nothing reactive, passed as a child prop
 * directly and through a forwarding component. The client used to splice the
 * initializer into the prop getter, so every read built a new object
 * (#3868); it now reads the binding. This fixture pins what the server
 * renders for those positions, beside a primitive const and a const that
 * reads a signal, which still expand. The identity itself
 * (`props.token === props.token`, which the template adapters refuse for a
 * typed object, see `array-self-equality`) and the `new`, arrow and loop-row
 * shapes are driven in a real browser by the
 * `const-object-prop-identity-hydrate` fixture. The template adapters render
 * the const's value as absent (`const-object-child-prop-server-value`).
 */
export const fixture = createFixture({
  id: 'const-object-child-prop-identity',
  description: 'A non-reactive allocating const passed as a child prop renders its value in the child',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const MODULE_TOKEN = { n: 5 }
function Show(props: { token: { n: number } }) {
  return <output>{props.token.n}</output>
}
function Count(props: { items: number[] }) {
  return <output>{props.items.length}</output>
}
function Forward(props: { token: { n: number } }) {
  return <Show token={props.token} />
}
function Label(props: { text: string; live: { n: number } }) {
  return <b>{props.text}:{props.live.n}</b>
}
export function Host() {
  const [count] = createSignal(2)
  const obj = { n: 1 }
  const arr = [1, 2, 3]
  const text = 'x'
  const live = { n: count() }
  return (
    <div>
      <Show token={obj} />
      <Count items={arr} />
      <Show token={MODULE_TOKEN} />
      <Forward token={obj} />
      <Label text={text} live={live} />
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
      <output bf-s="test_s3_s0" bf="s1"><!--bf:s0-->1<!--/--></output>
      <b bf-s="test_s4" bf="s2"><!--bf:s0-->x<!--/-->:<!--bf:s1-->2<!--/--></b>
    </div>
  `,
})
