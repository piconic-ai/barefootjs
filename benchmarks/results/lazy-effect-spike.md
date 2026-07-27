# Lazy effect-graph measurement spike (hand-written prototype)

Measures the follow-up tracked in `spec/slot-unification.md` §8 — **"Row-granularity
effects (§3(c)) — effect-count consolidation DONE; lazy effect-graph construction
remains"** — by bounding what row-level lazy effect-graph construction is worth for
plain loop rows, with a hand-written throwaway prototype (benchmarks/ only, no
compiler or runtime changes).

- SSR spike app: `benchmarks/ssr/apps/barefoot-lazy/` — the eager `barefoot` SSR
  bench app's BUILT bundle with one hand-edit: `d0`'s `mapArray` call + per-row
  renderItem closure replaced by the lazy loop (`client/init-replacement.js` +
  `client/lazy-loop.js`, spliced by `build.ts`). SSR HTML, server render module,
  hydration walker, and timing wrapper are byte-identical to `barefoot`'s.
- DOM spike app: `benchmarks/apps/barefoot-lazy/` — same hand-edit applied to the
  eager DOM bench app's `dist/components/Bench.client.js`. Top-level signals
  (rows/selected) and the delegated tbody click handler untouched; ONLY the row
  loop became lazy.
- Harness wiring (spike-marked): fourth column in `benchmarks/ssr/bench-ssr.ts`
  and `benchmarks/ssr/bench-ssr-memory.ts`; the DOM suite discovers apps by
  directory, so `bench-dom.ts` needed no change.

Environment: Bun 1.3.11, Chromium 141.0.7390.37 (headless, bench flags), Intel
Xeon @ 2.80GHz (4 cores, shared sandbox — timing columns are noisy; memory
columns are forced-GC and highly stable), React 19.2.8, Solid 1.9.14, 1000 rows.
Measured 2026-07-27 on branch `claude/lazy-effect-spike`.

## The model being measured

Per plain loop row (`mapArray` shape), the prototype eliminates the per-row
reactive graph entirely:

1. **Hydration first run**: partition SSR rows into plain entries
   `{ key, el, item, refs: null, lastClass: undefined }`; `key` is READ from the
   SSR-rendered `data-key` (never written).
2. **Item-driven updates are not reactive**: the keyed reconciler already knows
   which item changed and calls a plain `updateRow(entry, newItem)` directly.
   The row's two text refs are claimed lazily on that row's first update
   (comment scan inside that one row), cached on the entry; per-field dedup by
   comparing old item fields to new.
3. **CSR row creation**: template clone + direct writes; refs recorded from the
   clone's known childNode paths — no scan.
