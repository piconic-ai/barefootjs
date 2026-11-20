import { createFixture } from '../src/types'

/**
 * JSX children that read the caller's data, passed to a component that
 * seeds a signal from `props.children ?? 'missing'`. The signal holds the
 * children the call passes, not the fallback (#3961). The child renders a
 * test of the signal rather than the signal itself, so the fixture is about
 * which value the signal holds; printing markup children read into state
 * is limitation `children-element-read-into-state`. Covered for text around an expression, a lone
 * string and number expression, two expressions, children the caller
 * forwards from its own `children`, and a call in a loop row: nested in
 * the row's element, and as the row itself, with static children too.
 */
export const fixture = createFixture({
  id: 'children-dynamic-read-into-state',
  description: 'Dynamic JSX children a component seeds a signal from reach that signal',
  source: `
'use client'
import { Note } from './note'
function Relay(props: { children?: unknown }) {
  return <p><Note tone="warm">{props.children}!</Note></p>
}
export function Host(props: { label: string; count: number; items: string[] }) {
  return (
    <div>
      <Note>{props.label}!</Note>
      <Note>{props.label}</Note>
      <Note>{props.count}</Note>
      <Note>{props.label} and {props.count}</Note>
      <Relay>{props.label}</Relay>
      <ul>{props.items.map((x) => <li key={x}><Note>{x}</Note></li>)}</ul>
      <section>{props.items.map((x) => <Note key={x}>{x}</Note>)}</section>
      <aside>{props.items.map((x) => <Note key={x}>own</Note>)}</aside>
    </div>
  )
}
`,
  components: {
    './note.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Note(props: { children?: unknown; tone?: string }) {
  const [value] = createSignal(props.children ?? 'missing')
  return <b data-tone={props.tone}>{value() === 'missing' ? 'fallback' : 'children'}</b>
}
`,
  },
  props: { label: 'hi', count: 3, items: ['a', 'b'] },
  expectedHtml: `
    <div bf-s="test">
      <b bf-s="test_s1" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s3" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s5" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <b bf-s="test_s8" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      <p bf-s="test_s10"><b bf-s="test_s10_s0" bf="s1" data-tone="warm"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></p>
      <ul bf="s13">
        <li data-key="a"><b bf-s="test_s12" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
        <li data-key="b"><b bf-s="test_s12" bf="s1"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b></li>
      </ul>
      <section bf="s16">
        <b bf-s="Note_*" bf="s1" data-key="a"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
        <b bf-s="Note_*" bf="s1" data-key="b"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      </section>
      <aside bf="s18">
        <b bf-s="Note_*" bf="s1" data-key="a"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
        <b bf-s="Note_*" bf="s1" data-key="b"><!--bf-cond-start:s0-->children<!--bf-cond-end:s0--></b>
      </aside>
    </div>
  `,
})
