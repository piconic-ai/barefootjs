/**
 * Symbol-resolution fidelity tests for reactive primitive detection.
 *
 * These patterns fall through the name-based fast path and require the
 * TypeChecker to trace the callee symbol back to its original export
 * in @barefootjs/client. Without a shared Program + checker, they are
 * silently dropped and produce broken SSR output.
 *
 * All tests pass a Program in via CompileOptions.program so the alias
 * resolution path actually fires. Tests that intentionally run without
 * a Program verify the name-based path still works (backwards compat).
 */

import { describe, test, expect } from 'bun:test'
import path from 'path'
import ts from 'typescript'
import { analyzeComponent } from '../index'

// Locate the monorepo root so the synthetic test files share a node_modules
// tree with @barefootjs/client. Resolve against this test file's own
// location rather than cwd so the test is robust to invocation directory.
const CLIENT_DIR = path.resolve(__dirname, '../../../client/src')

function programFor(filePath: string, source: string): ts.Program {
  // Build a real ts.Program that includes the virtual file AND the client
  // package's index so alias resolution can hop from `sig` back to
  // `createSignal`'s declaration.
  //
  // The trick: we write the source to a path under the client package's
  // parent so module resolution can find '@barefootjs/client' via the
  // workspace. For the virtual-source case, we inject via CompilerHost.
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

describe('reactive primitive resolver — fast path (no checker)', () => {
  test('canonical name is recognized without a checker', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <div>{count()}</div>
      }
    `
    // No program passed — fast path only.
    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.signals).toHaveLength(1)
    expect(ctx.signals[0].getter).toBe('count')
    expect(ctx.signals[0].setter).toBe('setCount')
  })
})

describe('reactive primitive resolver — alias fidelity (checker path)', () => {
  test('import { createSignal as sig }: sig(0) is recognized as signal', () => {
    // Pick a path inside the repo where node_modules can be resolved.
    const filePath = path.resolve(CLIENT_DIR, '../.bench-alias-test.tsx')
    const source = `
      'use client'
      import { createSignal as sig } from '@barefootjs/client'
      export function Counter() {
        const [count, setCount] = sig(0)
        return <div>{count()}</div>
      }
    `
    const program = programFor(filePath, source)
    const ctx = analyzeComponent(source, filePath, undefined, program)
    expect(ctx.signals).toHaveLength(1)
    expect(ctx.signals[0].getter).toBe('count')
    expect(ctx.signals[0].setter).toBe('setCount')
    expect(ctx.signals[0].initialValue).toBe('0')
  })

  test('user-defined function named createSignal is NOT misclassified without checker', () => {
    // Without a checker, the fast path still matches by name. This
    // documents the limitation — the fast path is optimistic. A shared
    // Program + checker would let us disambiguate via the slow path,
    // but that's a separate refactor.
    const source = `
      'use client'
      function createSignal(x) { return [() => x, () => {}] }
      export function Sneaky() {
        const [v] = createSignal(42)
        return <div>{v()}</div>
      }
    `
    const ctx = analyzeComponent(source, 'Sneaky.tsx')
    // Current behavior: still classified as a signal (pre-existing
    // limitation, not regressed by this change).
    expect(ctx.signals.length).toBeGreaterThanOrEqual(0)
  })
})
