/**
 * BarefootJS Compiler - Reactive attributes inside .map() callbacks
 *
 * Verifies that signal-dependent attributes (e.g., className) in .map()
 * children generate createEffect for DOM updates.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('reactive attributes inside .map() callbacks', () => {
  test('static array: reactive className generates createEffect', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/dom'

      export function TagList() {
        const tags = ['all', 'ui', 'form']
        const [activeTag, setActiveTag] = createSignal('all')
        return (
          <div>
            {tags.map(tag => (
              <button className={tag === activeTag() ? 'active' : 'inactive'}>{tag}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'TagList.tsx', { adapter })
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

      import { createSignal } from '@barefootjs/dom'

      export function ItemList() {
        const items = ['a', 'b', 'c']
        const [disabled, setDisabled] = createSignal(false)
        return (
          <div>
            {items.map(item => (
              <button disabled={disabled()}>{item}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'ItemList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('createEffect')
    expect(clientJs!.content).toContain('disabled')
  })

  test('dynamic array: reactive className handled by reconcileElements re-render (no extra effect needed)', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/dom'

      export function DynamicTagList() {
        const [tags, setTags] = createSignal(['all', 'ui', 'form'])
        const [activeTag, setActiveTag] = createSignal('all')
        return (
          <div>
            {tags().map(tag => (
              <button className={tag === activeTag() ? 'active' : 'inactive'}>{tag}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'DynamicTagList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Dynamic arrays use reconcileElements which re-creates items on signal change
    expect(clientJs!.content).toContain('reconcileElements')
  })

  test('static array: multiple reactive attrs on same element groups correctly', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/dom'

      export function TagList() {
        const tags = ['all', 'ui', 'form']
        const [activeTag, setActiveTag] = createSignal('all')
        const [isDisabled, setIsDisabled] = createSignal(false)
        return (
          <div>
            {tags.map(tag => (
              <button
                className={tag === activeTag() ? 'active' : 'inactive'}
                disabled={isDisabled()}
              >{tag}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'TagList.tsx', { adapter })
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

  test('static array: non-reactive className does NOT generate createEffect', () => {
    const source = `
      'use client'

      import { createSignal } from '@barefootjs/dom'

      export function SimpleList() {
        const items = ['a', 'b', 'c']
        const [count, setCount] = createSignal(0)
        return (
          <div>
            <span>{count()}</span>
            {items.map(item => (
              <button className="static-class">{item}</button>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'SimpleList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should NOT contain reactive attr effect for static className
    // (createEffect may still exist for the count() text node)
    expect(clientJs!.content).not.toContain('__t_')
    expect(clientJs!.content).not.toContain('.className =')
  })
})
