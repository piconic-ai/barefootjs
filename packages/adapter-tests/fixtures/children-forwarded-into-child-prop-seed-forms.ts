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
 * listed before the one it imports), a JSX-valued named prop, a static
 * bracket read (`props['children']`), a const captured in the body and read
 * in a loop row whose parameter shadows the name the const reads, ten
 * forwarding components in a row, and through `{...props}`: a JSX-valued
 * prop the spread carries, children the spread carries, an explicit writer
 * the spread overrides only when passed (called without it), and an
 * explicit writer after the spread; a fallback a spread overrides only
 * when passed, reached by a call that falls back after and before one that
 * passes the overriding key, and by a spread that does not carry it.
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
function ViaBracket(props: { children?: unknown }) {
  return <Kid seed={props['children']} />
}
function ViaCaptured({ children, items }: { children?: unknown; items: string[] }) {
  const captured = children
  return <ul>{items.map((children) => <li key={children}><Kid seed={captured} /></li>)}</ul>
}
function KidC(props: { children?: unknown }) {
  const [v] = createSignal(props.children ?? 'none')
  return <u>{v() === 'none' ? 'fallback' : 'children'}</u>
}
function SpreadSeed(props: { seed?: unknown }) {
  return <Kid {...props} />
}
function SpreadChildren(props: { children?: unknown }) {
  return <KidC {...props} />
}
function SpreadFallback(props: { children?: unknown; seed?: unknown }) {
  return <Kid seed={props.children} {...props} />
}
function SpreadThenExplicit(props: { children?: unknown; seed?: unknown }) {
  return <Kid {...props} seed={props.children} />
}
function Hop1(props: { seed?: unknown }) {
  return <Hop2 seed={props.seed} />
}
function Hop2(props: { seed?: unknown }) {
  return <Hop3 seed={props.seed} />
}
function Hop3(props: { seed?: unknown }) {
  return <Hop4 seed={props.seed} />
}
function Hop4(props: { seed?: unknown }) {
  return <Hop5 seed={props.seed} />
}
function Hop5(props: { seed?: unknown }) {
  return <Hop6 seed={props.seed} />
}
function Hop6(props: { seed?: unknown }) {
  return <Hop7 seed={props.seed} />
}
function Hop7(props: { seed?: unknown }) {
  return <Hop8 seed={props.seed} />
}
function Hop8(props: { seed?: unknown }) {
  return <Hop9 seed={props.seed} />
}
function Hop9(props: { seed?: unknown }) {
  return <Hop10 seed={props.seed} />
}
function Hop10(props: { seed?: unknown }) {
  return <Kid seed={props.seed} />
}
function ViaHops(props: { children?: unknown }) {
  return <Hop1 seed={props.children} />
}
function Mid(props: { forwarded?: unknown; seed?: unknown }) {
  return <Kid seed={props.forwarded} {...props} />
}
function OverrideFirst(props: { children?: unknown }) {
  return <p><Mid forwarded={props.children} seed="override" /><Mid forwarded={props.children} /></p>
}
function OverrideSecond(props: { children?: unknown }) {
  return <p><Mid forwarded={props.children} /><Mid forwarded={props.children} seed="override" /></p>
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
      <ViaBracket>{props.label}</ViaBracket>
      <ViaCaptured items={props.items}>{props.label}</ViaCaptured>
      <SpreadSeed seed={<em>{props.label}</em>} />
      <SpreadChildren>{props.label}</SpreadChildren>
      <SpreadFallback>{props.label}</SpreadFallback>
      <SpreadThenExplicit seed="x">{props.label}</SpreadThenExplicit>
      <ViaHops>{props.label}</ViaHops>
      <OverrideFirst>{props.label}</OverrideFirst>
      <OverrideSecond>{props.label}</OverrideSecond>
      <Mid {...props} forwarded={<em>{props.label}</em>} />
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
      <p bf-s="test_s14"><b bf-s="test_s14_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></p>
      <b bf-s="test_s17_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s19_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <ul bf-s="test_s21" bf="s1">
        <li data-key="a"><b bf-s="test_s21_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s21_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ul>
      <b bf-s="test_s24_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <u bf-s="test_s26_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></u>
      <b bf-s="test_s28_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s30_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s32_s0_s0_s0_s0_s0_s0_s0_s0_s0_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <p bf-s="test_s34">
        <b bf-s="test_s34_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
        <b bf-s="test_s34_s1_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      </p>
      <p bf-s="test_s36">
        <b bf-s="test_s36_s0_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
        <b bf-s="test_s36_s1_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      </p>
      <b bf-s="test_s39_s0" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
    </div>
  `,
})
