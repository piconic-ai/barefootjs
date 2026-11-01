import { createFixture } from '../src/types'

/**
 * Static const spreads and explicit attributes resolve last-write-wins, as
 * JSX does: across two spreads sharing a key (`{...a} {...b}`), with an
 * explicit attribute before, between or after them, and with a key repeated
 * inside one literal (`dir`). Each key is written once, with the value of
 * its last write, on elements and on a child component.
 */
export const fixture = createFixture({
  id: 'const-object-spread-last-wins',
  description: 'static const spreads and explicit attributes resolve last-write-wins',
  source: `
'use client'
import { Chip } from './chip'
const a = { title: 'first', lang: 'en' }
const b = { title: 'second', dir: 'ltr', 'dir': 'rtl' }
export function ConstObjectSpreadLastWins({ label }: { label: string }) {
  return (
    <div>
      <p id="x" title="explicit" {...a} {...b}>1</p>
      <p {...a} title="between" {...b}>2</p>
      <p {...a} {...b} title={label}>3</p>
      <p lang="fr" {...a}>4</p>
      <Chip {...a} label="mid" {...b} />
    </div>
  )
}
`,
  components: {
    './chip.tsx': `
export function Chip(props: { label?: string; title?: string; lang?: string; dir?: string }) {
  return <span title={props.title} lang={props.lang} dir={props.dir}>{props.label}</span>
}
`,
  },
  props: { label: 'L' },
  expectedHtml: `
    <div bf-s="test">
      <p dir="rtl" id="x" lang="en" title="second">1</p>
      <p dir="rtl" lang="en" title="second">2</p>
      <p bf="s0" dir="rtl" lang="en" title="L">3</p>
      <p lang="en" title="first">4</p>
      <span bf-s="test_s1" bf="s1" dir="rtl" lang="en" title="second"><!--bf:s0-->mid<!--/--></span>
    </div>
  `,
})
