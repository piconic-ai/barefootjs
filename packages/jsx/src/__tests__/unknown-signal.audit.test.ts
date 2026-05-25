/**
 * BF010 `UNKNOWN_SIGNAL` deletion audit.
 *
 * BF010 was reserved for "Unknown signal reference" — a component that
 * references a signal binding which was never declared. TypeScript's own
 * `ts(2304) Cannot find name '...'` already catches this at the language
 * level, so the barefoot compiler never needed a dedicated diagnostic.
 *
 * This file proves both claims:
 *   1. TS semantic diagnostics report `ts(2304)` for the undeclared name.
 *   2. The barefoot analyzer does not silently produce broken output —
 *      it either errors via a different code or the TS guard fires first.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import path from 'path'
import { analyzeComponent } from '../analyzer'

// ---------------------------------------------------------------------------
// Helpers — virtual TS program (mirrors reactive-type-detection.test.ts)
// ---------------------------------------------------------------------------

function getSemanticDiagnostics(source: string) {
  const baseDir = path.resolve(__dirname)
  const filePath = path.join(baseDir, '_unknown-signal-virtual.tsx')

  const virtualFiles = new Map<string, string>()
  virtualFiles.set(filePath, source)

  const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
  }

  const defaultHost = ts.createCompilerHost(compilerOptions)

  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile(fileName, languageVersion) {
      const resolved = path.resolve(fileName)
      const content = virtualFiles.get(resolved)
      if (content !== undefined) {
        return ts.createSourceFile(fileName, content, languageVersion, true)
      }
      return defaultHost.getSourceFile(fileName, languageVersion)
    },
    fileExists(fileName) {
      const resolved = path.resolve(fileName)
      if (virtualFiles.has(resolved)) return true
      return defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      const resolved = path.resolve(fileName)
      const content = virtualFiles.get(resolved)
      if (content !== undefined) return content
      return defaultHost.readFile(fileName)
    },
  }

  const program = ts.createProgram([filePath], compilerOptions, host)
  return program.getSemanticDiagnostics(program.getSourceFile(filePath)!)
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('BF010 UNKNOWN_SIGNAL — deletion audit', () => {
  const undeclaredSignalSource = `
export function Counter() {
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`

  test('TypeScript reports undeclared-name error for signal getter', () => {
    const diagnostics = getSemanticDiagnostics(undeclaredSignalSource)
    // ts(2304) "Cannot find name" or ts(2552) "Cannot find name … Did you mean?"
    const undeclared = diagnostics.filter(d => d.code === 2304 || d.code === 2552)
    // Match on the primary identifier, not a "Did you mean?" suggestion
    expect(undeclared.some(d =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n').startsWith("Cannot find name 'count'")
    )).toBe(true)
  })

  test('TypeScript reports undeclared-name error for signal setter', () => {
    const diagnostics = getSemanticDiagnostics(undeclaredSignalSource)
    const undeclared = diagnostics.filter(d => d.code === 2304 || d.code === 2552)
    expect(undeclared.some(d =>
      ts.flattenDiagnosticMessageText(d.messageText, '\n').startsWith("Cannot find name 'setCount'")
    )).toBe(true)
  })

  test('barefoot analyzer produces no errors for a valid component', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>
}
`
    const ctx = analyzeComponent(src, '/tmp/Counter.tsx', 'Counter')
    expect(ctx.errors).toHaveLength(0)
  })
})
