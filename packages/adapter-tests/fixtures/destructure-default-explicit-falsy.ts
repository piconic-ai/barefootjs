import { createFixture } from '../src/types'

/**
 * Destructured `string` / `number` / `boolean` props whose defaults are not
 * their type's empty value (`tag = 'z'`, `n = 2`, `on = true`), given that
 * empty value explicitly (`''`, `0`, `false`). The default applies to an
 * absent prop only, so the caller's value wins: in text, in an attribute,
 * under arithmetic, as a signal seed read through a memo, as a condition,
 * and forwarded into a child whose prop is a plain `string`. An engine that
 * reads an explicit empty value as absent renders the defaults instead.
 */
export const fixture = createFixture({
  id: 'destructure-default-explicit-falsy',
  description: "Explicit '' / 0 / false for props with non-empty destructure defaults keep the caller's value",
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Label } from './label'
export function DestructureDefaultExplicitFalsy({ tag = 'z', n = 2, on = true }: { tag?: string; n?: number; on?: boolean }) {
  const [count, setCount] = createSignal(n)
  const doubled = createMemo(() => count() * 2)
  return (
    <div data-tag={tag} data-n={n}>
      <span>{tag}</span>
      <span>{n + 1}</span>
      <span>{doubled()}</span>
      {on ? <b>on</b> : <i>off</i>}
      <Label value={tag} />
      <button onClick={() => setCount(count() + 1)}>+</button>
    </div>
  )
}
`,
  components: {
    './label.tsx': `
export function Label({ value }: { value: string }) {
  return <em>{value}</em>
}
`,
  },
  props: { tag: '', n: 0, on: false },
  expectedHtml: `
    <div bf-s="test" bf="s9" data-n="0" data-tag="">
      <span bf="s1"><!--bf:s0--><!--/--></span>
      <span bf="s3"><!--bf:s2-->1<!--/--></span>
      <span bf="s5"><!--bf:s4-->0<!--/--></span>
      <i bf-c="s6">off</i>
      <em bf-s="test_s7" bf="s1"><!--bf:s0--><!--/--></em>
      <button bf="s8">+</button>
    </div>
  `,
  dataPoints: [
    { name: 'all-absent', props: {} },
    { name: 'all-set', props: { tag: 'q', n: 1.5, on: true } },
  ],
})
