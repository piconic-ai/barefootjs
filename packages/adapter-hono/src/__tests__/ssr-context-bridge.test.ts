/**
 * SSR context-bridge end-to-end (#1084).
 *
 * Verifies that BarefootJS components using `<Context.Provider>` plus
 * `useContext` actually flow values through Hono's per-render context stack
 * at SSR time. This is the bonus path of Option B: not only does the SSR
 * template no longer crash with `ReferenceError: useContext is not defined`,
 * the rendered HTML reflects the provided value rather than the context
 * default.
 */

import { describe, test, expect } from 'bun:test'
import { renderHonoComponent } from '../test-render'
import { HonoAdapter } from '../adapter/hono-adapter'

describe('SSR context bridge (#1084 / Option B)', () => {
  test('useContext returns the value provided by an enclosing Context.Provider at SSR', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        'use client'
        import { createContext, useContext } from '@barefootjs/client'

        const ThemeContext = createContext('light')

        function ThemeLabel() {
          const theme = useContext(ThemeContext)
          return <span class="theme">{theme}</span>
        }

        export function ThemeRoot() {
          return (
            <div class="root">
              <ThemeContext.Provider value="dark">
                <ThemeLabel />
              </ThemeContext.Provider>
            </div>
          )
        }
      `,
    })

    expect(html).toContain('class="theme"')
    // The provided value flows through to the consumer at SSR.
    expect(html).toContain('>dark<')
    expect(html).not.toContain('>light<')
  })

  test('useContext falls back to defaultValue when no provider is in scope', async () => {
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        'use client'
        import { createContext, useContext } from '@barefootjs/client'

        const LocaleContext = createContext('en')

        export function LocaleLabel() {
          const locale = useContext(LocaleContext)
          return <span>{locale}</span>
        }
      `,
    })
    expect(html).toContain('>en<')
  })

  test('reads a memo body that depends on a context value at SSR', async () => {
    // Mirrors the pattern blocking step 2 of #1080: a primitive consumes the
    // chart container's scales via useContext and computes geometry inside a
    // createMemo. The memo body runs at SSR and used to throw because
    // useContext was undefined; now it produces real markup.
    const html = await renderHonoComponent({
      adapter: new HonoAdapter(),
      source: `
        'use client'
        import { createContext, createMemo, useContext } from '@barefootjs/client'

        const GridContext = createContext({ ticks: [] })

        function GridLines() {
          const ctx = useContext(GridContext)
          const lines = createMemo(() => ctx.ticks.map((y) => ({ y })))
          return (
            <g class="grid">
              {lines().map((l) => <line key={l.y} y1={l.y} y2={l.y} />)}
            </g>
          )
        }

        export function Chart() {
          return (
            <svg>
              <GridContext.Provider value={{ ticks: [10, 20, 30] }}>
                <GridLines />
              </GridContext.Provider>
            </svg>
          )
        }
      `,
    })

    // Three <line> elements emitted at SSR — proving the memo body executed
    // with a populated context (vs. the empty default).
    const lineMatches = html.match(/<line\b/g) ?? []
    expect(lineMatches.length).toBe(3)
    expect(html).toMatch(/y1="10"/)
    expect(html).toMatch(/y1="20"/)
    expect(html).toMatch(/y1="30"/)
  })
})
