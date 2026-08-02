/**
 * SSR projection of controlled form-control `value` (#2464 / #2465).
 *
 * `value` is not an attribute on `<textarea>` or `<select>` — emitting it
 * verbatim ships invalid HTML that browsers ignore, so no-JS and
 * pre-hydration users saw an empty textarea / the wrong option until the
 * hydrate-time `.value` effect snapped it. The shared-IR lowering marks
 * the attr `clientOnly` (SSR skips it; the property binding is unchanged)
 * and projects the value into element content (textarea) or per-option
 * `selected` comparisons (select — the shape `select-option-selected`
 * already proves across every adapter).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function compiled(source: string): { template: string; clientJs: string } {
  const result = compileJSX(source, 'form-value.tsx', { adapter: new HonoAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  return {
    template: result.files.find(f => f.type === 'markedTemplate')?.content ?? '',
    clientJs: result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n'),
  }
}

describe('controlled form-control value SSR lowering (#2464/#2465)', () => {
  test('textarea value lowers to element content, keeps the .value binding', () => {
    const { template, clientJs } = compiled(`
"use client"
import { createSignal } from '@barefootjs/client'
export function NoteBox() {
  const [note, setNote] = createSignal('hi')
  return <textarea value={note()} onInput={(e) => setNote(e.target.value)} />
}
`)
    expect(template).toContain('<textarea')
    expect(template).not.toContain('value={')
    expect(template).toContain('{note()}')
    expect(clientJs).toContain('.value = __val')
  })

  test('select value lowers to selected on statically-valued options', () => {
    const { template } = compiled(`
"use client"
import { createSignal } from '@barefootjs/client'
export function Pick() {
  const [v, setV] = createSignal('b')
  return (
    <select value={v()} onChange={(e) => setV(e.target.value)}>
      <option value="a">A</option>
      <optgroup label="rest">
        <option value="b">B</option>
      </optgroup>
    </select>
  )
}
`)
    expect(template).not.toMatch(/<select[^>]*value=/)
    expect(template).toContain(`((v()) === "a")`)
    expect(template).toContain(`((v()) === "b")`)
  })

  test('an authored selected wins; dynamic option loops are left to hydrate', () => {
    const { template } = compiled(`
"use client"
import { createSignal } from '@barefootjs/client'
export function Pick() {
  const [v, setV] = createSignal('b')
  const [opts] = createSignal(['a', 'b'])
  return (
    <div>
      <select value={v()}>
        <option value="a" selected={false}>A</option>
      </select>
      <select value={v()}>
        {opts().map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
`)
    // The authored selected={false} is untouched (exactly one selected on
    // that option), and the invalid select value attr is gone everywhere.
    expect(template).toContain('selected={(false) || undefined}')
    expect(template).not.toContain('(v()) === "a"')
    expect(template).not.toMatch(/<select[^>]*value=/)
  })

  test('textarea with explicit children is left untouched', () => {
    const { template } = compiled(`
export function Fixed() {
  return <textarea value={undefined}>seed</textarea>
}
`)
    expect(template).toContain('>seed</textarea>')
  })
})