4. **Outer-signal bindings** (`class={selected() === row.id ? 'danger' : ''}`):
   ONE loop-level `createEffect` (the app runtime's real one) iterating ALL
   entries with per-entry dedup (`entry.lastClass`). On its hydration first run
   it initializes `lastClass` from the computed value and writes nothing
   (trust-SSR). Kept generic — no "only k rows changed" special case — because
   the iterate-all-with-dedup form is what a compiler could mechanically emit.
5. **Reorders/removals**: same keyed diff + LIS minimal-move as `mapArray`;
   dispose is trivial (entries hold no reactive resources).

## Correctness gates (all passed before measuring)

Reproducible via the committed scripts `benchmarks/ssr/apps/barefoot-lazy/gate.ts`
and `benchmarks/apps/barefoot-lazy/gate.ts` (both exit 0).

SSR app (playwright, real chromium): hydration completes; 0 danger rows before
click; clicking row 2's label puts `class="danger"` on exactly that row;
clicking row 2 → row 7 → row 2 moves the class correctly each time (dedup +
first-run-skip survive repeated transitions); row text intact; 1000 rows.
The bench harness's own interactivity gate also passes in all runs below.

DOM app: create1k renders 1000 correct rows (id == data-key, labels present);
update10th updates exactly 100 labels — spot-checked rows 1 and 991 updated,
rows 2 and 992 not; select highlights exactly one row and moves correctly;
swap swaps rows 2 and 999 (labels and selection follow); remove drops exactly
the removed id; clear empties from 1k and from 11k; create10k → 10000 rows;
append1k after create10k → 11000 rows; replace1k changes first id. The only
console error on either app is the browser's `favicon.ico` 404, present
identically on the eager `barefoot` apps (pre-existing, not spike-induced).

## D1 — SSR + hydration bench (`bun benchmarks/ssr/bench-ssr.ts`, full mode)

Run 1:

| Metric | react | solid | barefoot | barefoot-lazy |
|---|---|---|---|---|
| Server render (median, n=20) | 47.53 ms | 1.22 ms | 31.66 ms | 16.35 ms |
| Hydration time (median, n=10) | 64.60 ms | 38.30 ms | 49.10 ms | 46.90 ms |
| Interactivity gate | PASS | PASS | PASS | PASS |
| Client JS (raw / gzip) | 182.3KB / 58.1KB | 17.0KB / 6.6KB | 21.6KB / 7.8KB | 26.7KB / 9.3KB |
| HTML document (raw / gzip) | 220.0KB / 14.9KB | 235.9KB / 18.6KB | 318.6KB / 19.5KB | 318.6KB / 19.5KB |

Run 2:

| Metric | react | solid | barefoot | barefoot-lazy |
|---|---|---|---|---|
| Server render (median, n=20) | 34.12 ms | 1.01 ms | 19.70 ms | 20.59 ms |
| Hydration time (median, n=10) | 76.00 ms | 41.55 ms | 55.80 ms | 50.00 ms |
| Interactivity gate | PASS | PASS | PASS | PASS |
| Client JS (raw / gzip) | 182.3KB / 58.1KB | 17.0KB / 6.6KB | 21.6KB / 7.8KB | 26.7KB / 9.3KB |
| HTML document (raw / gzip) | 220.0KB / 14.9KB | 235.9KB / 18.6KB | 318.6KB / 19.5KB | 318.6KB / 19.5KB |

Notes:
- Server render for barefoot and barefoot-lazy is the SAME module (barefoot-lazy
  re-exports barefoot's `renderPage`); the run-1 16.35 vs 31.66 split is JIT/VM
  warm-up order (lazy runs fourth, on an already-warmed module), not a real
  difference — run 2 shows them equal. HTML is byte-identical by construction.
- Hydration: lazy is consistently a few ms faster (46.90 vs 49.10; 50.00 vs
  55.80) — directionally consistent with Stage 0's finding that zero-per-row
  hydration work saves only ~10% at 1k rows because navigation/parse dominates
  the double-rAF window. Not the primary justification.
- Client JS: +5.1KB raw / +1.5KB gzip over eager barefoot. The prototype
  APPENDS the lazy implementation to the eager bundle (whose mapArray/lazySlots
  code paths remain, now-unused, plus the spike's generic reconciler); a real
  compiler emission would REPLACE, not append, so treat this column as an upper
  bound with no signal beyond "the lazy reconciler is a few KB".

## D2 — SSR post-hydration heap (`bun benchmarks/ssr/bench-ssr-memory.ts`, forced GC, n=3, 1000 rows)

Run 1:

| App | median | n=3 | stdev |
|---|---|---|---|
| react | 3476.5KB | 3475.1, 3476.5, 3477.3 | 0.9KB |
| solid | 2578.3KB | 2578.3, 2578.2, 2578.8 | 0.2KB |
| barefoot | 2717.7KB | 2719.8, 2717.6, 2717.7 | 1.0KB |
| **barefoot-lazy** | **1580.4KB** | 1580.4, 1580.4, 1580.4 | 0.0KB |

Run 2:

| App | median | n=3 | stdev |
|---|---|---|---|
| react | 3475.5KB | 3475.9, 3475.5, 3475.0 | 0.3KB |
| solid | 2578.0KB | 2578.0, 2578.1, 2578.0 | 0.0KB |
| barefoot | 2718.6KB | 2718.7, 2718.6, 2717.7 | 0.4KB |
| **barefoot-lazy** | **1580.4KB** | 1580.4, 1580.4, 1580.4 | 0.0KB |

**Headline: −41.9% post-hydration heap vs eager barefoot (2718 → 1580KB,
−1138KB for 1000 rows ≈ −1.14KB/row), 39% below solid.** Unlike Stage 0's
1169KB claim-prototype ceiling (which shipped no framework runtime at all),
this number includes the full real runtime, the real hydration walker, real
signals/effects for the outer scope, and a fully functional keyed reconciler —
it is the honest "framework-shaped" bound for this app, not a stunt floor.

## D3 — DOM update suite (`bun benchmarks/runner/bench-dom.ts --quick`, run twice)

Run 1:

| Operation | vanilla | barefoot | barefoot-lazy | solid |
|---|---|---|---|---|
| create1k | 123.10 ms | 181.80 ms (1.48x) | 361.90 ms (2.94x) | 130.20 ms (1.06x) |
| replace1k | 149.70 ms | 147.60 ms (0.99x) | 191.50 ms (1.28x) | 149.10 ms (1.00x) |
| update10th | 25.40 ms | 28.30 ms (1.11x) | 29.10 ms (1.15x) | 26.20 ms (1.03x) |
| select | 6.00 ms | 8.00 ms (1.33x) | 7.60 ms (1.27x) | 8.90 ms (1.48x) |
| swap | 25.80 ms | 32.70 ms (1.27x) | 32.40 ms (1.26x) | 33.60 ms (1.30x) |
| remove | 37.60 ms | 40.40 ms (1.07x) | 43.20 ms (1.15x) | 43.20 ms (1.15x) |
| create10k | 1130.20 ms | 1260.80 ms (1.12x) | 1427.50 ms (1.26x) | 1149.50 ms (1.02x) |
| append1k | 481.40 ms | 455.20 ms (0.95x) | 560.80 ms (1.16x) | 503.60 ms (1.05x) |
| clear10k | 89.40 ms | 134.40 ms (1.50x) | 102.40 ms (1.15x) | 95.60 ms (1.07x) |
| startup | 45.65 ms | 169.65 ms (3.72x) | 76.65 ms (1.68x) | 47.80 ms (1.05x) |
| memory (1k rows) | 253.1KB | 1766.6KB (6.98x) | 480.7KB (1.90x) | 1483.9KB (5.86x) |
| shipped JS | 2.7KB raw / 1.1KB gzip | 25.8KB raw / 9.3KB gzip (8.15x) | 32.1KB raw / 11.0KB gzip (9.70x) | 17.3KB raw / 6.8KB gzip (5.96x) |

Run 2:

| Operation | vanilla | barefoot | barefoot-lazy | solid |
|---|---|---|---|---|
| create1k | 119.20 ms | 150.70 ms (1.26x) | 119.60 ms (1.00x) | 120.40 ms (1.01x) |
| replace1k | 132.70 ms | 164.40 ms (1.24x) | 142.80 ms (1.08x) | 195.90 ms (1.48x) |
| update10th | 27.60 ms | 26.00 ms (0.94x) | 31.10 ms (1.13x) | 24.90 ms (0.90x) |
| select | 5.30 ms | 7.10 ms (1.34x) | 6.20 ms (1.17x) | 6.70 ms (1.26x) |
| swap | 32.20 ms | 27.60 ms (0.86x) | 30.70 ms (0.95x) | 33.60 ms (1.04x) |
| remove | 40.10 ms | 36.00 ms (0.90x) | 38.90 ms (0.97x) | 37.60 ms (0.94x) |
| create10k | 1203.80 ms | 1275.60 ms (1.06x) | 1154.30 ms (0.96x) | 1117.30 ms (0.93x) |
| append1k | 503.60 ms | 527.40 ms (1.05x) | 479.50 ms (0.95x) | 443.90 ms (0.88x) |
| clear10k | 90.10 ms | 107.10 ms (1.19x) | 96.30 ms (1.07x) | 99.30 ms (1.10x) |
| startup | 47.70 ms | 63.30 ms (1.33x) | 77.55 ms (1.63x) | 47.25 ms (0.99x) |
| memory (1k rows) | 253.1KB | 1765.7KB (6.97x) | 480.4KB (1.90x) | 1484.0KB (5.86x) |
| shipped JS | 2.7KB raw / 1.1KB gzip | 25.8KB raw / 9.3KB gzip (8.15x) | 32.1KB raw / 11.0KB gzip (9.70x) | 17.3KB raw / 6.8KB gzip (5.96x) |

Notes:
- **Run 1's create1k outlier (361.90 ms) is measurement noise, not the
  prototype.** Isolated re-check under identical bench conditions
  (`--quick --op=create1k --framework=barefoot,barefoot-lazy`): barefoot
  136.90 ms, barefoot-lazy 137.00 ms. A manual 5-iteration in-page profile also
  put the two apps' click→paint totals in the same ~100–180 ms band, with
  lazy's synchronous JS slice slightly SMALLER (12–21 ms vs 13–35 ms). Quick
  mode (n=3) on this shared 4-core sandbox swings ±2x on individual ops; run 1
  vs run 2's barefoot startup (169.65 → 63.30 ms) shows the same noise on the
  eager app. The stable columns are memory and shipped JS.
- **Memory (1k rows): 1766 → 480KB, −72.8% vs eager barefoot, 3.1x smaller than
  solid, 1.90x vanilla.** Reproduced across both runs and the isolated re-check
  (479.5–480.7KB; eager 1765.7–1768.3KB). This measures the heap delta of
  clicking `#run` (creating 1000 rows client-side) — i.e. the per-row graph
  cost at CREATION time, ~1.29KB/row of reactive bookkeeping the lazy model
  never allocates. This is the same metric §5a's A3b pass reported at
  1767–2046KB while consolidating effects; lazily NOT building the graph at
  all reaches 480KB.
- Shipped JS: the +6.3KB raw is the appended (comment-stripped but unminified,
  matching the eager Bench.client.js's style) lazy reconciler while the eager
  runtime bundle still carries the now-unused mapArray/lazySlots paths — an
  append-not-replace artifact of the splice, upper bound only.
- update10th shows no regression (29.10/31.10 vs 28.30/26.00 — within noise):
  the lazy claim's one-time per-row comment scan happens on the first update of
  each row and is amortized invisibly here (rows in this suite are CSR-created
  with refs pre-recorded, so updates never scan at all; the scan path only
  runs for SSR-adopted rows, exercised by the SSR gates instead).

## Per-row hydration work inventory (1000 rows, SSR app)

Verified in the real emitted client JS (`benchmarks/ssr/apps/barefoot/dist/app.client.js`,
function `d0`) vs the spliced lazy bundle:

| Per SSR row at hydration | eager barefoot | barefoot-lazy |
|---|---|---|
| `createRoot` (owner object) | 1 | 0 |
| per-item `createSignal` (+ subscription set) | 1 | 0 |
| `createEffect` closure (+ dependency map, run) | 1 | 0 |
| scoped `querySelector`/`qsa` for the `tr` | 1 | 0 |
| TreeWalker comment scan (claim 2 text slots) | 1 (both slots) | 0 (deferred to first update of that row) |
| `lazySlots` writer closure + plan literal + claim `Map` + 2 `ClaimedTextSlot` refs | 1 set | 0 |
| `setAttribute('class', …)` write | 1 (byte-identical to SSR) | 0 |
| text `nodeValue` writes | 2 (byte-identical to SSR) | 0 |
| `data-key` `setAttribute` | 1 (re-writes SSR value) | 0 (attribute read only) |
| entry allocation | mapArray entry + Y0 record | 1 plain 5-field object |
| **Loop-level (not per-row)** | delegated click listener (already) | delegated click listener + ONE `createEffect` + ONE signal |

## What the first-run-skip assumes, and production-sound alternatives

The prototype's hydration first run **writes nothing and reads almost nothing**:
it trusts that (a) SSR rendered exactly the items array the client was given
(`bf-p` props JSON), in order, so positional `entry.item = items[i]` pairing and
the SSR `data-key` agree; and (b) the SSR-rendered class/text bytes equal what
the client would compute from those items (BarefootJS's enforced SSR/CSR byte
parity), so `lastClass` can be initialized from the computed value without
comparing against the DOM. For this app both hold by construction — the props
channel IS the SSR input. In general (b) is the same assumption the A3
follow-up REMOVED for general `'markup'` slots (client-only initial state can
diverge, see §6) — so a production version needs one of:

1. **Compare-before-write on first touch** (cheap, always sound): initialize
   dedup state from the DOM instead of the computation — `lastClass =
   el.getAttribute('class')`, and on a row's first update compare
   `ref.nodeValue`/`textContent` before writing. Costs one attribute/text READ
   per entry on the loop-level effect's first run (and per row on first
   update), still zero writes and zero per-row graph. This is the natural
   default.
2. **Compile-time consistency gate on the loop's data source**: the compiler
   already knows whether the loop's items expression derives purely from
   server-provided props (`Y.initialRows` here) or reads client-only state
   (`createSignal(readFromLocalStorage())` etc.). Pure-props loops get the
   trust-first-run fast path; anything else gets alternative 1. This is the
   same source-derivation reasoning `patchSlotRange`'s preamble-region reuse
   was originally justified by, made explicit as a per-loop compile decision.

Also assumed: the **row-pristine invariant** (nothing mutates row content
before its lazy claim — same constraint A2 already enumerates for streaming/
portal paths), and that `data-key` is present on SSR rows (it is — the
adapter contract emits it for keyed loops).

## What the lazy model could NOT express (honest list)

- **Rows whose bindings read outer signals work — via the loop-level effect —
  but every outer-signal binding becomes O(rows) per signal change.** The
  iterate-all-with-dedup effect visits all 1000/10000 entries on each
  `selected` change where the eager model re-runs 2 row effects
  (`createSelector`). At 10k rows the select op stayed in the noise band here
  (a strided read + compare is fast), but it is a real asymptotic regression a
  compiler could avoid only by reintroducing per-row subscriptions for that
  binding, or a keyed index (e.g. selector-style `Map<id, entry>` — expressible,
  but that is a special case for equality-shaped bindings, not the generic
  form; this spike deliberately measured the generic form).
- **Item updates must flow through the reconciler.** Anything that mutates a
  row's item OUTSIDE the items array (e.g. a per-item signal passed into the
  row, `item.label = ...` + per-row effect) has no reactive path anymore —
  the lazy model only sees `!Object.is(entry.item, newItem)` at reconcile
  time. The bench apps (and idiomatic keyed-list code) always produce new item
  objects through the list signal, but per-item-signal patterns (Solid's
  store-per-row idiom) are NOT expressible without reintroducing per-row
  reactivity. A compiler adopting this model must gate it on "row bindings
  read only `item.*` fields + outer signals", which is exactly the plain
  loop-row shape §8 scopes to.
- **`curSelected` mirror**: `updateRow` needs the outer signal's current value
  without subscribing (a changed item id must re-evaluate the class binding).
  The prototype mirrors the value onto the loop object from the loop-level
  effect instead of calling `untrack(selected)` — a hack only because the
  minified/tree-shaken bench bundles don't export `untrack`; a real emission
  would use `untrack`. No behavioral difference here (the mirror is updated
  synchronously by the effect before any reconcile can observe it).
- **Two entries-shape simplifications** vs `mapArray`: multi-root rows
  (`extras` + per-row `bf-loop-i` markers) and the duplicate-key warning path
  were dropped — the bench row is single-root and keys are unique. Both are
  mechanical to add back (the entry struct and insert/remove helpers mirror
  `mapArray`'s), not design obstacles.
- **Nothing else broke**: delegated events (already container-level), LIS
  reorders, ranged clear, remove, append, replace, and repeated
  select-transitions all behave identically to the eager app under the gates
  above.

## Reading

The −57% Stage 0 ceiling translates, with a full real runtime attached, into
**−42% post-hydration heap on the SSR page and −73% row-creation heap in the
DOM suite, at zero measured op-latency cost** (all op deltas within quick-mode
noise; hydration a few ms faster). The costs are (i) O(rows) outer-signal
binding application per signal change — generic form, dedup-guarded, invisible
in this suite even at 10k rows, (ii) the soundness caveat above (needs
compare-before-write or a compile-time consistency gate), and (iii) loss of
per-item-signal row patterns outside the plain loop-row shape. That is the
bound §8 asked for: the deferral is worth a real PR, and the production design
should pair it with alternative 1 (compare-before-write) as the default and
alternative 2 as the fast path.
