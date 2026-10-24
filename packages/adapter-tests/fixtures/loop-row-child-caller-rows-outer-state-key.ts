import { createFixture } from '../src/types'

/**
 * A component loop row over an array prop whose child prop is computed
 * from the row (`label={n.toUpperCase()}`), keyed by an expression that
 * reads outer state as well as the row (`key={props.prefix + n}`). Every
 * row carries the key's value as `data-key`.
 */
export const fixture = createFixture({
  id: 'loop-row-child-caller-rows-outer-state-key',
  description: 'A component loop row with a computed prop, keyed by an expression reading outer state, carries its value as data-key',
  source: `
'use client'

function Badge(props: { label: string }) {
  return <em className="badge">{props.label}</em>
}

export function LoopRowChildCallerRowsOuterStateKey(props: { prefix: string; names: string[] }) {
  return (
    <ul>
      {props.names.map(n => <Badge key={props.prefix + n} label={n.toUpperCase()} />)}
    </ul>
  )
}
`,
  props: {
    prefix: 'p-',
    names: ['a', 'b'],
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <em bf-s="Badge_*" bf="s1" class="badge" data-key="p-a"><!--bf:s0-->A<!--/--></em>
      <em bf-s="Badge_*" bf="s1" class="badge" data-key="p-b"><!--bf:s0-->B<!--/--></em>
    </ul>
  `,
  escapes: [{ kind: 'client-directive', fixture: 'loop-row-child-caller-rows-outer-state-key-client' }],
})
