import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'

describe('transparent fragment (Context Provider pattern)', () => {
  test('detects <>{children}</> as transparent', () => {
    const source = `
        'use client'

        export function DialogRoot({ children }) {
          return <>{children}</>
        }
      `

    const ctx = analyzeComponent(source, 'DialogRoot.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('fragment')
    if (ir!.type === 'fragment') {
      expect(ir!.transparent).toBe(true)
    }
  })

  test('detects <>{props.children}</> as transparent', () => {
    const source = `
        'use client'

        export function DialogRoot(props) {
          return <>{props.children}</>
        }
      `

    const ctx = analyzeComponent(source, 'DialogRoot.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('fragment')
    if (ir!.type === 'fragment') {
      expect(ir!.transparent).toBe(true)
    }
  })

  test('detects <>{p.children}</> with custom props name as transparent', () => {
    const source = `
        'use client'

        export function DialogRoot(p) {
          return <>{p.children}</>
        }
      `

    const ctx = analyzeComponent(source, 'DialogRoot.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('fragment')
    if (ir!.type === 'fragment') {
      expect(ir!.transparent).toBe(true)
    }
  })

  test('does NOT mark fragment with multiple children as transparent', () => {
    const source = `
        'use client'

        export function Wrapper({ children }) {
          return (
            <>
              <div>Header</div>
              {children}
            </>
          )
        }
      `

    const ctx = analyzeComponent(source, 'Wrapper.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('fragment')
    if (ir!.type === 'fragment') {
      expect(ir!.transparent).toBeFalsy()
      // Non-transparent fragment uses comment-based scope marker
      expect(ir!.needsScopeComment).toBe(true)
      // Element children should NOT have needsScope (scope is via comment)
      const divChild = ir!.children.find(c => c.type === 'element')
      expect(divChild).toBeDefined()
      if (divChild && divChild.type === 'element') {
        expect(divChild.needsScope).toBe(false)
      }
    }
  })

  test('does NOT mark <> {children} </> with single-line padding as transparent', () => {
    // Unlike a text node split across a line break (cleans to ''), a
    // same-line space around `{children}` is real, rendered text per
    // `cleanJsxWhitespace` — so the fragment has three children, not one,
    // and can't be a pure pass-through.
    const source = `
        'use client'

        export function DialogRoot({ children }) {
          return <> {children} </>
        }
      `

    const ctx = analyzeComponent(source, 'DialogRoot.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('fragment')
    if (ir!.type === 'fragment') {
      expect(ir!.transparent).toBeFalsy()
    }
  })

  test('does NOT mark fragment with non-children expression as transparent', () => {
    const source = `
        'use client'

        export function Component({ value }) {
          return <>{value}</>
        }
      `

    const ctx = analyzeComponent(source, 'Component.tsx')
    const ir = jsxToIR(ctx)

    expect(ir).not.toBeNull()
    expect(ir!.type).toBe('fragment')
    if (ir!.type === 'fragment') {
      expect(ir!.transparent).toBeFalsy()
    }
  })
})
