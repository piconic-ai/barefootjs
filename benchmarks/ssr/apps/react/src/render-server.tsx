/**
 * Server render entry for the React SSR bench — pure Bun, no browser.
 *
 * `renderPage(rows)` is called once per bench iteration by
 * benchmarks/ssr/bench-ssr.ts (20 iterations, 5 warmup) and once at build
 * time (build.ts) to produce the pre-rendered HTML shipped in dist/index.html.
 *
 * NODE_ENV must read "production" before react-dom is first imported —
 * react checks it at module-init time to pick the non-dev code paths
 * (this file is imported directly by Bun, unbundled, so there's no
 * bundler `define` to do this for us the way build.ts's Bun.build does
 * for the client bundle).
 */
process.env.NODE_ENV = 'production'

import { renderToString } from 'react-dom/server'
import { App, type RowData } from './App.tsx'

export async function renderPage(rows: RowData[]): Promise<string> {
  return renderToString(<App initialRows={rows} />)
}
