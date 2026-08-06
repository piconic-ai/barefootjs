/**
 * BF050 single/multi symmetry (#2537).
 *
 * BF050 ("shared ts.Program required") exists so strict builds fail loudly
 * instead of silently relying on the per-file Program fallback, whose
 * virtual host can fail module resolution and collapse Reactive<T> brands
 * to `any`. The single-component path always emitted it for a
 * brand-package import compiled without `options.program` — but the
 * multi-component path pre-builds a per-file Program to amortize it across
 * siblings and passed it down as if it were shared, suppressing the
 * diagnostic. Same import, opposite verdicts, decided by how many
 * components share the file.
 *
 * Post-fix, BF050 keys off whether the CALLER supplied `options.program`
 * (`analyzeComponent`'s `programIsShared`), in both paths — and a
 * multi-component file reports it once, not once per sibling.
 */

import { describe, test, expect } from 'bun:test'
import ts from 'typescript'
import path from 'node:path'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

const MULTI_SOURCE = `
  'use client'
  import { createForm } from '@barefootjs/form'

  export function ProfileForm() {
    const form = createForm()
    return <form><input /></form>
  }

  export function AccountForm() {
    const form = createForm()
    return <form><button>Save</button></form>
  }
`

const SINGLE_SOURCE = `
  'use client'
  import { createForm } from '@barefootjs/form'

  export function ProfileForm() {
    const form = createForm()
    return <form><input /></form>
  }
`

function bf050s(source: string, program?: ts.Program) {
  const result = compileJSX(source, '/virtual/forms.tsx', { adapter, program })
  return result.errors.filter(e => e.code === 'BF050')
}

/**
 * A minimal Program whose roots include the component file — enough for
 * `analyzeComponent` to accept it as the shared Program (text must match).
 * Brand resolution isn't the point here (the import won't resolve from
 * /virtual); BF050 only keys off whether a shared Program was supplied.
 */
function inMemoryProgram(source: string): ts.Program {
  const filePath = path.resolve('/virtual/forms.tsx')
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
      if (path.resolve(fileName) === filePath) {
        return ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TSX)
      }
      return defaultHost.getSourceFile(fileName, languageVersion)
    },
    fileExists(fileName) {
      return path.resolve(fileName) === filePath || defaultHost.fileExists(fileName)
    },
    readFile(fileName) {
      if (path.resolve(fileName) === filePath) return source
      return defaultHost.readFile(fileName)
    },
  }
  return ts.createProgram([filePath], compilerOptions, host)
}

describe('BF050 fires symmetrically for single- and multi-component files', () => {
  test('single-component brand import without options.program: BF050', () => {
    expect(bf050s(SINGLE_SOURCE)).toHaveLength(1)
  })

  test('multi-component brand import without options.program: BF050 — the per-file amortization no longer masks it', () => {
    expect(bf050s(MULTI_SOURCE)).toHaveLength(1)
  })

  test('multi-component: exactly ONE BF050 for the file, not one per sibling component', () => {
    // Covered by the length assertion above, but pinned separately so a
    // future "just push ctx.errors" refactor that reintroduces per-sibling
    // duplicates fails a test whose NAME says what broke.
    const errors = bf050s(MULTI_SOURCE)
    expect(errors.length).toBeLessThanOrEqual(1)
  })

  test('single-component with a caller-supplied shared Program: no BF050', () => {
    expect(bf050s(SINGLE_SOURCE, inMemoryProgram(SINGLE_SOURCE))).toHaveLength(0)
  })

  test('multi-component with a caller-supplied shared Program: no BF050', () => {
    expect(bf050s(MULTI_SOURCE, inMemoryProgram(MULTI_SOURCE))).toHaveLength(0)
  })
})
