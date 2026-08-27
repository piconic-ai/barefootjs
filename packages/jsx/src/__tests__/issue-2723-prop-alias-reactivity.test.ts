/**
 * Regression pin for #2723.
 *
 * A semantically-inert `const x__alias = x` hop between a destructured
 * prop and its use site (exactly what the `alias-props` mutation sweep
 * inserts, #2481) silently dropped the attribute's `createEffect` and, in
 * the rest-spread case, its `applyRestAttrs` call too — collapsing `init`
 * to `function initL() {}` whenever the effect was its only content.
 *
 * Five variants isolate the two independent defects the fix addresses:
 *   - A: no alias at all (control — everything present).
 *   - B: every destructured binding aliased, INCLUDING the rest
 *     parameter (`const rest__alias = rest`) — the shape the real
 *     `alias-props` mutation produces.
 *   - C: only the prop feeding the reactive attribute is aliased; the
 *     rest parameter is spread un-aliased.
 *   - D: aliased, but with NO rest spread at all — proves the defect is
 *     not spread-handling-specific.
 *   - E: aliased (rest included) AND an event handler is present, so
 *     `init` is non-empty regardless of the effect. This is the case a
 *     fix aimed only at "don't emit an empty init" would still leave
 *     broken: the `createEffect` silently disappears WITHOUT collapsing
 *     the function, so an empty-init check alone can't catch it.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compileInit(source: string): string {
  const result = compileJSX(source, 'L.tsx', { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')!.content
  return clientJs
}

describe('#2723 — prop alias hop must not drop attribute reactivity', () => {
  test('A: no alias — createEffect and applyRestAttrs both present (control)', () => {
    const clientJs = compileInit(`
      "use client";
      const BASE = 'flex'
      type LProps = { className?: string; children?: any }
      export function L({ className = '', children, ...rest }: LProps) {
        return <label className={\`\${BASE} \${className}\`} {...rest}>{children}</label>
      }
    `)
    expect(clientJs).toContain('createEffect(')
    expect(clientJs).toContain('applyRestAttrs(')
    expect(clientJs).not.toContain('function initL() {}')
  })

  test('B: every binding aliased, rest included — createEffect and applyRestAttrs survive', () => {
    const clientJs = compileInit(`
      "use client";
      const BASE = 'flex'
      type LProps = { className?: string; children?: any }
      export function L({ className = '', children, ...rest }: LProps) {
        const className__alias = className
        const children__alias = children
        const rest__alias = rest
        return <label className={\`\${BASE} \${className__alias}\`} {...rest__alias}>{children__alias}</label>
      }
    `)
    expect(clientJs).toContain('createEffect(')
    expect(clientJs).toContain('applyRestAttrs(')
    expect(clientJs).not.toContain('function initL() {}')
    // The rest-parameter alias must resolve to the runtime props object,
    // not to the never-declared source-level rest binding.
    expect(clientJs).toContain('const rest__alias = _p')
    expect(clientJs).not.toMatch(/const rest__alias = rest\b/)
  })

  test('C: only the reactive prop is aliased, rest is spread un-aliased', () => {
    const clientJs = compileInit(`
      "use client";
      const BASE = 'flex'
      type LProps = { className?: string; children?: any }
      export function L({ className = '', children, ...rest }: LProps) {
        const className__alias = className
        return <label className={\`\${BASE} \${className__alias}\`} {...rest}>{children}</label>
      }
    `)
    expect(clientJs).toContain('createEffect(')
    expect(clientJs).toContain('applyRestAttrs(')
    expect(clientJs).not.toContain('function initL() {}')
  })

  test('D: aliased with NO rest spread — not a spread-handling bug', () => {
    const clientJs = compileInit(`
      "use client";
      const BASE = 'flex'
      type LProps = { className?: string; children?: any }
      export function L({ className = '', children }: LProps) {
        const className__alias = className
        return <label className={\`\${BASE} \${className__alias}\`}>{children}</label>
      }
    `)
    expect(clientJs).toContain('createEffect(')
    expect(clientJs).not.toContain('applyRestAttrs(')
    expect(clientJs).not.toContain('function initL() {}')
  })

  test('E: aliased + event handler — createEffect must survive even though init is already non-empty', () => {
    const clientJs = compileInit(`
      "use client";
      const BASE = 'flex'
      type LProps = { className?: string; children?: any; onClick?: () => void }
      export function L({ className = '', children, onClick, ...rest }: LProps) {
        const className__alias = className
        const rest__alias = rest
        return <label className={\`\${BASE} \${className__alias}\`} onClick={onClick} {...rest__alias}>{children}</label>
      }
    `)
    // A fix aimed only at "init must not be empty" would pass this
    // assertion for free (the handler alone keeps init non-empty) while
    // leaving the class binding frozen at its initial value — the
    // `createEffect` assertion is the one that actually pins the fix.
    expect(clientJs).not.toContain('function initL() {}')
    expect(clientJs).toContain('createEffect(')
    expect(clientJs).toContain('applyRestAttrs(')
    expect(clientJs).toContain("addEventListener('click'")
  })
})
