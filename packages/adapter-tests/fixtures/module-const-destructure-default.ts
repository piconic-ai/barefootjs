import { createFixture } from '../src/types'

/**
 * A destructure default that reads a module-scope const
 * (`{ label = DEFAULT_LABEL }`). The client reads such a prop as
 * `_p.label ?? DEFAULT_LABEL`, so the const has to be emitted into the
 * client module even when nothing else names it — in every position the
 * prop is read: attribute, text, ternary, `&&`, template literal,
 * concatenation, a child prop, a loop row, a signal initializer, and
 * through a chain (`alias = first`, `first = DEFAULT_LABEL`). `Badge`
 * reads the same const through `props.label ?? DEFAULT_LABEL` (the
 * `function C(props)` form).
 */
export const fixture = createFixture({
  id: 'module-const-destructure-default',
  description: 'A destructure default reading a module-scope const renders that const in every read position, and the client module declares it',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

const DEFAULT_LABEL = 'm'
const START = 2

function Badge(props: { label?: string }) {
  return <i title={props.label ?? DEFAULT_LABEL}>{props.label ?? DEFAULT_LABEL}</i>
}

export function ModuleConstDestructureDefault({ label = DEFAULT_LABEL, first = DEFAULT_LABEL, alias = first, start = START, on = false, items = ['a', 'b'] }: { label?: string; first?: string; alias?: string; start?: number; on?: boolean; items?: string[] }) {
  const [count, setCount] = createSignal(start)
  return (
    <div title={label}>
      <p>{label}</p>
      <p>{on ? label : 'off'}</p>
      <p>{on && label}</p>
      <p>{\`t-\${label}\`}</p>
      <p>{'c-' + label}</p>
      <p>{alias}</p>
      <Badge label={label} />
      <Badge />
      <ul>{items.map(item => <li key={item}>{item}-{label}</li>)}</ul>
      <button onClick={() => setCount(count() + 1)}>{count()}</button>
    </div>
  )
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s22" title="m">
      <p bf="s1"><!--bf:s0-->m<!--/--></p>
      <p bf="s4"><!--bf-cond-start:s2-->off<!--bf-cond-end:s2--></p>
      <p bf="s7"><!--bf-cond-start:s5--><!--bf-cond-end:s5--></p>
      <p bf="s9"><!--bf:s8-->t-m<!--/--></p>
      <p bf="s11"><!--bf:s10-->c-m<!--/--></p>
      <p bf="s13"><!--bf:s12-->m<!--/--></p>
      <i bf-s="test_s14" bf="s1" title="m"><!--bf:s0-->m<!--/--></i>
      <i bf-s="test_s15" bf="s1" title="m"><!--bf:s0-->m<!--/--></i>
      <ul bf="s19">
        <li bf="s18" data-key="a"><!--bf:s16-->a<!--/-->-<!--bf:s17-->m<!--/--></li>
        <li bf="s18" data-key="b"><!--bf:s16-->b<!--/-->-<!--bf:s17-->m<!--/--></li>
      </ul>
      <button bf="s21"><!--bf:s20-->2<!--/--></button>
    </div>
  `,
  dataPoints: [
    { name: 'present', props: { label: 'x', first: 'y', start: 5, on: true, items: ['c'] } },
  ],
})
