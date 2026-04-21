/**
 * Regression tests for #932: module-level JSX helper functions with
 * multiple `return` statements (switch / if-else chain) must be
 * preserved in the marked-template output so SSR does not throw
 * `ReferenceError: HelperName is not defined`.
 *
 * Context: `extractSingleJsxReturn` in the analyzer only marks a helper
 * `isJsxFunction = true` when the body has exactly one JSX-returning
 * `return`. Multi-return shapes slipped through both the inlining path
 * and the emitter path, surfacing as a silent hydration/SSR break (see
 * `ui/components/gallery/admin/admin-shell.tsx`'s NavIcon workaround).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('Multi-return JSX helper preservation (#932)', () => {
  test('switch-return helper is preserved in the marked template', () => {
    const source = `
      function NavIcon({ name }: { name: string }) {
        switch (name) {
          case 'home':  return <svg><path d="m1 1" /></svg>
          case 'chart': return <svg><path d="m2 2" /></svg>
          default:      return null
        }
      }

      export function Shell() {
        return (
          <nav>
            <NavIcon name="home" />
            <NavIcon name="chart" />
          </nav>
        )
      }
    `

    const result = compileJSXSync(source, 'Shell.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    expect(markedTemplate).toBeDefined()
    // The helper body must land in the template file so SSR can resolve it.
    expect(markedTemplate!.content).toContain('function NavIcon')
    expect(markedTemplate!.content).toContain("case 'home'")
    expect(markedTemplate!.content).toContain("case 'chart'")
  })

  test('if-else chain returning JSX is preserved', () => {
    const source = `
      function Badge({ kind }: { kind: string }) {
        if (kind === 'ok')   return <span class="ok">ok</span>
        if (kind === 'warn') return <span class="warn">warn</span>
        return <span class="err">err</span>
      }

      export function Panel() {
        return (
          <div>
            <Badge kind="ok" />
            <Badge kind="warn" />
          </div>
        )
      }
    `

    const result = compileJSXSync(source, 'Panel.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')!.content
    expect(markedTemplate).toContain('function Badge')
    expect(markedTemplate).toContain("kind === 'ok'")
    expect(markedTemplate).toContain("kind === 'warn'")
  })

  test('early-return null + JSX fallback is preserved', () => {
    const source = `
      function Optional({ show }: { show: boolean }) {
        if (!show) return null
        return <strong>shown</strong>
      }

      export function Host() {
        return <div><Optional show={true} /></div>
      }
    `

    const result = compileJSXSync(source, 'Host.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')!.content
    expect(markedTemplate).toContain('function Optional')
    expect(markedTemplate).toContain('return null')
    expect(markedTemplate).toContain('<strong>shown</strong>')
  })

  test('"use client" files keep multi-return components as components', () => {
    // Regression guard: stateful multi-return components that rely on
    // conditional-return handling (createSignal + onClick per branch)
    // must NOT be reclassified as verbatim helpers.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Toggle(props: { asChild?: boolean }) {
        const [open, setOpen] = createSignal(false)
        if (props.asChild) {
          return <span onClick={() => setOpen(!open())}>child</span>
        }
        return <button onClick={() => setOpen(!open())}>toggle</button>
      }
    `
    const result = compileJSXSync(source, 'Toggle.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('initToggle')
    expect(clientJs!.content).toContain("addEventListener('click'")
  })

  test('single-return helper continues to work (regression guard)', () => {
    const source = `
      function PackageIcon({ size }: { size: number }) {
        return <svg width={size}><path d="m0 0" /></svg>
      }

      export function Lister() {
        return <div><PackageIcon size={24} /></div>
      }
    `

    const result = compileJSXSync(source, 'Lister.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)

    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')!.content
    // Single-return helpers are inlined at call sites by #569, so the
    // function body need not appear verbatim, but the SVG content must
    // reach the template output somewhere.
    expect(markedTemplate).toMatch(/PackageIcon|<svg|<path/)
  })

  test('exported-via-named-export multi-return component stays a component', () => {
    // Regression guard (#932): shadcn-style stateless components like
    // `ButtonGroupText` have two JSX returns (asChild / default branches)
    // and are re-exported via `export { Name }` at the bottom of the file.
    // They must NOT be reclassified as helpers — other files import them
    // as components and expect compiled component output.
    const source = `
      function ButtonGroupText({ asChild, children }: { asChild?: boolean, children?: unknown }) {
        if (asChild) {
          return <span className="as-child">{children}</span>
        }
        return <div className="default">{children}</div>
      }

      export { ButtonGroupText }
    `
    const result = compileJSXSync(source, 'button-group.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    expect(markedTemplate).toBeDefined()
    expect(markedTemplate!.content).toMatch(/ButtonGroupText/)
  })

  test('inline `export function` multi-return component stays a component', () => {
    const source = `
      export function ButtonGroupText({ asChild, children }: { asChild?: boolean, children?: unknown }) {
        if (asChild) {
          return <span>{children}</span>
        }
        return <div>{children}</div>
      }
    `
    const result = compileJSXSync(source, 'button-group.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const markedTemplate = result.files.find(f => f.type === 'markedTemplate')
    expect(markedTemplate).toBeDefined()
    expect(markedTemplate!.content).toMatch(/ButtonGroupText/)
  })
})
