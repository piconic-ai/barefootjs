import { createFixture } from '../src/types'

/**
 * Props a child does not declare, on a child that spreads its whole props
 * object onto its root (`<b {...props}>`): JS hands them over and the
 * spread renders them. Covers a quoted literal, a hyphenated name, a
 * boolean shorthand, a signal read, the parent's own params passed on
 * through `{...props}`, a conditional branch, a signal-loop row and a
 * static-loop row.
 */
export const fixture = createFixture({
  id: 'child-undeclared-prop-whole-props-spread',
  description: 'Undeclared props reach a child that spreads its whole props object',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Kid } from './Kid'
export function ChildUndeclaredPropWholePropsSpread(props: { label: string; tone?: string }) {
  const [on] = createSignal(true)
  const [rows] = createSignal([{ id: 'r1', t: 'x' }, { id: 'r2', t: 'y' }])
  return (
    <div>
      <Kid label="x" title="passed" data-x="1" hidden />
      <Kid {...props} />
      {on() ? <Kid label="c" title={on() ? 'on' : 'off'} /> : null}
      {rows().map(r => <Kid key={r.id} label={r.t} title={r.id} />)}
      {['p', 'q'].map(k => <Kid key={k} label={k} title={k} />)}
    </div>
  )
}
`,
  components: {
    './Kid': `
export function Kid(props: { label: string }) {
  return <b {...props}>{props.label}</b>
}
`,
  },
  props: { label: 'L', tone: 'warm' },
  expectedHtml: `
    <div bf-s="test" bf="s6">
      <b bf-s="test_s0" bf="s1" data-x="1" hidden label="x" title="passed"><!--bf:s0-->x<!--/--></b>
      <b bf-s="test_s1" bf="s1" label="L" tone="warm"><!--bf:s0-->L<!--/--></b>
      <!--bf-cond-start:s2-->
      <b bf-s="test_s3" bf="s1" label="c" title="on"><!--bf:s0-->c<!--/--></b>
      <!--bf-cond-end:s2-->
      <b bf-s="Kid_*" bf="s1" data-key="r1" label="x" title="r1"><!--bf:s0-->x<!--/--></b>
      <b bf-s="Kid_*" bf="s1" data-key="r2" label="y" title="r2"><!--bf:s0-->y<!--/--></b>
      <b bf-s="Kid_*" bf="s1" data-key="p" label="p" title="p"><!--bf:s0-->p<!--/--></b>
      <b bf-s="Kid_*" bf="s1" data-key="q" label="q" title="q"><!--bf:s0-->q<!--/--></b>
    </div>
  `,
})
