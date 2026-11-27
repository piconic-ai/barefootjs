import { createFixture } from '../src/types'

/**
 * `children ?? 'missing'` seeds read through each binding form: a
 * destructured parameter (plain and renamed) and a destructure of the props
 * object in the body (plain and renamed). Each is called without children
 * and with markup children; the first renders the fallback and the second
 * the markup, as
 * `children-markup-nullish-seed` does for `props.children` (#3987).
 */
export const fixture = createFixture({
  id: 'children-markup-nullish-seed-bindings',
  description: 'Markup children seeding a signal through ?? render as markup, whatever binding reads them',
  source: `
import { Param, ParamRenamed, Body, BodyRenamed } from './note'
export function Host() {
  return (
    <div>
      <Param /><Param><i>p</i></Param>
      <ParamRenamed /><ParamRenamed><i>r</i></ParamRenamed>
      <Body /><Body><i>b</i></Body>
      <BodyRenamed /><BodyRenamed><i>k</i></BodyRenamed>
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Param({ children }: { children?: unknown }) {
  const [v] = createSignal(children ?? 'missing')
  return <b>{v()}</b>
}
export function ParamRenamed({ children: kids }: { children?: unknown }) {
  const [v] = createSignal(kids ?? 'missing')
  return <s>{v()}</s>
}
export function Body(props: { children?: unknown }) {
  const { children } = props
  const [v] = createSignal(children ?? 'missing')
  return <u>{v()}</u>
}
export function BodyRenamed(props: { children?: unknown }) {
  const { children: kids } = props
  const [v] = createSignal(kids ?? 'missing')
  return <em>{v()}</em>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s0" bf="s1"><!--bf:s0-->missing<!--/--></b>
      <b bf-s="test_s1" bf="s1"><!--bf:s0--><i>p</i><!--/--></b>
      <s bf-s="test_s2" bf="s1"><!--bf:s0-->missing<!--/--></s>
      <s bf-s="test_s3" bf="s1"><!--bf:s0--><i>r</i><!--/--></s>
      <u bf-s="test_s4" bf="s1"><!--bf:s0-->missing<!--/--></u>
      <u bf-s="test_s5" bf="s1"><!--bf:s0--><i>b</i><!--/--></u>
      <em bf-s="test_s6" bf="s1"><!--bf:s0-->missing<!--/--></em>
      <em bf-s="test_s7" bf="s1"><!--bf:s0--><i>k</i><!--/--></em>
    </div>
  `,
})
