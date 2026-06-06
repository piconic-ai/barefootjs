/**
 * End-to-end profiling on the real substrate (#1690).
 *
 * Unlike the per-analysis unit tests (which feed synthetic event streams),
 * this drives the **actual** instrumented runtime — `reactive.ts` (SR1),
 * `createRecordingSink` (SR2) — over a reactive graph that mirrors the
 * compiler's profile-mode output 1:1, using the exact ids it emits
 * (`Cart#signal:qty`, `Cart#memo:total`, `Cart#effect:<line>`,
 * `Cart#handler:s1:click`). It then joins to the real IR graph (SR4) and runs
 * the v1 analyses, asserting the end-to-end story holds:
 *
 *   an unbatched 3-write click re-runs `total` 5×/turn; a `batch()` would
 *   collapse 14 effect runs to 5.
 *
 * This is the executable proof of the pipeline until the `--scenario` run
 * driver lands; it also pins the mount-vs-interaction metric split surfaced by
 * running it.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import {
  createSignal, createMemo, createEffect, createRoot,
  beginTurn, endTurn, setProfilerSink,
} from '../../../client/src/reactive'
import { createRecordingSink } from '../../../client/src/profiler-events'
import { buildIdIndex, analyzeHotSubscribers, analyzeBatchAdvisor } from '../profiler'
import { buildComponentAnalysis } from '../debug'

const CART = `
  'use client'
  import { createSignal, createMemo, createEffect } from '@barefootjs/client'
  export function Cart() {
    const [qty, setQty] = createSignal(1)
    const [price, setPrice] = createSignal(100)
    const [coupon, setCoupon] = createSignal(0)
    const subtotal = createMemo(() => qty() * price())
    const tax = createMemo(() => subtotal() * 0.1)
    const total = createMemo(() => subtotal() + tax() - coupon())
    createEffect(() => { console.log('total', total()) })
    createEffect(() => { console.log('subtotal', subtotal()) })
    return <button onClick={() => { setQty(qty() + 1); setPrice(price() + 10); setCoupon(5) }}>{total()}</button>
  }
`

afterEach(() => setProfilerSink(null))

/** Run the mirrored Cart graph under the recording sink and return the log. */
function profileCartClick() {
  const rec = createRecordingSink()
  setProfilerSink(rec.sink)
  createRoot(() => {
    const [qty, setQty] = createSignal(1, 'Cart#signal:qty')
    const [price, setPrice] = createSignal(100, 'Cart#signal:price')
    const [coupon, setCoupon] = createSignal(0, 'Cart#signal:coupon')
    const subtotal = createMemo(() => qty() * price(), 'Cart#memo:subtotal')
    const tax = createMemo(() => subtotal() * 0.1, 'Cart#memo:tax')
    const total = createMemo(() => subtotal() + tax() - coupon(), 'Cart#memo:total')
    createEffect(() => { void total() }, 'Cart#effect:11')
    createEffect(() => { void subtotal() }, 'Cart#effect:12')
    // The compiled handler wrapper: beginTurn → handler body → endTurn.
    beginTurn('Cart#handler:s1:click')
    try { setQty(qty() + 1); setPrice(price() + 10); setCoupon(5) } finally { endTurn() }
  })
  setProfilerSink(null)
  return rec.events
}

describe('profiler end-to-end (real substrate)', () => {
  test('hot subscribers ranks `total` worst and source-maps it, mount excluded', () => {
    const { graph } = buildComponentAnalysis(CART, 'Cart.tsx')
    const index = buildIdIndex(graph)
    const events = profileCartClick()

    const hot = analyzeHotSubscribers(events, index)
    const total = hot.subscribers.find(s => s.name === 'total')!
    expect(total).toBeDefined()
    expect(total.kind).toBe('memo')
    expect(total.loc!.file).toBe('Cart.tsx')
    // The unbatched 3-write turn re-runs `total` 5× — and mount (1 run) is
    // excluded, so the per-turn figure is 5.0, not the diluted 3.0.
    expect(total.mountRuns).toBe(1)
    expect(total.turns).toBe(1)
    expect(total.runsPerTurn).toBe(5)
    expect(total.hot).toBe(true)

    // Every hot subscriber resolved to a real source line.
    for (const s of hot.subscribers) {
      if (s.subscriber.startsWith('Cart#')) expect(s.loc).toBeDefined()
    }
  })

  test('batch advisor reports the multi-write turn as a real saving', () => {
    const events = profileCartClick()
    const batch = analyzeBatchAdvisor(events)
    const cand = batch.candidates.find(c => c.turn === 'Cart#handler:s1:click')!
    expect(cand).toBeDefined()
    // 3 unbatched writes cascade the memo chain: 14 effect runs, 5 distinct.
    expect(cand.totalRuns).toBe(14)
    expect(cand.distinctSubscribers).toBe(5)
    expect(cand.savings).toBe(9)
    expect(cand.safety).toBe('unverified')
  })
})
