import { describe, test } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function dump(label: string, src: string) {
  const r = compileJSX(src, 'Repro.tsx', { adapter: new HonoAdapter() })
  console.log(`\n=========== ${label} ===========`)
  if (r.errors.length) console.log('ERRORS: ' + r.errors.map(e => `${(e as any).code}:${(e as any).message}`).join(' | '))
  const cj = r.files.find(f => f.type === 'clientJs')
  const mt = r.files.find(f => f.type === 'markedTemplate')
  console.log('--- template head ---')
  console.log((mt?.content ?? '').split('export function')[0])
  console.log('--- clientJs (init only) ---')
  const c = cj?.content ?? ''
  console.log(c.split("hydrate(")[0])
}

const COMP = `export function W() {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{n()}</div>
}
export default W
`

describe('m2', () => {
  test('1 module if-block nested const', () => dump('1 nested if-block', `'use client'
import { createSignal } from '@barefootjs/client'
if (typeof window !== 'undefined') { const flag = 1; console.log(flag) }
${COMP}`))

  test('2 module arrow containing createSignal', () => dump('2 arrow w/ createSignal', `'use client'
import { createSignal } from '@barefootjs/client'
const mk = () => { const [a, setA] = createSignal(0); return a }
${COMP}`))

  test('3 helper AFTER component', () => dump('3 helper after component', `'use client'
import { createSignal } from '@barefootjs/client'
export function W() {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{n() + h(2)}</div>
}
const h = (x: number) => { const y = x * 2; return y }
export default W
`))

  test('4 nested function decl inside module arrow', () => dump('4 nested fn decl in arrow', `'use client'
import { createSignal } from '@barefootjs/client'
const outer = (v: number) => { function inner(q: number) { return q + v }; return inner(v) }
export function W() {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{n() + outer(3)}</div>
}
export default W
`))

  test('5 module object literal with async arrow', () => dump('5 obj literal async arrow', `'use client'
import { createSignal, onMount } from '@barefootjs/client'
const api = { load: async () => { const r = await fetch('/x'); return r.json() } }
export function W() {
  const [n, setN] = createSignal(0)
  onMount(() => { void api.load().then(() => setN(1)) })
  return <div>{n()}</div>
}
export default W
`))

  test('6 module arrow expr body referencing outer const', () => dump('6 arrow expr body', `'use client'
import { createSignal } from '@barefootjs/client'
const BASE = 10
const scale = (x: number) => x * BASE
export function W() {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{scale(n())}</div>
}
export default W
`))
})
