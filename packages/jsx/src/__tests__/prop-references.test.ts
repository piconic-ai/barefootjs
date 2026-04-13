/**
 * BarefootJS Compiler - Prop Reference Extraction Tests (TDD)
 *
 * Tests for semantic prop reference tracking in IR.
 * Issue #261: Track prop references semantically instead of text-based transformation.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import type { IRExpression, IRConditional } from '../types'

const adapter = new TestAdapter()

describe('PropReference extraction', () => {
  describe('extractPropReferences via jsxToIR', () => {
    test('destructured props do NOT have propRefs (no transformation needed)', () => {
      const source = `
        'use client'

        interface Props {
          open: boolean
        }

        export function Dialog({ open }: Props) {
          return <div>{open}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Dialog.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        const expr = ir.children[0] as IRExpression
        expect(expr.type).toBe('expression')
        expect(expr.expr).toBe('open')
        // Destructured props should NOT have propRefs (captured once, no transformation)
        expect(expr.propRefs ?? []).toHaveLength(0)
      }
    })

    test('does NOT extract props.open pattern (already object access)', () => {
      const source = `
        'use client'

        interface Props {
          open: boolean
        }

        export function Dialog(props: Props) {
          return <div>{props.open}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Dialog.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        const expr = ir.children[0] as IRExpression
        expect(expr.type).toBe('expression')
        expect(expr.expr).toBe('props.open')
        // Should NOT have propRefs since using SolidJS-style props
        expect(expr.propRefs ?? []).toHaveLength(0)
      }
    })

    test('does NOT extract window.open() (not a prop reference)', () => {
      const source = `
        'use client'

        interface Props {
          open: boolean
        }

        export function Dialog({ open }: Props) {
          return <button onClick={() => window.open('https://example.com')}>Open</button>
        }
      `

      const ctx = analyzeComponent(source, 'Dialog.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      // The expression "window.open('https://example.com')" should NOT have propRefs
      // because 'open' here is a property access on 'window', not a prop reference
    })

    test('does NOT extract isOpen when only open is prop', () => {
      const source = `
        'use client'

        interface Props {
          open: boolean
        }

        export function Dialog({ open }: Props) {
          const isOpen = open
          return <div>{isOpen}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Dialog.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        const expr = ir.children[0] as IRExpression
        expect(expr.type).toBe('expression')
        expect(expr.expr).toBe('isOpen')
        // 'isOpen' is not in propsParams (only 'open' is), so no propRefs
        expect(expr.propRefs ?? []).toHaveLength(0)
      }
    })

    test('multiple destructured props do NOT have propRefs', () => {
      const source = `
        'use client'

        interface Props {
          firstName: string
          lastName: string
        }

        export function Greeting({ firstName, lastName }: Props) {
          return <div>{firstName + ' ' + lastName}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Greeting.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        const expr = ir.children[0] as IRExpression
        expect(expr.type).toBe('expression')
        expect(expr.expr).toBe("firstName + ' ' + lastName")
        // Destructured props should NOT have propRefs
        expect(expr.propRefs ?? []).toHaveLength(0)
      }
    })

    test('destructured props with default value do NOT have propRefs', () => {
      const source = `
        'use client'

        interface Props {
          open?: boolean
        }

        export function Dialog({ open = false }: Props) {
          return <div>{open}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Dialog.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        const expr = ir.children[0] as IRExpression
        expect(expr.type).toBe('expression')
        expect(expr.expr).toBe('open')
        // Destructured props should NOT have propRefs
        expect(expr.propRefs ?? []).toHaveLength(0)
      }
    })
  })

  describe('IRConditional with conditionPropRefs', () => {
    test('destructured props in ternary condition do NOT have conditionPropRefs', () => {
      const source = `
        'use client'

        interface Props {
          open: boolean
        }

        export function Dialog({ open }: Props) {
          return <div>{open ? 'yes' : 'no'}</div>
        }
      `

      const ctx = analyzeComponent(source, 'Dialog.tsx')
      const ir = jsxToIR(ctx)

      expect(ir).not.toBeNull()
      expect(ir?.type).toBe('element')
      if (ir?.type === 'element') {
        expect(ir.children).toHaveLength(1)
        const cond = ir.children[0] as IRConditional
        expect(cond.type).toBe('conditional')
        expect(cond.condition).toBe('open')
        // Destructured props should NOT have conditionPropRefs
        expect(cond.conditionPropRefs ?? []).toHaveLength(0)
      }
    })
  })
})

describe('ClientJS generation with semantic prop refs', () => {
  test('destructured props are captured once, NOT transformed in createEffect', () => {
    const source = `
      'use client'

      interface Props {
        open: boolean
      }

      export function Dialog({ open }: Props) {
        return <div>{open ? 'yes' : 'no'}</div>
      }
    `

    const result = compileJSXSync(source, 'Dialog.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should have capture: const open = props.open
    expect(clientJs?.content).toContain('const open = _p.open')
    // createEffect should use 'open' directly, NOT 'props.open'
    // (destructured props are static, captured once)
    expect(clientJs?.content).not.toMatch(/insert\([^)]*props\.open/)
  })

  test('does NOT double-wrap props.open (SolidJS style)', () => {
    const source = `
      'use client'

      interface Props {
        open: boolean
      }

      export function Dialog(props: Props) {
        return <div>{props.open ? 'yes' : 'no'}</div>
      }
    `

    const result = compileJSXSync(source, 'Dialog.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should keep props.open as-is
    expect(clientJs?.content).toContain('_p.open')
    // Should NOT have double-wrapped props.props.open
    expect(clientJs?.content).not.toContain('_p.props')
  })

  test('does NOT transform window.open() in event handler', () => {
    const source = `
      'use client'

      interface Props {
        open: boolean
      }

      export function Dialog({ open }: Props) {
        return <button onClick={() => window.open('https://example.com')}>Open Window</button>
      }
    `

    const result = compileJSXSync(source, 'Dialog.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Event handler should contain window.open, not props.open
    // (window.open is NOT a prop reference)
    expect(clientJs?.content).toContain('window.open')
    expect(clientJs?.content).not.toContain('window.props.open')
  })

  test('destructured props with default value are captured once', () => {
    const source = `
      'use client'

      interface Props {
        open?: boolean
      }

      export function Dialog({ open = false }: Props) {
        return <div>{open ? 'yes' : 'no'}</div>
      }
    `

    const result = compileJSXSync(source, 'Dialog.tsx', { adapter })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should capture with default value: const open = props.open ?? false
    expect(clientJs?.content).toMatch(/const open = _p\.open \?\? false/)
  })
})

// Issue #257 regression test: Double props prefix in template literals
describe('Issue #257 regression', () => {
  test('does NOT double-wrap props.xxx when already prefixed', () => {
    const source = `
      'use client'

      interface Props {
        command: string
      }

      export function CommandDisplay(props: Props) {
        return <div>{\`npx \${props.command}\`}</div>
      }
    `

    const result = compileJSXSync(source, 'CommandDisplay.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Should keep props.command as-is, NOT transform to props.props.command
    expect(clientJs?.content).toContain('_p.command')
    expect(clientJs?.content).not.toContain('_p.props.command')
  })
})

// Issue #807 regression test: Object literal key renaming
describe('Issue #807 regression', () => {
  test('object literal key is NOT renamed when it matches a prop name', () => {
    const source = `
      'use client'

      interface Props {
        org: string
      }

      function translate(key: string, params: Record<string, string>): string {
        return key
      }

      export function Example(props: Props) {
        return <div>{translate('No projects for {org}', { org: props.org })}</div>
      }
    `

    const result = compileJSXSync(source, 'Example.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Key 'org' should NOT be renamed to '_p.org'
    expect(clientJs?.content).not.toContain('_p.org:')
    // Value should be correctly transformed
    expect(clientJs?.content).toContain('_p.org')
  })

  test('multiple object literal keys matching prop names are preserved', () => {
    const source = `
      'use client'

      interface Props {
        org: string
        name: string
      }

      function translate(key: string, params: Record<string, string>): string {
        return key
      }

      export function Example(props: Props) {
        return <div>{translate('msg', { org: props.org, name: props.name })}</div>
      }
    `

    const result = compileJSXSync(source, 'Example.tsx', { adapter })

    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    // Neither key should be renamed
    expect(clientJs?.content).not.toContain('_p.org:')
    expect(clientJs?.content).not.toContain('_p.name:')
    // Values should be correctly transformed
    expect(clientJs?.content).toContain('_p.org')
    expect(clientJs?.content).toContain('_p.name')
  })
})
