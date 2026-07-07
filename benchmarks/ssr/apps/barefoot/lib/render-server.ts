/**
 * Server render entry for the BarefootJS SSR bench — pure Bun, no browser.
 *
 * Uses the real compiler pipeline directly (`compileJSX` + `HonoAdapter`
 * from `@barefootjs/jsx` / `@barefootjs/hono`), the same path
 * packages/adapter-hono/src/test-render.ts exercises for adapter
 * conformance tests — not the full CLI build (`bf build`), which wires up
 * a dev server, incremental cache, and multi-file manifest that a
 * standalone bench script doesn't need. Both are legitimate "real
 * pipeline" entry points; this one keeps the bench self-contained.
 *
 * `BenchSsr.tsx` compiles to a plain `hono/jsx` component (no Hono app,
 * router, or request context needed — see render.ts's docstring), so we
 * write the compiled marked-template source to a temp `.tsx` file next to
 * this module (so `hono/jsx` resolves the same way test-render.ts's
 * RENDER_TEMP_DIR does), import it once, and reuse the resolved component
 * function across all 20 bench iterations — compilation is a one-time,
 * build-time cost in any real app; only rendering is timed.
 */
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { renderToHtml } from '@barefootjs/hono/render'
import { readFileSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RowData {
  id: number
  label: string
}

const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const COMPONENT_SRC = join(LIB_DIR, '..', 'components', 'BenchSsr.tsx')

type BenchSsrComponent = (props: {
  initialRows: RowData[]
  __instanceId: string
  __bfChild: boolean
}) => unknown

interface Compiled {
  component: BenchSsrComponent
  clientJs: string
}

let compiledPromise: Promise<Compiled> | null = null

async function ensureCompiled(): Promise<Compiled> {
  if (!compiledPromise) {
    compiledPromise = (async () => {
      const source = readFileSync(COMPONENT_SRC, 'utf8')
      const result = compileJSX(source, 'BenchSsr.tsx', { adapter: new HonoAdapter() })
      const errors = result.errors.filter((e) => e.severity === 'error')
      if (errors.length > 0) {
        throw new Error(`BenchSsr compile errors:\n${errors.map((e) => e.message).join('\n')}`)
      }
      const markedTemplate = result.files.find((f) => f.type === 'markedTemplate')
      if (!markedTemplate) throw new Error('No marked template in BenchSsr compile output')
      const clientJs = result.files.find((f) => f.type === 'clientJs')
      if (!clientJs) throw new Error('No clientJs in BenchSsr compile output')

      const tempFile = join(
        LIB_DIR,
        `.render-compiled-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`,
      )
      // '/** @jsxImportSource hono/jsx */' pragma, same as test-render.ts,
      // so the compiled JSX in the marked template resolves against
      // hono/jsx rather than requiring a bundler-configured jsxImportSource.
      const code = `/** @jsxImportSource hono/jsx */\n${markedTemplate.content}`
      await Bun.write(tempFile, code)
      try {
        const mod = await import(tempFile)
        return { component: mod.BenchSsr as BenchSsrComponent, clientJs: clientJs.content }
      } finally {
        unlinkSync(tempFile)
      }
    })()
  }
  return compiledPromise
}

/**
 * Renders the 1,000-row table HTML string for the fixed dataset.
 *
 * `__instanceId` MUST follow the `<ComponentName>_<suffix>` shape the
 * client hydration walker expects (`scopeName()` in
 * packages/client/src/runtime/hydrate.ts splits on the first `_` to look
 * up the registered component def by name) — an id without an underscore
 * silently fails that lookup and the walker skips the scope entirely
 * (found during implementation: passing a plain `'bench-ssr'` id caused
 * hydration to report complete via `flushHydration()` while never
 * actually attaching the click listener). Fixed id (not the component's
 * own `Math.random()`-suffixed default) so SSR output is byte-stable
 * across bench iterations.
 */
export async function renderPage(rows: RowData[]): Promise<string> {
  const { component } = await ensureCompiled()
  const node = component({ initialRows: rows, __instanceId: 'BenchSsr_bench', __bfChild: false })
  return renderToHtml(node)
}

/** Compiled client JS source for build.ts's bundling step. */
export async function getClientJs(): Promise<string> {
  const { clientJs } = await ensureCompiled()
  return clientJs
}
