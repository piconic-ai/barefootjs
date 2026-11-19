import { createFixture } from '../src/types'

/**
 * A later open attribute spread overrides an earlier literal attribute of the
 * same key, as JS (and so Hono) applies attributes and spreads in order: the
 * key renders once, with the spread's value. A literal the bag does not carry
 * stays. A template adapter that printed the literal and then the bag
 * rendered the key twice, and a browser keeps the first.
 *
 * The bag is `{...rest}` (an open rest) on the main element, which also covers
 * a key that is not an identifier (`data-x`), a bare boolean attribute the bag
 * turns off (`hidden: false`) and an empty string (`dir`). The children spread
 * a signal getter (whose bag lacks a bare `hidden`, so it stays), the props
 * object, and a rest whose destructure took the attribute's key (`lang`),
 * which the bag cannot carry. The rows of a loop spread a bag of their own.
 */
export const fixture = createFixture({
  id: 'literal-attr-before-spread',
  description: 'a later open attribute spread overrides an earlier literal attribute of the same key',
  source: `
'use client'
import { Getter } from './getter'
import { PropsObject } from './props-object'
import { Taken } from './taken'
type P = { title?: string; encoding?: string; rows?: { id: number; attrs: Record<string, string> }[]; [key: string]: unknown }
export function LiteralAttrBeforeSpread({ rows = [], ...rest }: P) {
  return (
    <div>
      <p id="a" title="lit" lang="en" data-x="lit" hidden dir="ltr" {...rest}>1</p>
      <math><annotation-xml encoding="application/x-tex" {...rest}>x</annotation-xml></math>
      <Getter />
      <PropsObject title="from-props" />
      <Taken label="L" lang="fr" />
      <ul>{rows.map(r => <li key={r.id} title="lit" lang="en" {...r.attrs}>{r.id}</li>)}</ul>
    </div>
  )
}
`,
  components: {
    './getter.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function Getter() {
  const [bag] = createSignal<Record<string, string>>({ title: 'from-getter' })
  return <p title="lit" lang="en" hidden {...bag()}>2</p>
}
`,
    './props-object.tsx': `
export function PropsObject(props: { title?: string; lang?: string }) {
  return <p title="lit" lang="en" {...props}>3</p>
}
`,
    './taken.tsx': `
export function Taken({ label, lang, ...rest }: { label?: string; [key: string]: unknown }) {
  return <p title="lit" lang="en" {...rest}>{label}{lang}</p>
}
`,
  },
  props: {
    title: 'from-spread',
    encoding: 'text/html',
    'data-x': 'sx',
    hidden: false,
    dir: '',
    rows: [{ id: 1, attrs: { title: 'row-a' } }, { id: 2, attrs: {} }],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s0" data-x="sx" dir="" encoding="text/html" id="a" lang="en" title="from-spread">1</p>
      <math><annotation-xml bf="s1" data-x="sx" dir="" encoding="text/html" title="from-spread">x</annotation-xml></math>
      <p bf-s="test_s2" bf="s0" hidden lang="en" title="from-getter">2</p>
      <p bf-s="test_s3" bf="s0" lang="en" title="from-props">3</p>
      <p bf-s="test_s4" bf="s2" lang="en" title="lit"><!--bf:s0-->L<!--/--><!--bf:s1-->fr<!--/--></p>
      <ul bf="s7">
        <li bf="s6" data-key="1" lang="en" title="row-a"><!--bf:s5-->1<!--/--></li>
        <li bf="s6" data-key="2" lang="en" title="lit"><!--bf:s5-->2<!--/--></li>
      </ul>
    </div>
  `,
})
