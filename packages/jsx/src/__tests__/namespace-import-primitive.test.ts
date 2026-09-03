/**
 * #2771 — `import * as bf from '@barefootjs/client'` followed by
 * `bf.createSignal(0)` (or any other reactive primitive accessed off the
 * namespace binding) compiled with ZERO diagnostics, but `resolvePrimitiveKind`'s
 * fast path only matches a bare identifier callee — the checker-based slow
 * path that DOES understand a namespace-qualified call only runs when a
 * shared `ts.Program` is supplied (`CompileOptions.program`). Without one,
 * the declaration is silently dropped from the compiled output and every
 * reference to it throws `ReferenceError` at hydrate.
 *
 * BF013 refuses loudly instead, gated on NON-recognition — a compile that
 * DOES supply a program (see `primitive-resolver-alias.test.ts`'s pattern)
 * must never see this diagnostic, since that path already lowers the shape
 * correctly.
 */
import { describe, test, expect } from 'bun:test'
import path from 'path'
import ts from 'typescript'
import { compileJSX } from '../compiler'
import { analyzeComponent } from '../index'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function errorsFor(source: string): Array<{ code?: string; severity: string }> {
  const result = compileJSX(source, 'Counter.tsx', { adapter })
  return result.errors.map(e => ({ code: e.code, severity: e.severity }))
}

function bf013(source: string) {
  return errorsFor(source).find(e => e.code === 'BF013')
}

describe('#2771 — BF013: reactive primitive called through an unresolved namespace import', () => {
  test('bf.createSignal(...) (array destructure) fires BF013', () => {
    const result = compileJSX(
      `
      'use client'
      import * as bf from '@barefootjs/client'
      export function Counter() {
        const [n, setN] = bf.createSignal(0)
        return <button onClick={() => setN(n() + 1)}>{n()}</button>
      }
    `,
      'Counter.tsx',
      { adapter },
    )
    const err = result.errors.find(e => e.code === 'BF013')
    expect(err).toBeDefined()
    expect(err!.severity).toBe('error')
    expect(err!.message).toContain('bf.createSignal')
    expect(err!.suggestion?.escape).toEqual([{ kind: 'rewrite' }])
  })

  test('bf.createMemo(...) (array destructure) fires BF013', () => {
    const err = bf013(`
      'use client'
      import * as bf from '@barefootjs/client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(1)
        const [doubled] = bf.createMemo(() => n() * 2)
        return <div>{doubled()}</div>
      }
    `)
    expect(err).toBeDefined()
  })

  test('bf.createEffect(...) (expression statement) fires BF013', () => {
    const err = bf013(`
      'use client'
      import * as bf from '@barefootjs/client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(0)
        bf.createEffect(() => { console.log(n()) })
        return <div>{n()}</div>
      }
    `)
    expect(err).toBeDefined()
  })

  test('bf.onMount(...) (expression statement) fires BF013', () => {
    const err = bf013(`
      'use client'
      import * as bf from '@barefootjs/client'
      export function Counter() {
        bf.onMount(() => { console.log('mounted') })
        return <div>static</div>
      }
    `)
    expect(err).toBeDefined()
  })

  test('bf.createSignal(0)[0] (element access) fires BF013', () => {
    const err = bf013(`
      'use client'
      import * as bf from '@barefootjs/client'
      export function Counter() {
        const n = bf.createSignal(0)[0]
        return <div>{n()}</div>
      }
    `)
    expect(err).toBeDefined()
  })

  test('a bare named import is unaffected (no BF013)', () => {
    const errs = errorsFor(`
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [n, setN] = createSignal(0)
        return <button onClick={() => setN(n() + 1)}>{n()}</button>
      }
    `)
    expect(errs.find(e => e.code === 'BF013')).toBeUndefined()
  })

  test('a namespace import of a DIFFERENT module is unaffected (no BF013)', () => {
    const result = compileJSX(
      `
      'use client'
      import * as store from './store'
      export function Counter() {
        const [n, setN] = store.createSignal(0)
        return <button onClick={() => setN(n() + 1)}>{n()}</button>
      }
    `,
      'Counter.tsx',
      { adapter },
    )
    expect(result.errors.find(e => e.code === 'BF013')).toBeUndefined()
  })

  test('a component-local binding shadowing the namespace name is unaffected (no BF013)', () => {
    const result = compileJSX(
      `
      'use client'
      import * as bf from '@barefootjs/client'
      export function Counter() {
        const bf = { createSignal: (x: number) => [() => x, (v: number) => {}] as const }
        const [n, setN] = bf.createSignal(0)
        return <button onClick={() => setN(n() + 1)}>{n()}</button>
      }
    `,
      'Counter.tsx',
      { adapter },
    )
    expect(result.errors.find(e => e.code === 'BF013')).toBeUndefined()
  })

  test('a type-only namespace import is unaffected (no BF013)', () => {
    const result = compileJSX(
      `
      'use client'
      import type * as bf from '@barefootjs/client'
      export function Counter() {
        return <div>static</div>
      }
    `,
      'Counter.tsx',
      { adapter },
    )
    expect(result.errors.find(e => e.code === 'BF013')).toBeUndefined()
  })
})

describe('#2771 — checker-path pin: a shared Program resolves the namespace and never fires BF013', () => {
  const CLIENT_DIR = path.resolve(__dirname, '../../../client/src')

  function programFor(filePath: string, source: string): ts.Program {
    const absolute = path.resolve(filePath)
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.Latest,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      esModuleInterop: true,
      baseUrl: path.dirname(absolute),
    }
    const defaultHost = ts.createCompilerHost(compilerOptions)
    const host: ts.CompilerHost = {
      ...defaultHost,
      getSourceFile(fileName, languageVersion) {
        if (path.resolve(fileName) === absolute) {
          return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TSX)
        }
        return defaultHost.getSourceFile(fileName, languageVersion)
      },
      fileExists(fileName) {
        if (path.resolve(fileName) === absolute) return true
        return defaultHost.fileExists(fileName)
      },
      readFile(fileName) {
        if (path.resolve(fileName) === absolute) return source
        return defaultHost.readFile(fileName)
      },
    }
    return ts.createProgram([absolute], compilerOptions, host)
  }

  test('with a shared Program, bf.createSignal resolves and BF013 never fires', () => {
    const source = `
      'use client'
      import * as bf from '@barefootjs/client'
      export function Counter() {
        const [n, setN] = bf.createSignal(0)
        return <button onClick={() => setN(n() + 1)}>{n()}</button>
      }
    `
    const testFile = path.join(CLIENT_DIR, '__ns_primitive_checker_pin__.tsx')
    const program = programFor(testFile, source)
    const ctx = analyzeComponent(source, testFile, undefined, program)
    expect(ctx.signals.length).toBe(1)
    expect(ctx.errors.find(e => e.code === 'BF013')).toBeUndefined()
  })
})
