import { createFixture } from '../src/types'

/**
 * A module const initialized by an immediately invoked zero-param arrow
 * (#4022) read where a module const literal is read: as a loop source, as a
 * child prop, and as a signal seed.
 */
export const fixture = createFixture({
  id: 'module-const-iife-loop-child-seed',
  description: 'a module const initialized by an immediately invoked arrow works as a loop source, a child prop and a signal seed',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Kid } from './kid'
const ITEMS = (() => ['x', 'y'])()
const CFG = (() => ({ label: 'L' }))()
const N = (() => 2)()
export function ModuleConstIifeLoopChildSeed() {
  const [n] = createSignal(N)
  return (
    <div>
      <ul>{ITEMS.map(item => <li key={item}>{item}</li>)}</ul>
      <Kid label={CFG.label} />
      <span>{n()}</span>
    </div>
  )
}
`,
  components: {
    './kid.tsx': `
export function Kid({ label }: { label: string }) {
  return <i>{label}</i>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="x"><!--bf:s0-->x<!--/--></li>
        <li data-key="y"><!--bf:s0-->y<!--/--></li>
      </ul>
      <i bf-s="test_s2" bf="s1"><!--bf:s0-->L<!--/--></i>
      <span bf="s4"><!--bf:s3-->2<!--/--></span>
    </div>
  `,
})
