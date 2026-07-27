// ---------------------------------------------------------------------------
// Replacement for the `mapArray(...)` call (+ its per-row renderItem closure)
// in the built barefoot DOM bench app's dist/components/Bench.client.js —
// spliced by build.ts. NOT run standalone.
//
// Scope it is spliced into (initBench, unminified): `rows`/`selected` signal
// accessors, `_s11` (tbody), `__tpl_l0` (row template), `createEffect`
// (runtime import). The `__bfLazy*` helpers come from client/lazy-loop.js,
// appended to the same module.
//
// The app's top-level signals and delegated tbody click handler are
// untouched — ONLY the row loop becomes lazy.
// ---------------------------------------------------------------------------
  const __loop_l0 = __bfLazyLoopInit(_s11, 'l0', __tpl_l0, ['s6', 's7'])

  // Items reconcile effect: subscribed to rows() only. Row updates inside are
  // direct function calls (no per-row signal/effect), creations are template
  // clones with path-recorded refs, reorders are keyed-diff + LIS.
  createEffect(() => {
    const items = rows()
    if (!items) return
    __bfLazyReconcile(__loop_l0, items)
  })

  // ONE loop-level effect for the outer-signal class binding (selected):
  // iterates ALL entries with per-entry dedup. (This app CSR-mounts with an
  // empty loop, so the hydration first-run skip never suppresses a real
  // write here — it matters for the SSR variant of this spike.)
  createEffect(() => {
    const sel = selected()
    __loop_l0.curSelected = sel
    const first = !__loop_l0.classInit
    __loop_l0.classInit = true
    __bfLazyApplyClass(__loop_l0, sel, first)
  })
