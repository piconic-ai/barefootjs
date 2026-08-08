/**
 * SSR projection of controlled form-control `value` (#2464 / #2465 / #2466).
 *
 * `value` is not an attribute on `<textarea>` or `<select>` — emitting it
 * verbatim ships invalid HTML that browsers ignore, so no-JS and
 * pre-hydration users saw an empty textarea / the wrong option until the
 * hydrate-time `.value` effect snapped it. The shared-IR lowering marks
 * the attr `clientOnly` (SSR skips it; the property binding is unchanged)
 * and projects the value into element content (textarea) or per-option
 * `selected` comparisons (select — the shape `select-option-selected`
 * already proves across every adapter).
 *
 * `<option>`s rendered by a `.map()` loop get the same `selected`
 * distribution, compared against the option's own value EXPRESSION rather
 * than a literal (#2466). That makes `selected` an ordinary per-row
 * reactive attribute, so it rides the loop's existing `applyItem` /
 * `applyOuter` (or eager `mapArray` per-row effect) machinery — fixing the
 * bug where an INDEX-KEYED reorder left `selected` attached to whichever
 * physical `<option>` happened to have its `value` rewritten in place,
 * instead of following the controlled signal's value.
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
    // CSR registration template interpolates slotless children raw, so the
    // client-only variant must escape — a value containing `</textarea>`
    // must not break out of the element on CSR mount (Copilot review).
    expect(clientJs).toMatch(/<textarea[^`]*\$\{escapeText\(/)
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

  test('an authored selected wins; a `.map()` loop option gets a distributed selected binding (#2466)', () => {
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
    // The loop-rendered option compares against its own value EXPRESSION
    // (the loop param `o`), not a literal — this is the #2466 half.
    expect(template).toContain('((v()) === (o))')
  }, 20000)

  test('index-keyed .map() loop option: selected rides applyItem AND applyOuter (#2466)', () => {
    const { clientJs } = compiled(`
"use client"
import { createSignal } from '@barefootjs/client'
export function ReorderSelect() {
  const [opts, setOpts] = createSignal([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
  const [val, setVal] = createSignal('b')
  return (
    <div>
      <select value={val()} onChange={(e) => setVal(e.target.value)}>
        {opts().map((o, i) => <option key={i} value={o.id}>{o.label}</option>)}
      </select>
      <button onClick={() => setOpts([...opts()].reverse())}>Reverse</button>
    </div>
  )
}
`)
    // `key={i}` is index-keyed: nothing MOVES on reorder, so `value`/text are
    // rewritten in place by applyItem — `selected` must be recomputed there
    // too (item changed under a stationary row), not just at row creation.
    expect(clientJs).toContain('mapArrayLazy(')
    expect(clientJs).toContain('applyItem:')
    expect(clientJs).toContain('applyOuter:')
    // Every apply body (createRow, applyItem, applyOuter) recomputes
    // `selected` from the item AND the outer controlled signal…
    const computed = clientJs.match(/const __x = \(val\(\)\) === \(o\(\)\.id\)/g) ?? []
    expect(computed.length).toBe(3)
    // …and writes it as a DOM PROPERTY (not just an HTML attribute
    // presence, which would not affect a live, already-rendered <option>).
    const writes = clientJs.match(/\.selected = !!\(__x\)/g) ?? []
    expect(writes.length).toBe(3)
  }, 20000)

  test('textarea with explicit children is left untouched', () => {
    const { template } = compiled(`
export function Fixed() {
  return <textarea value={undefined}>seed</textarea>
}
`)
    expect(template).toContain('>seed</textarea>')
  })
})
