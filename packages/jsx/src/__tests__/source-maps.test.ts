/**
 * Source map generation tests.
 *
 * Verifies that compiled client JS produces valid V3 source maps
 * that map back to the original .tsx source locations.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { SourceMapGenerator, buildSourceMapFromIR } from '../ir-to-client-js/source-map'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { buildMetadata } from '../compiler'
import { generateClientJs, analyzeClientNeeds } from '../ir-to-client-js'
import type { ComponentIR, SourceMapV3 } from '../types'

const adapter = new TestAdapter()

describe('VLQ encoding', () => {
  test('SourceMapGenerator produces valid V3 format', () => {
    const gen = new SourceMapGenerator('test.client.js')
    gen.addSource('test.tsx')
    gen.addMappingFromLoc(0, 0, { file: 'test.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 10 } })

    const map = gen.toJSON()
    expect(map.version).toBe(3)
    expect(map.file).toBe('test.client.js')
    expect(map.sources).toEqual(['test.tsx'])
    expect(map.mappings).toBeTruthy()
    expect(typeof map.mappings).toBe('string')
  })

  test('multiple mappings across lines', () => {
    const gen = new SourceMapGenerator('out.js')
    gen.addSource('src.tsx')

    // Line 0, col 0 → src.tsx line 5, col 2
    gen.addMappingFromLoc(0, 0, { file: 'src.tsx', start: { line: 5, column: 2 }, end: { line: 5, column: 10 } })
    // Line 2, col 4 → src.tsx line 10, col 0
    gen.addMappingFromLoc(2, 4, { file: 'src.tsx', start: { line: 10, column: 0 }, end: { line: 10, column: 20 } })

    const map = gen.toJSON()
    // Should have semicolons separating lines
    expect(map.mappings).toContain(';')
    expect(map.sources).toEqual(['src.tsx'])
  })
})

describe('Source map generation via compiler', () => {
  test('compileJSXSync with sourceMaps: true produces source map file', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return (
          <button onClick={() => setCount(n => n + 1)}>
            Count: {count()}
          </button>
        )
      }
    `

    const result = compileJSXSync(source, 'Counter.tsx', { adapter, sourceMaps: true })

    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    expect(clientJs?.content).toContain('//# sourceMappingURL=')

    const sourceMap = result.files.find(f => f.type === 'sourceMap')
    expect(sourceMap).toBeDefined()
    expect(sourceMap?.path).toEndWith('.client.js.map')

    const map = JSON.parse(sourceMap!.content) as SourceMapV3
    expect(map.version).toBe(3)
    expect(map.sources).toContain('Counter.tsx')
    expect(map.mappings.length).toBeGreaterThan(0)
  })

  test('compileJSXSync without sourceMaps does not produce source map', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <button onClick={() => setCount(n => n + 1)}>Count: {count()}</button>
      }
    `

    const result = compileJSXSync(source, 'Counter.tsx', { adapter })

    const sourceMap = result.files.find(f => f.type === 'sourceMap')
    expect(sourceMap).toBeUndefined()

    const clientJs = result.files.find(f => f.type === 'clientJs')
    if (clientJs) {
      expect(clientJs.content).not.toContain('//# sourceMappingURL=')
    }
  })

  test('source map maps signals to original source locations', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Counter() {
        const [count, setCount] = createSignal(0)
        return <div>{count()}</div>
      }
    `

    const result = compileJSXSync(source, 'Counter.tsx', { adapter, sourceMaps: true })

    const sourceMapFile = result.files.find(f => f.type === 'sourceMap')
    expect(sourceMapFile).toBeDefined()

    const map = JSON.parse(sourceMapFile!.content) as SourceMapV3
    // Source map should reference the original file
    expect(map.sources).toContain('Counter.tsx')
    // Should have non-empty mappings (signal + effect + init function)
    expect(map.mappings.replace(/;/g, '')).not.toBe('')
  })

  test('source map for component with effects and memos', () => {
    const source = `
      'use client'
      import { createSignal, createEffect, createMemo } from '@barefootjs/client-runtime'

      export function Dashboard() {
        const [count, setCount] = createSignal(0)
        const doubled = createMemo(() => count() * 2)
        createEffect(() => console.log(count()))
        return <div>{doubled()}</div>
      }
    `

    const result = compileJSXSync(source, 'Dashboard.tsx', { adapter, sourceMaps: true })

    const sourceMapFile = result.files.find(f => f.type === 'sourceMap')
    expect(sourceMapFile).toBeDefined()

    const map = JSON.parse(sourceMapFile!.content) as SourceMapV3
    expect(map.sources).toContain('Dashboard.tsx')
    // Multiple lines should have mappings (signal, memo, effect, init)
    const nonEmptyLines = map.mappings.split(';').filter(s => s.length > 0)
    expect(nonEmptyLines.length).toBeGreaterThanOrEqual(3)
  })
})

describe('buildSourceMapFromIR', () => {
  test('generates mappings for a compiled component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      export function Toggle() {
        const [on, setOn] = createSignal(false)
        return <button onClick={() => setOn(v => !v)}>{on() ? 'ON' : 'OFF'}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Toggle.tsx')
    const ir = jsxToIR(ctx)!
    const metadata = buildMetadata(ctx)
    const componentIR: ComponentIR = {
      version: '0.1',
      metadata,
      root: ir,
      errors: [],
    }
    componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)
    const clientJs = generateClientJs(componentIR)

    const map = buildSourceMapFromIR(clientJs, componentIR, 'Toggle.client.js')

    expect(map.version).toBe(3)
    expect(map.file).toBe('Toggle.client.js')
    expect(map.sources).toContain('Toggle.tsx')
    expect(map.mappings.length).toBeGreaterThan(0)
  })
})
