import { describe, test } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function dump(label: string, src: string) {
  const r = compileJSX(src, 'Repro.tsx', { adapter: new HonoAdapter() })
  console.log(`\n=========== ${label} ===========`)
  if (r.errors.length) console.log('ERRORS: ' + r.errors.map(e => `${(e as any).code}`).join(','))
  const cj = r.files.find(f => f.type === 'clientJs')
  const mt = r.files.find(f => f.type === 'markedTemplate')
  console.log('--TPL HEAD--\n' + (mt?.content ?? '').split('export function')[0])
  console.log('--CJS--\n' + (cj?.content ?? ''))
}

describe('m3', () => {
  test('7 FUNCTION decl after component', () => dump('7 fn decl after component', `'use client'
import { createSignal } from '@barefootjs/client'
export function W() {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{n() + h(2)}</div>
}
function h(x: number) { const y = x * 2; return y }
export default W
`))

  test('8 arrow helper on a PROP (template lambda)', () => dump('8 arrow helper on prop', `'use client'
import { createSignal } from '@barefootjs/client'
const fmt = (s: string) => s.toUpperCase()
export function W({ label }: { label: string }) {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{fmt(label)}{n()}</div>
}
export default W
`))

  test('9 FN helper on a PROP (control)', () => dump('9 fn helper on prop', `'use client'
import { createSignal } from '@barefootjs/client'
function fmt(s: string) { return s.toUpperCase() }
export function W({ label }: { label: string }) {
  const [n, setN] = createSignal(0)
  return <div onClick={() => setN(1)}>{fmt(label)}{n()}</div>
}
export default W
`))
})
