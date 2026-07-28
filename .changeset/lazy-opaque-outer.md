---
"@barefootjs/jsx": patch
---

Accept opaque outer reads in lazy loop rows (spec §9.5c(2)).

An outer name the emitter cannot prime — a local whose CALL is the reactive
read (`const isSelected = createSelector(selected)`), a prop accessor, or an
unclassifiable name — used to refuse the loop, because the loop-level effect
had to subscribe on its first run and an empty entry list left it subscribed
to nothing. The runtime's unconditional re-subscribe seam takes that
obligation over, so such loops are simply eligible — there is no flag or
second emission shape, and loops whose outer reads are all primed getters are
unchanged.

One case still refuses, and it is a different kind: when free-identifier
analysis produces NOTHING (`free === null`), the classifier knows neither the
outer reads nor whether the binding reads the loop index — which it reports
as `false` by assumption. The seam can keep a subscription alive; it cannot
conjure an index parameter `applyItem`/`applyOuter` do not have. That case
keeps its refusal under a distinct reason.

Effect: the krausest benchmark row (`className={isSelected(row.id) ? …}`) is
lazy for the first time — DOM-suite memory for 1,000 rows drops from 1768.8KB
to ~1052KB, 29% below solid, with update10th unchanged.
