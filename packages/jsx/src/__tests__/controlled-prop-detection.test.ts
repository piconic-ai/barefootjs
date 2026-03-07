import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('controlled prop detection (#434)', () => {
  test('props.xxx ?? default generates sync effect', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface SliderProps {
        initial?: number
      }

      export function Slider(props: SliderProps) {
        const [value, setValue] = createSignal(props.initial ?? 0)
        return <input type="range" value={value()} />
      }
    `

    const result = compileJSXSync(source, 'Slider.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Sync effect for controlled prop should be generated
    expect(clientJs?.content).toContain('const __val = _p.initial')
  })

  test('props.defaultXxx ?? default does NOT generate sync effect', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface CheckboxProps {
        defaultChecked?: boolean
      }

      export function Checkbox(props: CheckboxProps) {
        const [checked, setChecked] = createSignal(props.defaultChecked ?? false)
        return <input type="checkbox" checked={checked()} />
      }
    `

    const result = compileJSXSync(source, 'Checkbox.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // No sync effect for uncontrolled (defaultXxx) props
    expect(clientJs?.content).not.toContain('const __val = _p.')
  })

  test('no redundant double-?? in output', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface SliderProps {
        initial?: number
      }

      export function Slider(props: SliderProps) {
        const [value, setValue] = createSignal(props.initial ?? 0)
        return <input type="range" value={value()} />
      }
    `

    const result = compileJSXSync(source, 'Slider.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Init function should not contain double ?? like "props.initial ?? 0 ?? 0"
    // (Template function may legitimately contain ?? in signal initial value substitutions)
    const initFn = clientJs?.content.match(/export function initSlider[\s\S]*?^}/m)?.[0] ?? ''
    expect(initFn).not.toMatch(/\?\?.*\?\?/)
  })

  test('preserves original ?? fallback value in output', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface SliderProps {
        initial?: number
      }

      export function Slider(props: SliderProps) {
        const [value, setValue] = createSignal(props.initial ?? 0)
        return <input type="range" value={value()} />
      }
    `

    const result = compileJSXSync(source, 'Slider.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Must preserve the original fallback value, NOT replace with undefined
    expect(clientJs?.content).toContain('_p.initial ?? 0')
    expect(clientJs?.content).not.toContain('_p.initial ?? undefined')
  })

  test('preserves boolean fallback value in output', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface CheckboxProps {
        defaultChecked?: boolean
      }

      export function Checkbox(props: CheckboxProps) {
        const [checked, setChecked] = createSignal(props.defaultChecked ?? false)
        return <input type="checkbox" checked={checked()} />
      }
    `

    const result = compileJSXSync(source, 'Checkbox.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Must preserve false, NOT replace with undefined
    expect(clientJs?.content).toContain('_p.defaultChecked ?? false')
    expect(clientJs?.content).not.toContain('_p.defaultChecked ?? undefined')
  })

  test('preserves string fallback value in output', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface InputProps {
        defaultValue?: string
      }

      export function Input(props: InputProps) {
        const [value, setValue] = createSignal(props.defaultValue ?? '')
        return <input value={value()} />
      }
    `

    const result = compileJSXSync(source, 'Input.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Must preserve empty string, NOT replace with undefined
    expect(clientJs?.content).not.toContain("props.defaultValue ?? undefined")
  })

  test('custom props parameter name (e.g., p) generates sync effect', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      interface SliderProps {
        initial?: number
      }

      export function Slider(p: SliderProps) {
        const [value, setValue] = createSignal(p.initial ?? 0)
        return <input type="range" value={value()} />
      }
    `

    const result = compileJSXSync(source, 'Slider.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Sync effect should be generated
    expect(clientJs?.content).toContain('const __val = _p.initial')
    // Output should use '_p.initial' (normalized from custom 'p.initial')
    expect(clientJs?.content).toContain('_p.initial')
    // Should not contain unrewritten 'p.initial' (without underscore prefix)
    expect(clientJs?.content).not.toMatch(/[^_]p\.initial/)
    // Init function should not contain double ??
    const initFn = clientJs?.content.match(/export function initSlider[\s\S]*?^}/m)?.[0] ?? ''
    expect(initFn).not.toMatch(/\?\?.*\?\?/)
  })
})
