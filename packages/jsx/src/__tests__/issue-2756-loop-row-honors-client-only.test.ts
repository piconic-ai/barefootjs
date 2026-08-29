/**
 * #2756 — a client-built row/branch must carry the SAME attributes a
 * hydration-reused (SSR-origin) row carries.
 *
 * `lowerFormControlValueSsr` already lowers a controlled `<textarea>` /
 * `<select>` `value` in the SHARED IR: the attr becomes `clientOnly` and
 * the value is re-expressed as element content / per-option `selected`,
 * so every SSR adapter omits the attribute. `irToHtmlTemplate` — the
 * builder for keyed-loop rows and conditional branches — ignored that
 * flag and baked `value="…"` back in, so a rebuilt row and a reused row
 * disagreed the moment a row-count change made both coexist in one list.
 *
 * Each assertion here is paired with the effect that OWNS the value, so
 * "the attribute is gone" can never be satisfied by dropping the binding.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function clientJs(source: string): string {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  return result.files.find(f => f.type === 'clientJs')!.content
}

/** The `__tpl.innerHTML = \`…\`` / `insert(... html: \`…\`)` builder strings. */
function builderTemplates(content: string): string[] {
  return [...content.matchAll(/innerHTML = `([^`]*)`/g)].map(m => m[1])
    .concat([...content.matchAll(/html: `([^`]*)`/g)].map(m => m[1]))
}

describe('#2756 — client-built rows honour clientOnly', () => {
  test('a keyed-loop row builder omits the controlled textarea `value` attribute and keeps the child text', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function LoopTextarea() {
        const [val, setVal] = createSignal(0)
        const [items] = createSignal([1, 2, 3])
        return (
          <ul>
            {items().filter(i => i > 0).map(i => (
              <li key={i}>
                <textarea value={val()} onInput={() => setVal(1)} />
              </li>
            ))}
          </ul>
        )
      }
    `)
    const rowTemplates = builderTemplates(content).filter(t => t.includes('<textarea'))
    expect(rowTemplates.length).toBeGreaterThan(0)
    for (const tpl of rowTemplates) {
      expect(tpl).not.toContain('value=')
      // The SSR projection of the same value — element content — must stay.
      expect(tpl).toMatch(/<textarea[^>]*>\$\{/)
    }
    // The effect that owns the value is still emitted, so the attribute is
    // absent because the effect applies it, not because nothing does.
    expect(content).toContain(`'value' in`)
  })

  test('a conditional-branch builder omits it too, and still binds the value effect', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function CondTextarea() {
        const [on, setOn] = createSignal(true)
        const [v, setV] = createSignal('x')
        return <div>{on() ? <textarea value={v()} onInput={() => setV('y')} /> : <p>off</p>}</div>
      }
    `)
    const branchTemplates = builderTemplates(content).filter(t => t.includes('<textarea'))
    expect(branchTemplates.length).toBeGreaterThan(0)
    for (const tpl of branchTemplates) expect(tpl).not.toContain('value=')
    expect(content).toContain('createDisposableEffect')
  })

  test('a loop row keeps per-option `selected` — the select value projection is not collateral', () => {
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function LoopSelect() {
        const [val, setVal] = createSignal('a')
        const [rows] = createSignal([1, 2])
        return (
          <ul>
            {rows().filter(r => r > 0).map(r => (
              <li key={r}>
                <select value={val()}>
                  <option value="a">A</option>
                  <option value="b">B</option>
                </select>
              </li>
            ))}
          </ul>
        )
      }
    `)
    const rowTemplates = builderTemplates(content).filter(t => t.includes('<select'))
    expect(rowTemplates.length).toBeGreaterThan(0)
    for (const tpl of rowTemplates) {
      // The `<select …>` opening tag only — `<option value="a">` is the
      // literal option value and must survive.
      const selectTag = tpl.slice(tpl.indexOf('<select'), tpl.indexOf('<option'))
      expect(selectTag).not.toMatch(/value=/)
      expect(tpl).toContain("'selected'")
    }
  })

  test('the composite-row placeholder builder omits it too', () => {
    // `irToPlaceholderTemplate` is the twin builder used when a row also
    // hosts a child component (components become `data-bf-ph` placeholders).
    // Same contract, separate function — it had the same gap.
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      function Badge({ label }: { label: string }) { return <em>{label}</em> }
      export function CompositeRows() {
        const [val, setVal] = createSignal('a')
        const [rows] = createSignal([{ id: 1, label: 'x' }])
        return (
          <ul>
            {rows().map(row => (
              <li key={row.id}>
                <Badge label={row.label} />
                <textarea value={val()} onInput={() => setVal('b')} />
              </li>
            ))}
          </ul>
        )
      }
    `)
    const rowTemplates = builderTemplates(content).filter(t => t.includes('data-bf-ph'))
    expect(rowTemplates.length).toBeGreaterThan(0)
    for (const tpl of rowTemplates) {
      expect(tpl).toContain('<textarea')
      expect(tpl).not.toMatch(/\bvalue=/)
    }
  })

  test('an ordinary reactive attribute on the same row IS still emitted by the builder', () => {
    // Reverse direction, on one row so both halves are read off the same
    // builder string: `clientOnly` is the ONLY thing now deferred. The
    // row's own `title` / `data-n` must keep their inline emission.
    const content = clientJs(`
      "use client";
      import { createSignal } from '@barefootjs/client'
      export function MixedRow() {
        const [val, setVal] = createSignal('a')
        const [rows] = createSignal([1, 2])
        return (
          <ul>
            {rows().filter(r => r > 0).map(r => (
              <li key={r} title={String(r)} data-n={r}>
                <textarea value={val()} onInput={() => setVal('b')} />
              </li>
            ))}
          </ul>
        )
      }
    `)
    const rowTemplates = builderTemplates(content).filter(t => t.includes('<textarea'))
    expect(rowTemplates.length).toBeGreaterThan(0)
    for (const tpl of rowTemplates) {
      expect(tpl).toMatch(/title=/)
      expect(tpl).toMatch(/data-n=/)
      expect(tpl).not.toMatch(/\bvalue=/)
    }
  })
})
