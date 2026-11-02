import { createFixture } from '../src/types'

/**
 * An explicit attribute written before a closed-type `{...rest}` spread,
 * on an element and on a child component. JSX applies them in order, and
 * the spread only overrides with the keys the rest object actually has: a
 * key the caller omitted leaves the explicit value in place (`tone`), and
 * a key the caller passed overrides it (`title`). Covered with a literal
 * and an expression value, and in loop rows.
 */
export const fixture = createFixture({
  id: 'rest-spread-explicit-before-closed-rest',
  description: 'An explicit attribute before a closed rest spread survives when the caller omitted that key',
  source: `
import { Chip } from './chip'
export function RestExplicitBefore({ label, items, ...rest }: { label: string; items: string[]; tone?: string; title?: string }) {
  return (
    <div>
      <Chip tone="override" {...rest} label={label} />
      <p tone="fixed" title="fixed" {...rest}>{label}</p>
      <i tone={label} {...rest}>{label}</i>
      <ul>
        {items.map(it => (
          <li key={it}>
            <Chip tone="override" {...rest} label={it} />
            <b title={it} tone="row" {...rest}>{it}</b>
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
  },
  props: { label: 'x', items: ['p', 'q'], title: 'given' },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s1" class="override"><!--bf:s0-->x<!--/--></span>
      <p bf="s2" title="given" tone="fixed"><!--bf:s1-->x<!--/--></p>
      <i bf="s4" title="given" tone="x"><!--bf:s3-->x<!--/--></i>
      <ul bf="s8">
        <li data-key="p">
          <span bf-s="test_s5" bf="s1" class="override"><!--bf:s0-->p<!--/--></span>
          <b bf="s7" title="given" tone="row"><!--bf:s6-->p<!--/--></b>
        </li>
        <li data-key="q">
          <span bf-s="test_s5" bf="s1" class="override"><!--bf:s0-->q<!--/--></span>
          <b bf="s7" title="given" tone="row"><!--bf:s6-->q<!--/--></b>
        </li>
      </ul>
    </div>
  `,
})
