import { createFixture } from '../src/types'

/**
 * A fallback read of the children prop whose fallback reads another prop
 * or a signal (`props.children ?? props.alt`, `|| props.alt`,
 * `?? text()`), read directly and through a body const, in a client
 * component, where the read takes a reactive text slot. Present children
 * render as markup inside the slot; absent children render the fallback as
 * escaped text (limitation `children-fallback-reactive-slot`).
 */
export const fixture = createFixture({
  id: 'children-fallback-reactive-read',
  description: 'A fallback read of the children prop with a reactive fallback keeps present children markup',
  source: `
import { Alt, Live } from './note'
export function Host() {
  return (
    <div>
      <Alt alt="<s>alt</s>"><i>a</i></Alt>
      <Alt alt="<s>alt</s>" />
      <Live><i>b</i></Live>
      <Live />
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Alt(props: { children?: unknown; alt?: string }) {
  const label = props.children ?? props.alt
  return <p>{label}|{props.children || props.alt}</p>
}
export function Live(props: { children?: unknown }) {
  const [text] = createSignal('<s>live</s>')
  const label = props.children ?? text()
  return <p>{label}|{props.children ?? text()}</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf-s="test_s0" bf="s2">
        <!--bf:s0-->
        <i>a</i>
        <!--/-->|<!--bf:s1-->
        <i>a</i>
        <!--/-->
      </p>
      <p bf-s="test_s1" bf="s2"><!--bf:s0-->&lt;s&gt;alt&lt;/s&gt;<!--/-->|<!--bf:s1-->&lt;s&gt;alt&lt;/s&gt;<!--/--></p>
      <p bf-s="test_s2" bf="s2">
        <!--bf:s0-->
        <i>b</i>
        <!--/-->|<!--bf:s1-->
        <i>b</i>
        <!--/-->
      </p>
      <p bf-s="test_s3" bf="s2"><!--bf:s0-->&lt;s&gt;live&lt;/s&gt;<!--/-->|<!--bf:s1-->&lt;s&gt;live&lt;/s&gt;<!--/--></p>
    </div>
  `,
})
