import { createFixture } from '../src/types'

/**
 * Forms of `children-forwarded-into-child-prop-seed`: a component forwards
 * a value it receives as JSX children (or as a JSX-valued prop) into a
 * nested component's prop, from which that component seeds a signal or a
 * memo. The nested state holds the forwarded value, not the fallback.
 * Covered: through a body const, from a destructured param, with a `??`
 * fallback at the forwarding site, a memo, a call nested in a loop row,
 * the nested component in the forwarding component's own loop row, a value
 * forwarded on through a second component (from sibling files, each
 * listed before the one it imports), and a JSX-valued
 * named prop.
 */
export const fixture = createFixture({
  id: 'children-forwarded-into-child-prop-seed-forms',
  description: 'Children a component forwards into a nested child\'s non-children prop reach that child\'s state, in every form',
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Relay } from './relay'
function Kid(props: { seed?: unknown }) {
  const [v] = createSignal(props.seed ?? 'none')
  return <b>{v() === 'none' ? 'fallback' : 'children'}</b>
}
function MemoKid(props: { seed?: unknown }) {
  const v = createMemo(() => props.seed ?? 'none')
  return <i>{v() === 'none' ? 'fallback' : 'children'}</i>
}
function ViaConst(props: { children?: unknown }) {
  const c = props.children
  return <Kid seed={c} />
}
function ViaParam({ children }: { children?: unknown }) {
  return <Kid seed={children} />
}
function ViaFallback(props: { children?: unknown }) {
  return <Kid seed={props.children ?? 'none'} />
}
function ViaMemo(props: { children?: unknown }) {
  return <MemoKid seed={props.children} />
}
function ViaRows(props: { children?: unknown; items: string[] }) {
  return <ul>{props.items.map((x) => <li key={x}><Kid seed={props.children} /></li>)}</ul>
}
function ViaHeader(props: { header?: unknown }) {
  return <Kid seed={props.header} />
}
export function Host(props: { label: string; items: string[] }) {
  return (
    <div>
      <ViaConst>{props.label}</ViaConst>
      <ViaParam>{props.label}</ViaParam>
      <ViaFallback>{props.label}</ViaFallback>
      <ViaMemo>{props.label}</ViaMemo>
      <ol>{props.items.map((x) => <li key={x}><ViaParam>{x}</ViaParam></li>)}</ol>
      <ViaRows items={props.items}>{props.label}</ViaRows>
      <Relay>{props.label}</Relay>
      <ViaHeader header={<em>{props.label}</em>} />
    </div>
  )
}
`,
  components: {
    './relay.tsx': `
'use client'
import { Mid } from './mid'
export function Relay(props: { children?: unknown }) {
  return <p><Mid seed={props.children} /></p>
}
`,
    './mid.tsx': `
'use client'
import { Leaf } from './leaf'
export function Mid(props: { seed?: unknown }) {
  return <Leaf seed={props.seed} />
}
`,
    './leaf.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Leaf(props: { seed?: unknown }) {
  const [v] = createSignal(props.seed ?? 'none')
  return <s>{v() === 'none' ? 'fallback' : 'children'}</s>
}
`,
  },
  props: { label: 'hi', items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s1_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s3_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s5_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <i bf-s="test_s7_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></i>
      <ol bf="s10">
        <li data-key="a"><b bf-s="test_s9_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s9_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ol>
      <ul bf-s="test_s12" bf="s1">
        <li data-key="a"><b bf-s="test_s12_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s12_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ul>
      <p bf-s="test_s14"><s bf-s="test_s14_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></s></p>
      <b bf-s="test_s17_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
    </div>
  `,
})
