import { createFixture } from '../src/types'

/**
 * A rest spread and an explicit prop with the same key on one child
 * component: the later attribute wins, as in JSX. `tone="override"`
 * after `{...rest}` overrides the forwarded `tone`; before it, the
 * forwarded `tone` wins. Covered on a child that declares `tone`, on a
 * child that collects it in its own rest bag, and in loop rows.
 */
export const fixture = createFixture({
  id: 'component-rest-spread-explicit-override',
  description: 'A rest spread plus an explicit same-key prop on a child component: the later one wins',
  source: `
import { Chip } from './chip'
import { Bag } from './bag'
export function RestSpreadOverride({ label, items, ...rest }: { label: string; items: string[]; tone?: string }) {
  return (
    <div>
      <Chip {...rest} tone="override" label={label} />
      <Chip tone="override" {...rest} label={label} />
      <Bag {...rest} tone="override" label={label} />
      <Bag tone="override" {...rest} label={label} />
      <ul>
        {items.map(it => (
          <li key={it}>
            <Chip {...rest} tone="override" label={it} />
            <Chip tone="override" {...rest} label={it} />
          </li>
        ))}
      </ul>
    </div>
  )
}
`,
  components: {
    './chip.tsx': `
export function Chip(props: { label: string; tone?: string }) {
  return <span className={props.tone}>{props.label}</span>
}
`,
    './bag.tsx': `
export function Bag({ label, ...attrs }: { label: string; tone?: string }) {
  return <b {...attrs}>{label}</b>
}
`,
  },
  props: { label: 'x', items: ['p', 'q'], tone: 'info' },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s1" class="override"><!--bf:s0-->x<!--/--></span>
      <span bf-s="test_s1" bf="s1" class="info"><!--bf:s0-->x<!--/--></span>
      <b bf-s="test_s2" bf="s1" tone="override"><!--bf:s0-->x<!--/--></b>
      <b bf-s="test_s3" bf="s1" tone="info"><!--bf:s0-->x<!--/--></b>
      <ul bf="s6">
        <li data-key="p">
          <span bf-s="test_s4" bf="s1" class="override"><!--bf:s0-->p<!--/--></span>
          <span bf-s="test_s5" bf="s1" class="info"><!--bf:s0-->p<!--/--></span>
        </li>
        <li data-key="q">
          <span bf-s="test_s4" bf="s1" class="override"><!--bf:s0-->q<!--/--></span>
          <span bf-s="test_s5" bf="s1" class="info"><!--bf:s0-->q<!--/--></span>
        </li>
      </ul>
    </div>
  `,
})
