/**
 * barefoot-claim — claim-once hydration prototype.
 * spec/slot-unification.md Stage 0 spike for hypotheses (a)/(b)/(c).
 *
 * Hand-written, plain JS, NO framework — this is a throwaway prototype of
 * what a claim-plan-based hydrator's *shape of work* would look like for
 * this one benchmark row, not a general-purpose runtime. It hardcodes the
 * one row template this bench uses instead of deriving child paths from a
 * compiled claim plan (spec section 4's "one claim mechanism"). See the
 * spike report for the list of things a real implementation would still
 * need that this prototype skips (signals, effect scheduling, multi-shape
 * templates, nested components, nested loops, nested conditionals, nested
 * `bf-s` scoping, nested marker fallback for adjacent-text/empty-region
 * cases, etc.) — this prototype's number is a CEILING, not a design.
 *
 * Row shape, after marker elision (see ../lib/strip-markers.ts) — the
 * bf-loop boundary comments and `data-key` anchor survive elision, this
 * row's own text-slot pairs and `bf="sN"` scope attrs do not:
 *
 *   <tr class="" data-key="N">                                   tr
 *     <td class="col-md-1">ID_TEXT</td>                          [0].firstChild
 *     <td class="col-md-4"><a class="lbl">LABEL_TEXT</a></td>    [1].firstChild.firstChild
 *     <td class="col-md-1"><a class="remove">x</a></td>
 *     <td class="col-md-6"></td>
 *   </tr>
 *
 * Hydration itself (main(), below) does ZERO per-row work: one delegated
 * click listener on #tbody, nothing else — no loop over the 1,000 rows,
 * no per-row effect, no per-row marker scan. A row's dynamic positions
 * (its id/label text nodes — the class attribute lives on the tr itself,
 * no child path needed for that one) are claimed lazily, on the row's
 * FIRST write, and the refs are held in `claims` (one shared WeakMap) for
 * every later write to that row. A row that is never clicked is never
 * claimed and never walked.
 */

performance.mark('hydrate-start')

// One shared claim table (spec section 3(a)/4): WeakMap<tr, RowClaim>.
// RowClaim = { tr, idText, labelText }.
const claims = new WeakMap()

/** Claim a row's dynamic positions via hardcoded child paths — once. */
function claimRow(tr) {
  let claim = claims.get(tr)
  if (claim) return claim
  claim = {
    tr,
    idText: tr.children[0].firstChild,
    labelText: tr.children[1].firstChild.firstChild,
  }
  claims.set(tr, claim)
  return claim
}

let selectedTr = null

/** Row selection: write-through on held refs, claiming lazily as needed. */
function selectRow(tr) {
  if (selectedTr === tr) return
  if (selectedTr) claimRow(selectedTr).tr.setAttribute('class', '')
  claimRow(tr).tr.setAttribute('class', 'danger')
  selectedTr = tr
}

function main() {
  const tbody = document.getElementById('tbody')
  if (tbody) {
    // The one delegated listener — attached once, at hydration, and never
    // again touched per-row. Resolves the clicked row by `data-key`
    // (spec section 3(a): "resolve rows by data-key").
    tbody.addEventListener('click', (event) => {
      const target = event.target
      const anchor = target && target.closest ? target.closest('a.lbl') : null
      if (!anchor || !tbody.contains(anchor)) return
      const tr = anchor.closest('tr[data-key]')
      if (!tr) return
      selectRow(tr)
    })
  }

  // Same double-rAF fence + hydrated flag every app in this bench uses
  // (see benchmarks/ssr/apps/barefoot/build-impl.ts's CLIENT_ENTRY_WRAPPER).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      performance.mark('hydrate-end')
      performance.measure('hydrate', 'hydrate-start', 'hydrate-end')
      document.body.dataset.hydrated = '1'
    })
  })
}

main()
