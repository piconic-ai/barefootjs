/**
 * BarefootJS Compiler - analyzeComponent Tests
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'

describe('analyzeComponent', () => {
  test('extracts signals', () => {
    const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <div>{count()}</div>
        }
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.componentName).toBe('Counter')
    expect(ctx.signals).toHaveLength(1)
    expect(ctx.signals[0].getter).toBe('count')
    expect(ctx.signals[0].setter).toBe('setCount')
    expect(ctx.signals[0].initialValue).toBe('0')
    expect(ctx.hasUseClientDirective).toBe(true)
  })

  test('extracts props', () => {
    const source = `
        'use client'

        interface CounterProps {
          initial?: number
        }

        export function Counter({ initial = 0 }: CounterProps) {
          return <div>{initial}</div>
        }
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.componentName).toBe('Counter')
    expect(ctx.propsParams).toHaveLength(1)
    expect(ctx.propsParams[0].name).toBe('initial')
    expect(ctx.propsParams[0].defaultValue).toBe('0')
    expect(ctx.typeDefinitions).toHaveLength(1)
    expect(ctx.typeDefinitions[0].name).toBe('CounterProps')
  })

  test('extracts memos', () => {
    const source = `
        'use client'
        import { createSignal, createMemo } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          const doubled = createMemo(() => count() * 2)
          return <div>{doubled()}</div>
        }
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.memos).toHaveLength(1)
    expect(ctx.memos[0].name).toBe('doubled')
    expect(ctx.memos[0].computation).toBe('() => count() * 2')
  })

  test('does not collect variables from nested function declarations', () => {
    const source = `
        'use client'

        export function FilterList() {
          const topLevelConst = 'visible'

          function getInitialFilter() {
            const hash = window.location.hash
            return hash ? hash.slice(1) : 'all'
          }

          return <div>{topLevelConst}</div>
        }
      `

    const ctx = analyzeComponent(source, 'FilterList.tsx')

    // Should collect top-level const
    expect(ctx.localConstants.some((c) => c.name === 'topLevelConst')).toBe(
      true
    )
    // Should NOT collect variables from nested function declaration
    expect(ctx.localConstants.some((c) => c.name === 'hash')).toBe(false)
  })

  test('ternary constant has valueBranches', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      export function Demo() {
        const [active, setActive] = createSignal(false)
        const cls = active() ? 'a b' : 'c d'
        return <div className={cls}></div>
      }
    `

    const ctx = analyzeComponent(source, 'test.tsx')
    const cls = ctx.localConstants.find(c => c.name === 'cls')
    expect(cls).toBeDefined()
    expect(cls!.valueBranches).toEqual(["'a b'", "'c d'"])
  })

  test('nested ternary constant has flattened valueBranches', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      export function Demo() {
        const [state, setState] = createSignal(0)
        const cls = state() === 0 ? 'a' : state() === 1 ? 'b' : 'c'
        return <div className={cls}></div>
      }
    `

    const ctx = analyzeComponent(source, 'test.tsx')
    const cls = ctx.localConstants.find(c => c.name === 'cls')
    expect(cls).toBeDefined()
    expect(cls!.valueBranches).toEqual(["'a'", "'b'", "'c'"])
  })

  test('non-ternary constant has no valueBranches', () => {
    const source = `
      'use client'

      export function Demo() {
        const cls = 'hello world'
        return <div className={cls}></div>
      }
    `

    const ctx = analyzeComponent(source, 'test.tsx')
    const cls = ctx.localConstants.find(c => c.name === 'cls')
    expect(cls).toBeDefined()
    expect(cls!.valueBranches).toBeUndefined()
  })

  test('export { X } named export syntax sets isExported', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      const MY_CONST = 42

      export { MY_CONST }

      export function Widget() {
        const [val, setVal] = createSignal(0)
        return <div>{MY_CONST}</div>
      }
    `
    const ctx = analyzeComponent(source, 'Widget.tsx')
    const constInfo = ctx.localConstants.find(c => c.name === 'MY_CONST')
    expect(constInfo).toBeDefined()
    expect(constInfo!.isExported).toBe(true)
  })

  test('isExported flag for export const, internal const, and export let', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/dom'

      export const EXPORTED_A = 'aaa'
      const INTERNAL_B = 'bbb'
      export let EXPORTED_C = 100

      export function MyComponent() {
        const [val, setVal] = createSignal(0)
        return <div />
      }
    `
    const ctx = analyzeComponent(source, 'Test.tsx')

    const a = ctx.localConstants.find(c => c.name === 'EXPORTED_A')
    expect(a).toBeDefined()
    expect(a!.isExported).toBe(true)
    expect(a!.declarationKind).toBe('const')

    const b = ctx.localConstants.find(c => c.name === 'INTERNAL_B')
    expect(b).toBeDefined()
    expect(b!.isExported).toBeFalsy()

    const c = ctx.localConstants.find(c => c.name === 'EXPORTED_C')
    expect(c).toBeDefined()
    expect(c!.isExported).toBe(true)
    expect(c!.declarationKind).toBe('let')
  })

  test('let without initializer is captured', () => {
    const source = `
      'use client'
      import { createSignal, createEffect, onCleanup } from '@barefootjs/dom'

      type ApiType = { scrollPrev: () => void }

      export function Carousel() {
        let emblaApi: ApiType | undefined
        const [canScrollPrev, setCanScrollPrev] = createSignal(false)

        createEffect(() => {
          if (emblaApi) {
            setCanScrollPrev(true)
          }
        })

        return <div>{canScrollPrev() ? 'yes' : 'no'}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Carousel.tsx')
    const letConstant = ctx.localConstants.find(c => c.name === 'emblaApi')
    expect(letConstant).toBeDefined()
    expect(letConstant!.declarationKind).toBe('let')
    expect(letConstant!.value).toBeUndefined()
  })

  test('extracts signal with getter only (no setter)', () => {
    const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function ReadOnlyList() {
          const [items] = createSignal([1, 2, 3])
          return <div>{items().length}</div>
        }
      `

    const ctx = analyzeComponent(source, 'ReadOnlyList.tsx')

    expect(ctx.signals).toHaveLength(1)
    expect(ctx.signals[0].getter).toBe('items')
    expect(ctx.signals[0].setter).toBeNull()
    expect(ctx.signals[0].initialValue).toBe('[1, 2, 3]')
  })

  test('detects export default function pattern', () => {
    const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export default function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(count() + 1)}>{count()}</button>
        }
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.componentName).toBe('Counter')
    expect(ctx.hasDefaultExport).toBe(true)
  })

  test('detects export default ComponentName pattern', () => {
    const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(count() + 1)}>{count()}</button>
        }
        export default Counter
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.componentName).toBe('Counter')
    expect(ctx.hasDefaultExport).toBe(true)
  })

  test('hasDefaultExport is false when no default export', () => {
    const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        export function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(count() + 1)}>{count()}</button>
        }
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.componentName).toBe('Counter')
    expect(ctx.hasDefaultExport).toBe(false)
  })

  test('hasDefaultExport is false with named export only', () => {
    const source = `
        'use client'
        import { createSignal } from '@barefootjs/dom'

        function Counter() {
          const [count, setCount] = createSignal(0)
          return <button onClick={() => setCount(count() + 1)}>{count()}</button>
        }
        export { Counter }
      `

    const ctx = analyzeComponent(source, 'Counter.tsx')

    expect(ctx.componentName).toBe('Counter')
    expect(ctx.hasDefaultExport).toBe(false)
  })
})
