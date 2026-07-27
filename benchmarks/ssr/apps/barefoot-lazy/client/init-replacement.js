// ---------------------------------------------------------------------------
// Replacement `d0` (initBenchSsr) for the built barefoot SSR bench bundle —
// spliced by build.ts over the eager mapArray-based d0 in
// ../barefoot/dist/app.client.js. NOT run standalone.
//
// Free identifiers resolved at splice time (see build.ts):
//   __bfCreateSignal / __bfCreateEffect — aliases for the minified bundle's
//     real runtime createSignal/createEffect (asserted + aliased by build.ts)
//   __bfLazy* — helpers from client/lazy-loop.js, appended to the bundle
//
// Everything else about the app (hydration walker, scope registration,
// timing wrapper, SSR HTML) is byte-identical to the eager barefoot app.
// ---------------------------------------------------------------------------

function d0($, Y = {}) {
  if (!$) return
  // Outer signal: selected row id. A real runtime signal (not hand-rolled),
  // so the loop-level effect's subscription cost is the production shape.
  const [selected, setSelected] = __bfCreateSignal(0)
  const tbody = $.querySelector('[bf="s4"]')
  if (!tbody) return
  const tpl = document.createElement('template')
  tpl.innerHTML =
    '<tr data-key="" bf="s3"><td class="col-md-1"><!--bf:s0--><!--/--></td><td class="col-md-4"><a class="lbl" bf="s2"><!--bf:s1--><!--/--></a></td><td class="col-md-1"><a class="remove">x</a></td><td class="col-md-6"></td></tr>'
  const loop = __bfLazyLoopInit(tbody, 'l0', tpl, ['s0', 's1'])

  // Items reconcile effect. Y.initialRows is plain prop data (not a signal),
  // so this runs exactly once — at hydration, where it only partitions the
  // SSR rows into entries (zero per-row reactive graph, zero DOM writes).
  __bfCreateEffect(() => {
    const items = Y.initialRows
    if (!items) return
    __bfLazyReconcile(loop, items)
  })

  // ONE loop-level effect for the whole loop's outer-signal class binding.
  // First run (hydration): initialize per-entry dedup state, write nothing.
  __bfCreateEffect(() => {
    const sel = selected()
    loop.curSelected = sel
    const first = !loop.classInit
    loop.classInit = true
    __bfLazyApplyClass(loop, sel, first)
  })

  // Events were already container-delegated in the eager build — unchanged.
  tbody.addEventListener('click', (evt) => {
    const lbl = evt.target.closest('[bf="s2"]')
    if (lbl && tbody.contains(lbl)) {
      const rowEl = lbl.closest('[data-key]')
      if (rowEl) {
        const key = rowEl.getAttribute('data-key')
        const row = Y.initialRows.find((r) => String(r.id) === key)
        if (row) setSelected(row.id)
      }
    }
  })
}
