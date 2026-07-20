/**
 * Regression tests for #2341 BUG-1: reactive-factory call-site inlining used
 * to rename identifiers with a whole-body regex (`\bname\b` -> `name_bf0`,
 * applied three times in sequence for suffix-renaming, param substitution,
 * and return->caller renaming). A regex has no notion of AST position, so
 * it also matched string-literal contents, template-literal text chunks,
 * object/property-access keys, and JSX intrinsic tags that merely happened
 * to spell the same identifier — corrupting them.
 *
 * Fix: collect exact identifier-node rename sites once at detection time
 * (`detectReactiveFactory`), then apply a single merged bottom-to-top
 * position splice at inline time (`inlineFactoryCallAtSite`) instead of any
 * text search. This file pins the corruption classes the old regex produced
 * and the BF114 diagnostic for the one shape the new approach must decline
 * rather than silently substitute (a factory parameter re-declared inside
 * the body).
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('AST-position-based rename fidelity (#2341 BUG-1)', () => {
  test('R1: string-literal argument sharing a local-binding name is preserved', () => {
    // `stored` must feed into `createSignal` (not merely sit unused) so the
    // general local-constant retention pass keeps the statement — an
    // unrelated, pre-existing behavior of the component-body pipeline, out
    // of scope for #2341.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createTheme(initial: string) {
        const stored = localStorage.getItem('stored') ?? initial
        const [theme, setTheme] = createSignal(stored)
        return [theme, setTheme] as const
      }

      export function App() {
        const [theme, setTheme] = createTheme('light')
        return <button onClick={() => setTheme('dark')}>{theme()}</button>
      }
    `

    const result = compileJSX(source, 'App.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The string literal argument to getItem must stay untouched...
    expect(clientJs).toMatch(/localStorage\.getItem\('stored'\)/)
    expect(clientJs).not.toMatch(/'stored_bf/)
    // ...while the local binding declaration is still suffix-renamed.
    expect(clientJs).toMatch(/stored_bf\d+ = localStorage/)
  })

  test('R2: SSR template also preserves the string literal', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createTheme(initial: string) {
        const stored = localStorage.getItem('stored') ?? initial
        const [theme, setTheme] = createSignal(stored)
        return [theme, setTheme] as const
      }

      export function App() {
        const [theme, setTheme] = createTheme('light')
        return <button onClick={() => setTheme('dark')}>{theme()}</button>
      }
    `

    const result = compileJSX(source, 'App.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const template = result.files.find(f => f.type === 'markedTemplate')
    expect(template).toBeDefined()
    expect(template!.content).toContain("getItem('stored')")
  })

  test('R3: template-literal text chunks are preserved, only substitutions rename', () => {
    // Tuple factories require every return element to be destructured at
    // the call site (arity must match), so all three elements are bound.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createLabelled(initial: string) {
        const [value, setValue] = createSignal(initial)
        const stored = initial
        const label = \`\${stored} stored\`
        return [value, setValue, label] as const
      }

      export function Labelled() {
        const [value, setValue, label] = createLabelled('x')
        return <p>{value()} {label}</p>
      }
    `

    const result = compileJSX(source, 'Labelled.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // The substitution `${stored}` renames with the local; the literal text
    // chunk ` stored` after it must not.
    expect(clientJs).toMatch(/`\$\{stored_bf\d+\} stored`/)
  })

  test('R4: shorthand property + string-literal argument expands to longhand (Repro B)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createUser(name: string) {
        const [user, setUser] = createSignal({ name, loggedIn: false })
        return [user, setUser] as const
      }

      export function Profile() {
        const [user, setUser] = createUser('Alice')
        return <p onClick={() => setUser({ name: 'Bob', loggedIn: true })}>{user().name}</p>
      }
    `

    const result = compileJSX(source, 'Profile.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toMatch(/\{\s*name:\s*'Alice',\s*loggedIn:\s*false\s*\}/)
  })

  test('R5: shorthand property with a suffix-renamed local keeps its key', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createBox(initial: number) {
        const size = initial + 1
        const [box, setBox] = createSignal({ size })
        return { box, setBox }
      }

      export function BoxDisplay() {
        const { box, setBox } = createBox(1)
        return <p onClick={() => setBox({ size: 2 })}>{box().size}</p>
      }
    `

    const result = compileJSX(source, 'BoxDisplay.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toMatch(/\{\s*size:\s*size_bf\d+\s*\}/)
  })

  test('R6: caller-rename of a return identifier leaves unrelated strings alone (Repro C)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createInput(initial: string) {
        const [value, setValue] = createSignal(initial)
        const update = (next: string) => {
          if (next.length > 10) throw new Error('value too long')
          setValue(next)
        }
        return [value, update] as const
      }

      export function Field() {
        const [email, setEmail] = createInput('')
        return <input value={email()} onInput={(e) => setEmail(e.target.value)} />
      }
    `

    const result = compileJSX(source, 'Field.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toContain("'value too long'")
    expect(clientJs).not.toContain("throw new Error('email")
    // The wrapper's declaration is renamed to the caller's setter name.
    expect(clientJs).toMatch(/setEmail\s*=/)
  })

  test('R7: object-pattern shorthand binding (nested callback parameter) expands and keeps its key', () => {
    // The ObjectBindingPattern shape is exercised on a nested callback's own
    // parameter — `({ pos }) => ...` — rather than a top-level `const { pos }
    // = ...` body statement: the latter is dropped by an unrelated,
    // pre-existing gap in the component-body local-constant pipeline (out of
    // scope for #2341; confirmed to reproduce identically outside any
    // factory). The callback parameter here deliberately shadows the
    // factory's own `pos` binding, pinning the alpha-rename guarantee from
    // the #2341 BUG-1 spec: the walker does not stop at nested-function
    // boundaries, so the shadowing parameter and the outer binding rename
    // identically and consistently.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createPoint(seed: number) {
        const [pos, setPos] = createSignal(seed)
        const moveTo = ({ pos }: { pos: number }) => setPos(pos)
        return { pos, moveTo }
      }

      export function PointDisplay() {
        const { moveTo } = createPoint(0)
        return <p onClick={() => moveTo({ pos: 5 })}>ok</p>
      }
    `

    const result = compileJSX(source, 'PointDisplay.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toMatch(/\{\s*pos:\s*pos_bf\d+\s*\}/)
  })

  test('R8: property keys and .prop tails sharing a param name are untouched', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createConfigured(initial: number) {
        const config = { initial: 0 }
        const [n, setN] = createSignal(config.initial ?? initial)
        return [n, setN] as const
      }

      export function Counter() {
        const [n, setN] = createConfigured(5)
        return <button onClick={() => setN(n() + 1)}>{n()}</button>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).toMatch(/\{\s*initial:\s*0\s*\}/)
    expect(clientJs).toMatch(/config_bf\d+\.initial/)
    expect(clientJs).toMatch(/\?\?\s*5/)
  })

  test('R9: a nested declaration that shadows a factory parameter declines with BF114', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createOops(initial: number) {
        const [n, setN] = createSignal(initial)
        const reset = (initial: number) => setN(initial)
        return { n, reset }
      }

      export function Oops() {
        const { n, reset } = createOops(0)
        return <button onClick={() => reset(0)}>{n()}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Oops.tsx')
    expect(ctx.signals.length).toBe(0)

    const result = compileJSX(source, 'Oops.tsx', { adapter })
    const bf114 = result.errors.find(e => e.code === 'BF114')
    expect(bf114).toBeDefined()
    expect(bf114!.message).toContain('initial')
    expect(bf114!.message).toContain('createOops')
  })

  test('R10: an argument expression is never re-scanned by a later rename pass (cascade fix)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createInput(initial: string) {
        const [value, setValue] = createSignal(initial)
        const update = (next: string) => setValue(next)
        return [value, update] as const
      }

      export function Field() {
        const value = 'seed'
        const [email, setEmail] = createInput(value)
        return <input value={email()} onInput={(e) => setEmail(e.target.value)} />
      }
    `

    const result = compileJSX(source, 'Field.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    // `value` (the outer local passed as the argument) must reach
    // createSignal verbatim — a later return->caller rename pass renaming
    // the factory's own `value` return identifier to `email` must not
    // re-scan and corrupt the already-substituted argument text.
    expect(clientJs).toMatch(/createSignal\(\s*value\s*\)/)
  })

  test('R11: a tuple array-binding pattern in the body is not shorthand-expanded (ArrayBindingPattern trap)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      function createCounter(initial: number) {
        const [c, s] = createSignal(initial)
        return [c, s] as const
      }

      export function Counter() {
        const [count, setCount] = createCounter(0)
        return <button onClick={() => setCount(count() + 1)}>{count()}</button>
      }
    `

    const result = compileJSX(source, 'Counter.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const clientJs = result.files.find(f => f.type === 'clientJs')!.content
    expect(clientJs).not.toMatch(/\[\s*\w+:\s/)
  })
})
