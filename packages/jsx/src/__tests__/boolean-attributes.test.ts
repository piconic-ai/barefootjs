import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { isBooleanAttr, BOOLEAN_ATTRS } from '../html-constants'

const adapter = new TestAdapter()

describe('boolean attributes', () => {
  test('isBooleanAttr identifies known boolean attributes', () => {
    expect(isBooleanAttr('checked')).toBe(true)
    expect(isBooleanAttr('disabled')).toBe(true)
    expect(isBooleanAttr('readonly')).toBe(true)
    expect(isBooleanAttr('selected')).toBe(true)
    expect(isBooleanAttr('required')).toBe(true)
    expect(isBooleanAttr('hidden')).toBe(true)
    expect(isBooleanAttr('autofocus')).toBe(true)
    expect(isBooleanAttr('autoplay')).toBe(true)
    expect(isBooleanAttr('controls')).toBe(true)
    expect(isBooleanAttr('loop')).toBe(true)
    expect(isBooleanAttr('muted')).toBe(true)
    expect(isBooleanAttr('open')).toBe(true)
    expect(isBooleanAttr('multiple')).toBe(true)
    expect(isBooleanAttr('novalidate')).toBe(true)
  })

  test('isBooleanAttr is case-insensitive', () => {
    expect(isBooleanAttr('CHECKED')).toBe(true)
    expect(isBooleanAttr('Disabled')).toBe(true)
  })

  test('isBooleanAttr returns false for non-boolean attrs', () => {
    expect(isBooleanAttr('class')).toBe(false)
    expect(isBooleanAttr('id')).toBe(false)
    expect(isBooleanAttr('value')).toBe(false)
    expect(isBooleanAttr('type')).toBe(false)
  })

  test('BOOLEAN_ATTRS contains all expected attributes', () => {
    expect(BOOLEAN_ATTRS.size).toBe(15)
    expect(BOOLEAN_ATTRS.has('checked')).toBe(true)
    expect(BOOLEAN_ATTRS.has('disabled')).toBe(true)
    expect(BOOLEAN_ATTRS.has('formnovalidate')).toBe(true)
  })

  test('compiles dynamic boolean attribute using DOM property', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Checkbox() {
        const [isChecked, setIsChecked] = createSignal(false)
        return (
          <input type="checkbox" checked={isChecked()} onChange={() => setIsChecked(!isChecked())} />
        )
      }
    `

    const result = compileJSX(source, 'Checkbox.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should use DOM property assignment for boolean attrs, not setAttribute
    expect(clientJs?.content).toContain('.checked = !!')
    expect(clientJs?.content).not.toContain("setAttribute('checked'")
  })

  test('compiles dynamic disabled attribute using DOM property', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Button() {
        const [isLoading, setIsLoading] = createSignal(false)
        return (
          <button disabled={isLoading()}>Submit</button>
        )
      }
    `

    const result = compileJSX(source, 'Button.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should use DOM property assignment for boolean attrs
    expect(clientJs?.content).toContain('.disabled = !!')
  })

  test('compiles data-disabled={expr || undefined} using setAttribute/removeAttribute', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Button(props: { disabled?: boolean }) {
        return (
          <button data-disabled={props.disabled || undefined}>Submit</button>
        )
      }
    `

    const result = compileJSX(source, 'Button.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should use setAttribute/removeAttribute for boolean presence attrs
    expect(clientJs?.content).toContain("setAttribute('data-disabled', '')")
    expect(clientJs?.content).toContain("removeAttribute('data-disabled')")
    // Should NOT use String() wrapper
    expect(clientJs?.content).not.toContain("String(props.disabled)")
    // Should strip `|| undefined` from the expression
    expect(clientJs?.content).not.toContain('|| undefined')
  })

  test('compiles data-state={open() || undefined} using setAttribute/removeAttribute', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Dialog() {
        const [open, setOpen] = createSignal(false)
        return (
          <div data-state={open() || undefined}>Content</div>
        )
      }
    `

    const result = compileJSX(source, 'Dialog.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should use setAttribute/removeAttribute for boolean presence attrs
    expect(clientJs?.content).toContain("setAttribute('data-state', '')")
    expect(clientJs?.content).toContain("removeAttribute('data-state')")
    // Should strip `|| undefined`
    expect(clientJs?.content).not.toContain('|| undefined')
  })
})
