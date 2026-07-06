/**
 * React hydration entry point — bundled to dist/app.client.js.
 *
 * Timing contract (benchmarks/ssr, metric 2): `hydrate-start` is marked as
 * the first executable statement (ESM imports are hoisted above any code
 * in the file, so this is as early as a mark can land), hydration runs via
 * `hydrateRoot`, and completion is signaled after a double-rAF fence — the
 * same fence used by the DOM update suite (see benchmarks/runner/bench-dom.ts)
 * to make sure the browser has actually painted, not just returned from
 * a synchronous call.
 */
import { hydrateRoot } from 'react-dom/client'
import { App, type RowData } from './App.tsx'

performance.mark('hydrate-start')

const rows = (window as unknown as { __DATA__: RowData[] }).__DATA__
const container = document.getElementById('app')
if (!container) throw new Error('#app container not found')

hydrateRoot(container, <App initialRows={rows} />)

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    performance.mark('hydrate-end')
    performance.measure('hydrate', 'hydrate-start', 'hydrate-end')
    document.body.dataset.hydrated = '1'
  })
})
