/**
 * Solid hydration entry point — babel-transformed (typescript preset only;
 * no JSX here) alongside the `generate: 'dom', hydratable: true` compile
 * of App.tsx (see build.ts), then bundled together with Bun.build.
 *
 * Imports `./App` extension-less: after both this file and App.tsx are
 * babel-transformed to `.js` siblings in `.babel-out-dom/`, Bun.build's
 * bundler resolves the specifier against the file that's actually on
 * disk there.
 *
 * Timing contract mirrors the React client entry (see its docstring):
 * mark as the first executable statement, hydrate synchronously via
 * Solid's `hydrate()`, then a double-rAF fence before flagging done.
 */
import { hydrate } from 'solid-js/web'
import { App } from './App'

interface RowData {
  id: number
  label: string
}

performance.mark('hydrate-start')

const rows = (window as unknown as { __DATA__: RowData[] }).__DATA__
const container = document.getElementById('app')
if (!container) throw new Error('#app container not found')

hydrate(() => App({ initialRows: rows }), container)

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    performance.mark('hydrate-end')
    performance.measure('hydrate', 'hydrate-start', 'hydrate-end')
    document.body.dataset.hydrated = '1'
  })
})
