import { createFixture } from '../src/types'

/**
 * A spread of a const holding a static object literal passes the object's
 * keys, as JS does: onto a child component (`<Chip {...base} />`) and onto
 * an element (`<div {...attrs}>`). Module-scope and component-scope consts;
 * an attribute written after the spread overrides its key.
 */
export const fixture = createFixture({
  id: 'const-object-spread',
  description: 'a spread of a module or local const object passes the object keys',
  source: `
'use client'
import { Chip } from './chip'
const base = { label: 'x', tone: 'info', count: 2 }
const attrs = { id: 'w1', title: 'T' }
export function ConstObjectSpread({ label }: { label: string }) {
  const local = { tone: 'warn', label: 'loc' }
  return (
    <div {...attrs}>
      <Chip {...base} />
      <Chip {...local} />
      <Chip {...base} label={label} />
    </div>
  )
}
`,
  components: {
    './chip.tsx': `
export function Chip(props: { label: string; tone?: string; count?: number }) {
  return <span class={props.tone} data-count={props.count}>{props.label}</span>
}
`,
  },
  props: { label: 'P' },
  expectedHtml: `
    <div bf-s="test" id="w1" title="T">
      <span bf-s="test_s0" bf="s1" class="info" data-count="2"><!--bf:s0-->x<!--/--></span>
      <span bf-s="test_s1" bf="s1" class="warn"><!--bf:s0-->loc<!--/--></span>
      <span bf-s="test_s2" bf="s1" class="info" data-count="2"><!--bf:s0-->P<!--/--></span>
    </div>
  `,
})
