/**
 * SSR client-shim import rewrite (#1084).
 *
 * The compiler used to strip every `@barefootjs/client` import from the SSR
 * template, which left bindings like `useContext` undefined when the call
 * site survived reachability analysis. We now rewrite those imports to the
 * adapter-provided shim source so SSR can resolve the symbols.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

const onlyErrors = (errors: { severity?: string }[]) =>
  errors.filter(e => e.severity === 'error')

describe('SSR client-shim rewrite (#1084)', () => {
  test('Hono adapter rewrites @barefootjs/client to the client-shim source', () => {
    const source = `
      'use client'
      import { createMemo, useContext } from '@barefootjs/client'
      import { BarChartContext } from './bar-chart-context'

      export function CartesianGrid() {
        const ctx = useContext(BarChartContext)
        const lines = createMemo(() => {
          const ys = ctx.yScale()
          if (!ys) return []
          return ys.ticks().map((tick) => ({ y: ys(tick) }))
        })
        return <g class="chart-grid">{lines().map((l) => <line key={l.y} y1={l.y} y2={l.y} />)}</g>
      }
    `
    const result = compileJSXSync(source, 'CartesianGrid.tsx', { adapter: new HonoAdapter() })
    expect(onlyErrors(result.errors)).toHaveLength(0)

    const tpl = result.files.find(f => f.type === 'markedTemplate')!
    // Old behaviour: no import survived. New behaviour: shim import emitted.
    expect(tpl.content).toContain("from '@barefootjs/hono/client-shim'")
    expect(tpl.content).not.toMatch(/from '@barefootjs\/client'/)
    // The user's named imports flow into the shim import.
    expect(tpl.content).toMatch(/import \{[^}]*\buseContext\b[^}]*\} from '@barefootjs\/hono\/client-shim'/)
    // The useContext call site is preserved verbatim (no longer dropped).
    expect(tpl.content).toContain('const ctx = useContext(BarChartContext)')
  })

  test('TestAdapter (no clientShimSource) keeps the legacy strip behaviour', () => {
    const source = `
      'use client'
      import { createSignal, useContext } from '@barefootjs/client'

      export function Box() {
        const [n] = createSignal(0)
        return <div>{n()}</div>
      }
    `
    const adapter = new TestAdapter()
    expect((adapter as { clientShimSource?: string }).clientShimSource).toBeUndefined()

    const result = compileJSXSync(source, 'Box.tsx', { adapter })
    expect(onlyErrors(result.errors)).toHaveLength(0)

    const tpl = result.files.find(f => f.type === 'markedTemplate')!
    // No shim source set: imports remain stripped (legacy behaviour).
    expect(tpl.content).not.toContain('@barefootjs/client')
  })

  test('Hono adapter renders <Context.Provider> as provideContextSSR()', () => {
    const source = `
      'use client'
      import { createContext, createSignal } from '@barefootjs/client'
      const Ctx = createContext()
      export function Tabs({ children }) {
        const [active, setActive] = createSignal(0)
        return (
          <Ctx.Provider value={{ active, setActive }}>
            <div>{children}</div>
          </Ctx.Provider>
        )
      }
    `
    const result = compileJSXSync(source, 'Tabs.tsx', { adapter: new HonoAdapter() })
    expect(onlyErrors(result.errors)).toHaveLength(0)

    const tpl = result.files.find(f => f.type === 'markedTemplate')!
    expect(tpl.content).toContain('provideContextSSR(Ctx, { active, setActive }')
    // The helper is auto-imported from the shim even though the user did not
    // reference it in source.
    expect(tpl.content).toMatch(/import \{[^}]*\bprovideContextSSR\b[^}]*\} from '@barefootjs\/hono\/client-shim'/)
  })

  test('Hono adapter merges provideContextSSR into the user-rewritten shim import', () => {
    const source = `
      'use client'
      import { createContext, useContext } from '@barefootjs/client'
      const Ctx = createContext('default')
      function Inner() {
        const v = useContext(Ctx)
        return <span>{v}</span>
      }
      export function Outer() {
        return (
          <Ctx.Provider value="hi">
            <Inner />
          </Ctx.Provider>
        )
      }
    `
    const result = compileJSXSync(source, 'Outer.tsx', { adapter: new HonoAdapter() })
    expect(onlyErrors(result.errors)).toHaveLength(0)

    const tpl = result.files.find(f => f.type === 'markedTemplate')!
    // The shim provideContextSSR import is emitted on its own line so the
    // compiler's per-line dedupe collapses it across components.
    const providerImportLines = tpl.content
      .split('\n')
      .filter(l => /provideContextSSR/.test(l) && l.startsWith('import'))
    expect(providerImportLines.length).toBe(1)

    // The user-rewritten useContext import survives alongside.
    expect(tpl.content).toMatch(
      /import \{[^}]*\buseContext\b[^}]*\} from '@barefootjs\/hono\/client-shim'/,
    )

    // Provider's static string value renders quoted, not as raw identifier.
    expect(tpl.content).toContain('provideContextSSR(Ctx, "hi"')
  })
})
