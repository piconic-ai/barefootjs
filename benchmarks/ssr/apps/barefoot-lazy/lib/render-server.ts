/**
 * Server render entry for the `barefoot-lazy` SSR bench app (lazy
 * effect-graph measurement spike, spec/slot-unification.md §8).
 *
 * The spike changes ONLY the client-side loop hydration model; the server
 * render is byte-identical to the eager barefoot app's, so this module just
 * re-exports it. bench-ssr.ts's server-render metric for this column
 * therefore measures the same real pipeline (and should report ~the same
 * number as the barefoot column).
 */
export { renderPage, getClientJs, type RowData } from '../../barefoot/lib/render-server.ts'
