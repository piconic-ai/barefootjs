import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { ErrorCodes } from '../errors'
import { stripClientBuiltinImports } from '../builtins'
import type { IRAsync, IRElement, IRComponent, ImportInfo } from '../types'

// Import-scoped recognition for the compile-away built-ins `<Async>` /
// `<Region>` (#1915). The compiler recognises them by their
// `@barefootjs/client` import — never by a bare capitalized tag name — so a
// user's own component does not collide with the built-in, and the import is
// elided on emit.

function ir(source: string, path = 'Comp.tsx') {
  const ctx = analyzeComponent(source, path)
  return { ir: jsxToIR(ctx), ctx }
}

describe('import-scoped recognition for <Async> / <Region>', () => {
  test('<Async> imported from @barefootjs/client lowers to IRAsync', () => {
    const { ir: root, ctx } = ir(`
      import { Async } from '@barefootjs/client'
      export function Page() {
        return <div><Async fallback={<p>Loading</p>}><Body /></Async></div>
      }
    `)
    expect(ctx.errors.filter(e => e.severity === 'error')).toEqual([])
    const div = root as IRElement
    const async = div.children.find(c => c.type === 'async') as IRAsync
    expect(async?.type).toBe('async')
  })

  test('<Region> imported from @barefootjs/client lowers to a region element', () => {
    const { ir: root } = ir(`
      import { Region } from '@barefootjs/client'
      export function Shell({ children }) {
        return <div><Region>{children}</Region></div>
      }
    `)
    const div = root as IRElement
    const region = div.children.find(
      (c): c is IRElement => c.type === 'element' && c.regionId !== undefined,
    )
    expect(region).toBeDefined()
  })

  test('aliased import `Async as Boundary` recognises <Boundary> as the built-in', () => {
    const { ir: root } = ir(`
      import { Async as Boundary } from '@barefootjs/client'
      export function Page() {
        return <Boundary fallback={<p>Loading</p>}><Body /></Boundary>
      }
    `)
    expect((root as IRAsync).type).toBe('async')
  })

  test("a user's own <Async> (imported elsewhere) is NOT lowered and emits no diagnostic", () => {
    const { ir: root, ctx } = ir(`
      import { Async } from './my-async'
      export function Page() {
        return <div><Async fallback={<p>x</p>}><Body /></Async></div>
      }
    `)
    expect(ctx.errors.find(e => e.code === ErrorCodes.BUILTIN_REQUIRES_IMPORT)).toBeUndefined()
    const div = root as IRElement
    expect(div.children.some(c => c.type === 'async')).toBe(false)
    const comp = div.children.find((c): c is IRComponent => c.type === 'component')
    expect(comp?.name).toBe('Async')
  })

  test('a locally declared Async component is NOT treated as the built-in', () => {
    const { ir: root, ctx } = ir(`
      function Async(props) { return <section>{props.children}</section> }
      export function Page() {
        return <Async fallback={<p>x</p>}><Body /></Async>
      }
    `)
    expect(ctx.errors.find(e => e.code === ErrorCodes.BUILTIN_REQUIRES_IMPORT)).toBeUndefined()
    expect((root as IRElement).type).not.toBe('async')
  })

  test('bare <Async> with no import and no binding reports BF054', () => {
    const { ctx } = ir(`
      export function Page() {
        return <Async fallback={<p>Loading</p>}><Body /></Async>
      }
    `)
    const err = ctx.errors.find(e => e.code === ErrorCodes.BUILTIN_REQUIRES_IMPORT)
    expect(err).toBeDefined()
    expect(err?.severity).toBe('error')
    expect(err?.message).toContain('@barefootjs/client')
  })

  test('a type-only import does NOT scope the built-in and does not suppress BF054', () => {
    // `import type { Async }` brings no value binding into scope — the design
    // is import-value-required, so <Async> must still raise BF054.
    const { ir: root, ctx } = ir(`
      import type { Async } from '@barefootjs/client'
      export function Page() {
        return <Async fallback={<p>Loading</p>}><Body /></Async>
      }
    `)
    expect((root as IRElement).type).not.toBe('async')
    expect(ctx.errors.find(e => e.code === ErrorCodes.BUILTIN_REQUIRES_IMPORT)).toBeDefined()
  })

  test('a per-specifier type-only import (`import { type Async }`) does NOT scope the built-in', () => {
    const { ir: root, ctx } = ir(`
      import { type Async } from '@barefootjs/client'
      export function Page() {
        return <Async fallback={<p>Loading</p>}><Body /></Async>
      }
    `)
    expect((root as IRElement).type).not.toBe('async')
    expect(ctx.errors.find(e => e.code === ErrorCodes.BUILTIN_REQUIRES_IMPORT)).toBeDefined()
  })

  test('a value specifier alongside a type-only one is still recognised (`import { type Async, Region }`)', () => {
    const { ir: root } = ir(`
      import { type Async, Region } from '@barefootjs/client'
      export function Shell({ children }) {
        return <div><Region>{children}</Region></div>
      }
    `)
    const div = root as IRElement
    expect(div.children.some(c => c.type === 'element' && c.regionId !== undefined)).toBe(true)
  })

  test('bare <Region /> with no import reports BF054', () => {
    const { ctx } = ir(`
      export function Shell() {
        return <Region />
      }
    `)
    expect(ctx.errors.find(e => e.code === ErrorCodes.BUILTIN_REQUIRES_IMPORT)).toBeDefined()
  })
})

