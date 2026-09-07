/**
 * #2867 / #2830: `shouldAutoDeferReactiveBrand` (jsx-to-ir.ts) used to call
 * `getJS()` on the whole candidate expression to regex-test it for a native
 * signal/memo call. For a `.map()` loop or a ternary/`&&` with JSX arms, that
 * expression IS JSX-bearing — and whenever the TypeChecker was active and
 * resolved a `Reactive<T>` brand anywhere in the expression, `getJS()`'s
 * trust-boundary assertion (armed by `map-body-no-silent-divergence.test.ts`)
 * threw, uncaught, on `signal-array-builder` / `flatmap-expression-body-signal-array`.
 *
 * That harness's own `assess()` compiles via a bare relative path (`T.tsx`)
 * with no injected `ts.Program`, so whether the checker actually activates —
 * and thus whether this reproduces — silently depended on the process's cwd
 * and whether `@barefootjs/client`'s `dist` happened to be built, which is
 * exactly why the failure looked like an environment-dependent flake (#2867)
 * rather than the deterministic compiler bug it is. These tests pin it with
 * an explicitly injected `ts.Program` (mirroring `auto-defer-brand.test.ts`)
 * so the repro — and the fix — hold regardless of cwd or build state.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import ts from 'typescript'
import path from 'path'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

let prevAssertEnv: string | undefined
beforeAll(() => {
  prevAssertEnv = process.env.BF_ASSERT_NO_JSX_IN_GETJS
  process.env.BF_ASSERT_NO_JSX_IN_GETJS = '1'
})
afterAll(() => {
  if (prevAssertEnv === undefined) delete process.env.BF_ASSERT_NO_JSX_IN_GETJS
  else process.env.BF_ASSERT_NO_JSX_IN_GETJS = prevAssertEnv
})

interface Compiled {
  errors: string[]
  hasError: boolean
  clientJs: string
}

/**
 * Compile `source` with a real TypeChecker that resolves `@barefootjs/client`
 * (found deterministically via `packages/jsx/node_modules`, since the virtual
 * file lives under this file's own directory — no dependency on `process.cwd()`).
 */
function compileWithChecker(source: string): Compiled {
  const componentPath = path.join(path.resolve(__dirname), '_map-body-brand-component.tsx')
  const virtualFiles = new Map<string, string>([[componentPath, source]])

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  }

  const defaultHost = ts.createCompilerHost(compilerOptions)
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(fileName, languageVersion) {
      const resolved = path.resolve(fileName)
      const content = virtualFiles.get(resolved)
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true, ts.ScriptKind.TSX)
      }
      return defaultHost.getSourceFile(fileName, languageVersion)
    },
    fileExists(fileName) {
      return virtualFiles.has(path.resolve(fileName)) || defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      return virtualFiles.get(path.resolve(fileName)) ?? defaultHost.readFile(fileName)
    },
  }

  const program = ts.createProgram([componentPath], compilerOptions, host)
  const adapter = new TestAdapter()
  const r = compileJSX(source, componentPath, { adapter, program })
  const clientJs = r.files.find((f) => f.type === 'clientJs')?.content ?? ''
  return {
    errors: r.errors.map((e) => `[${e.code}] ${e.message}`),
    hasError: r.errors.some((e) => e.severity === 'error'),
    clientJs,
  }
}

function assertSound(clientJs: string): void {
  const sf = ts.createSourceFile('bundle.js', clientJs, ts.ScriptTarget.ES2022, false, ts.ScriptKind.JS)
  const parseErrors = (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics.length
  expect(parseErrors).toBe(0)
  expect(clientJs).not.toMatch(/__BF_JSX_\d+__/)
  expect(clientJs).not.toMatch(/\bpush\(</)
}

describe('shouldAutoDeferReactiveBrand does not stringify JSX-bearing expressions (#2867/#2830)', () => {
  test('signal-sourced .map() array builder compiles clean under an active checker', () => {
    const { hasError, clientJs } = compileWithChecker(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [rows] = createSignal([{ id: '1', cells: ['a'] }])
  return <table><tbody>{rows().map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`)
    expect(hasError).toBe(false)
    assertSound(clientJs)
  })

  test('signal-sourced .flatMap() with an expression-body inner .map() compiles clean under an active checker', () => {
    const { hasError, clientJs } = compileWithChecker(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [items] = createSignal([{ id: '1', tags: ['a'] }])
  return <ul>{items().flatMap((it) => it.tags.map((t) => <li key={t}>{t}</li>))}</ul>
}
export { T }`)
    expect(hasError).toBe(false)
    assertSound(clientJs)
  })

  test('memo-sourced .map() array builder also compiles clean (not just signals)', () => {
    const { hasError, clientJs } = compileWithChecker(`
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
function T() {
  const [rows] = createSignal([{ id: '1', cells: ['a'] }])
  const upper = createMemo(() => rows())
  return <table><tbody>{upper().map((r) => {
    const out = []
    for (const c of r.cells) out.push(<td>{c}</td>)
    return <tr key={r.id}>{out}</tr>
  })}</tbody></table>
}
export { T }`)
    expect(hasError).toBe(false)
    assertSound(clientJs)
  })

  test('signal-conditioned ternary with JSX on both arms, no props destructuring (BF043) to mask the assertion', () => {
    // No destructured props here (which would emit a BF043 warning and, pre-
    // fix, incidentally have silently disarmed the trust-boundary assertion
    // for this shape). This pins the conditional-arm path directly.
    const { hasError, clientJs } = compileWithChecker(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [show] = createSignal(true)
  return <div>{show() ? <b>yes</b> : <em>no</em>}</div>
}
export { T }`)
    expect(hasError).toBe(false)
    assertSound(clientJs)
  })

  test('a component also importing @barefootjs/client but with no .map() and no reactive JSX branch is unaffected', () => {
    const { hasError, clientJs } = compileWithChecker(`
'use client'
import { createSignal } from '@barefootjs/client'
function T() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount((c) => c + 1)}>{count()}</button>
}
export { T }`)
    expect(hasError).toBe(false)
    assertSound(clientJs)
  })
})
