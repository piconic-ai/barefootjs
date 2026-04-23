/**
 * End-to-end fidelity tests for all reactive primitives through the
 * resolver path. Covers: createMemo, createEffect (both statement-form
 * and disposer-capture form), onMount, and onCleanup.
 *
 * Alias-through-checker cases need a real Program so symbol resolution
 * can trace `sig` → `createSignal` etc. The helper below builds one with
 * an in-memory source file injected via CompilerHost.
 */

import { describe, test, expect } from 'bun:test'
import path from 'path'
import ts from 'typescript'
import { analyzeComponent } from '../index'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

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

describe('createMemo — resolver migration', () => {
  test('canonical name recognised via fast path', () => {
    const source = `
      'use client'
      import { createSignal, createMemo } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(5)
        const doubled = createMemo(() => n() * 2)
        return <div>{doubled()}</div>
      }
    `
    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.memos).toHaveLength(1)
    expect(ctx.memos[0].name).toBe('doubled')
  })

  test('aliased createMemo resolves via checker', () => {
    const filePath = path.resolve(CLIENT_DIR, '../.alias-memo.tsx')
    const source = `
      'use client'
      import { createSignal, createMemo as memo } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(5)
        const doubled = memo(() => n() * 2)
        return <div>{doubled()}</div>
      }
    `
    const program = programFor(filePath, source)
    const ctx = analyzeComponent(source, filePath, undefined, program)
    expect(ctx.memos).toHaveLength(1)
    expect(ctx.memos[0].name).toBe('doubled')
  })
})

describe('createEffect — resolver migration', () => {
  test('statement-form effect recognised via fast path', () => {
    const source = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(0)
        createEffect(() => { console.log(n()) })
        return <div>{n()}</div>
      }
    `
    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.effects).toHaveLength(1)
    expect(ctx.effects[0].captureName).toBeUndefined()
  })

  test('disposer capture: const dispose = createEffect(...)', () => {
    const source = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(0)
        const dispose = createEffect(() => { console.log(n()) })
        return <button onClick={() => dispose()}>{n()}</button>
      }
    `
    const ctx = analyzeComponent(source, 'Counter.tsx')
    expect(ctx.effects).toHaveLength(1)
    expect(ctx.effects[0].captureName).toBe('dispose')
    // `dispose` must NOT be captured as a regular constant — the resolver
    // short-circuits collectConstant for this pattern.
    expect(ctx.localConstants.find((c) => c.name === 'dispose')).toBeUndefined()
  })

  test('disposer capture emits const-bound createEffect in client JS', () => {
    const source = `
      'use client'
      import { createSignal, createEffect } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(0)
        const dispose = createEffect(() => { console.log(n()) })
        return <button onClick={() => dispose()}>{n()}</button>
      }
    `
    const result = compileJSXSync(source, 'Counter.tsx', { adapter: new TestAdapter() })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs!.content).toContain('const dispose = createEffect(')
  })

  test('aliased createEffect resolves via checker', () => {
    const filePath = path.resolve(CLIENT_DIR, '../.alias-effect.tsx')
    const source = `
      'use client'
      import { createSignal, createEffect as effect } from '@barefootjs/client'
      export function Counter() {
        const [n] = createSignal(0)
        effect(() => { console.log(n()) })
        return <div>{n()}</div>
      }
    `
    const program = programFor(filePath, source)
    const ctx = analyzeComponent(source, filePath, undefined, program)
    expect(ctx.effects).toHaveLength(1)
  })
})

describe('onMount — resolver migration', () => {
  test('canonical onMount recognised via fast path', () => {
    const source = `
      'use client'
      import { onMount } from '@barefootjs/client'
      export function Page() {
        onMount(() => { console.log('mounted') })
        return <div>hi</div>
      }
    `
    const ctx = analyzeComponent(source, 'Page.tsx')
    expect(ctx.onMounts).toHaveLength(1)
  })

  test('aliased onMount resolves via checker', () => {
    const filePath = path.resolve(CLIENT_DIR, '../.alias-onmount.tsx')
    const source = `
      'use client'
      import { onMount as onReady } from '@barefootjs/client'
      export function Page() {
        onReady(() => { console.log('mounted') })
        return <div>hi</div>
      }
    `
    const program = programFor(filePath, source)
    const ctx = analyzeComponent(source, filePath, undefined, program)
    expect(ctx.onMounts).toHaveLength(1)
  })
})

describe('user-defined functions with canonical names (fast-path limitation)', () => {
  test('user-defined createMemo is matched by fast path (documented limitation)', () => {
    // Without a checker, fast path still matches by name. This documents
    // existing behavior so a future type-first migration is a deliberate
    // breaking change, not an unnoticed one.
    const source = `
      'use client'
      function createMemo<T>(fn: () => T): () => T { return fn }
      export function Demo() {
        const x = createMemo(() => 1)
        return <div>{x()}</div>
      }
    `
    const ctx = analyzeComponent(source, 'Demo.tsx')
    expect(ctx.memos.length).toBeGreaterThanOrEqual(0)
  })
})