describe('stripClientBuiltinImports (emit-time elision)', () => {
  const loc = { file: 'x.tsx', line: 1, column: 1 }
  const imp = (source: string, names: string[]): ImportInfo => ({
    source,
    isTypeOnly: false,
    loc,
    specifiers: names.map(n => ({ name: n, alias: null, isDefault: false, isNamespace: false })),
  })

  test('drops the @barefootjs/client import when it only carried built-ins', () => {
    expect(stripClientBuiltinImports([imp('@barefootjs/client', ['Async', 'Region'])])).toEqual([])
  })

  test('keeps non-built-in specifiers and drops the built-ins', () => {
    const out = stripClientBuiltinImports([imp('@barefootjs/client', ['createSignal', 'Async'])])
    expect(out).toHaveLength(1)
    expect(out[0].specifiers.map(s => s.name)).toEqual(['createSignal'])
  })

  test('leaves imports from other sources untouched', () => {
    const other = imp('./my-async', ['Async'])
    expect(stripClientBuiltinImports([other])).toEqual([other])
  })

  test('does NOT strip type-only imports (never a runtime phantom)', () => {
    const typeOnly: ImportInfo = { ...imp('@barefootjs/client', ['Async', 'Region']), isTypeOnly: true }
    expect(stripClientBuiltinImports([typeOnly])).toEqual([typeOnly])
  })

  test('preserves a side-effect import of @barefootjs/client', () => {
    const sideEffect = imp('@barefootjs/client', [])
    expect(stripClientBuiltinImports([sideEffect])).toEqual([sideEffect])
  })

  test('does NOT strip a per-specifier type-only built-in, but strips the value one', () => {
    const mixed: ImportInfo = {
      source: '@barefootjs/client',
      isTypeOnly: false,
      loc,
      specifiers: [
        { name: 'Async', alias: null, isDefault: false, isNamespace: false, isTypeOnly: true },
        { name: 'Region', alias: null, isDefault: false, isNamespace: false, isTypeOnly: false },
      ],
    }
    const out = stripClientBuiltinImports([mixed])
    expect(out).toHaveLength(1)
    expect(out[0].specifiers.map(s => s.name)).toEqual(['Async'])
    expect(out[0].specifiers[0].isTypeOnly).toBe(true)
  })
})
