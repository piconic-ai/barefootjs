/**
 * BarefootJS Compiler - Reactive attributes inside .map() callbacks
 *
 * Verifies that signal-dependent attributes (e.g., className) in .map()
 * children generate createEffect for DOM updates.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('reactive attributes inside .map() callbacks', () => {
  test('static array: reactive className generates createEffect', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/client'

      export function TagList() {
        const tags = ['all', 'ui', 'form']
        const [activeTag, setActiveTag] = createSignal('all')
        return (
          <div>
            {tags.map((tag, i) => (
              <button key={i} className={tag === activeTag() ? 'active' : 'inactive'}>{tag}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'TagList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should generate createEffect for reactive className
    expect(clientJs!.content).toContain('createEffect')
    expect(clientJs!.content).toContain("setAttribute('class'")
    expect(clientJs!.content).toContain('activeTag()')
  })

  test('static array: reactive disabled attribute generates createEffect', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/client'

      export function ItemList() {
        const items = ['a', 'b', 'c']
        const [disabled, setDisabled] = createSignal(false)
        return (
          <div>
            {items.map((item, i) => (
              <button key={i} disabled={disabled()}>{item}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'ItemList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createEffect')
    expect(clientJs!.content).toContain('disabled')
  })

  test('dynamic array: reactive className handled by reconcileElements re-render (no extra effect needed)', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/client'

      export function DynamicTagList() {
        const [tags, setTags] = createSignal(['all', 'ui', 'form'])
        const [activeTag, setActiveTag] = createSignal('all')
        return (
          <div>
            {tags().map((tag, i) => (
              <button key={i} className={tag === activeTag() ? 'active' : 'inactive'}>{tag}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'DynamicTagList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Dynamic arrays use reconcileElements which re-creates items on signal change
    expect(clientJs!.content).toContain('mapArray')
  })

  test('static array: multiple reactive attrs on same element groups correctly', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/client'

      export function TagList() {
        const tags = ['all', 'ui', 'form']
        const [activeTag, setActiveTag] = createSignal('all')
        const [isDisabled, setIsDisabled] = createSignal(false)
        return (
          <div>
            {tags.map((tag, i) => (
              <button
                key={i}
                className={tag === activeTag() ? 'active' : 'inactive'}
                disabled={isDisabled()}
              >{tag}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'TagList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain("setAttribute('class'")
    expect(clientJs!.content).toContain('disabled')

    // Verify no duplicate const declarations for same slot
    const constDecls = clientJs!.content.match(/const __t_\w+/g) ?? []
    const uniqueDecls = new Set(constDecls)
    expect(constDecls.length).toBe(uniqueDecls.size)
  })

  test('map param name matching CSS class substring: static part not transformed (#838)', () => {
    // When loop param is "row" and a template literal class contains "pivot-row",
    // the static string "pivot-row" must not become "pivot-row()" in the output.
    // Only actual signal references inside interpolations should be transformed.
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/client'

      type Row = { id: string; isActive: boolean }

      export function PivotTable() {
        const [rows, setRows] = createSignal<Row[]>([])
        return (
          <table>
            {rows().map((row) => (
              <tr key={row.id} class={\`pivot-row \${row.isActive ? "active" : ""}\`}>
                <td>{row.id}</td>
              </tr>
            ))}
          </table>
        )
      }
    `
    const result = compileJSX(source, 'PivotTable.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Static string "pivot-row" must NOT be transformed to "pivot-row()"
    expect(content).not.toContain('pivot-row()')

    // The interpolated expression "row.isActive" must be transformed to "row().isActive"
    expect(content).toContain('row().isActive')

    // The static text "pivot-row" must still appear in the output
    expect(content).toContain('pivot-row')
  })

  test('static array: non-reactive className does NOT generate createEffect', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/client'

      export function SimpleList() {
        const items = ['a', 'b', 'c']
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <span>{count()}</span>
            {items.map((item, i) => (
              <button key={i} className="static-class">{item}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'SimpleList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should NOT contain reactive attr effect for static className
    // (createEffect may still exist for the count() text node)
    expect(clientJs!.content).not.toContain('__t_')
    expect(clientJs!.content).not.toContain('.className =')
  })

  test('static array: reactive attrs and texts share a single forEach pass', () => {
    // Regression for the "double forEach" bug: the legacy emitter wrote
    // two separate forEach blocks over the same static array — one for
    // reactive attrs, one for reactive texts. That meant scanning the
    // array twice and looking up `__iterEl = container.children[idx]`
    // twice per item. The merged version emits a single forEach with
    // both effects inside its body.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      const items = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
      export function L() {
        const [active, setActive] = createSignal(1)
        return (
          <ul>
            {items.map(item => (
              <li key={item.id} class={active() === item.id ? 'on' : ''}>{item.name}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'L.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const js = result.files.find(f => f.type === 'clientJs')!.content
    // Both effects must still be present.
    expect(js).toContain("setAttribute('class'")
    expect(js).toMatch(/textContent\s*=\s*String\(item\.name\)/)
    // But there must be exactly one `items.forEach` call (not two).
    const forEachMatches = js.match(/items\.forEach\(/g) ?? []
    expect(forEachMatches.length).toBe(1)
  })

  test('per-item attr reading an outer signal via helper+index gets a createEffect (#1673)', () => {
    // A per-item attribute whose value reads the source array signal through
    // a helper indexed by position (`widthAt(i)` → `items()[i].w`) used to
    // emit NO reactive effect — the value was baked into the item template
    // once and froze at its SSR value. The identical binding on a top-level
    // element works, because the top-level path wraps opaque function calls
    // via the Solid-style AST-flag fallback (#940). This test pins that the
    // loop-child path now applies the same fallback.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function ReproLoopAttr() {
        const [items, setItems] = createSignal([{ id: 'a', w: 20 }, { id: 'b', w: 50 }])
        const widthAt = (i) => items()[i].w
        return (
          <ul>
            {items().map((it, i) => (
              <li key={it.id} data-b style={\`width:\${widthAt(i)}%\`}>{it.id}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'ReproLoopAttr.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The per-item style binding must be wired through a createEffect that
    // re-reads the helper and writes the style attribute, so it tracks the
    // `items()` signal and updates after hydration.
    expect(clientJs).toContain('createEffect')
    expect(clientJs).toContain("setAttribute('style'")
    // The helper call must survive into the emitted effect (not be baked into
    // the static template), so the binding re-evaluates on signal change. The
    // index reference resolves to the loop's renderItem index param, which is
    // in scope inside the factory.
    expect(clientJs).toContain('widthAt(')
  })

  test('keyed loop: `key` prop is not emitted as a reactive DOM attribute', () => {
    // Regression guard for the "key duplicate emission" bug:
    // `<li key={item.id}>` used to be both rendered as `data-key=` in the
    // template (correct, used by mapArray reconciliation) AND wired as a
    // reactive `setAttribute('key', ...)` effect on every item (incorrect —
    // `key` is a virtual prop, not a DOM attribute). This left a non-standard
    // `key=` attribute on the live DOM and burned a no-op createEffect per
    // item per signal change.
    //
    // Fix: skip `attr.name === 'key'` in collectLoopChildReactiveAttrs.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function L() {
        const [items, setItems] = createSignal([{ id: 1, name: 'a' }])
        return (
          <ul>
            {items().map(item => (
              <li key={item.id} onClick={() => setItems(p => p)}>{item.name}</li>
            ))}
          </ul>
        )
      }
    `
    const result = compileJSX(source, 'L.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // The template still uses `data-key=` for SSR + reconciliation.
    expect(clientJs!.content).toContain('data-key=')
    // But there must be NO createEffect that calls setAttribute('key', ...).
    expect(clientJs!.content).not.toContain("setAttribute('key'")
  })
})
