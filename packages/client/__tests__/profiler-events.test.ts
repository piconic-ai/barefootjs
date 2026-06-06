/**
 * SR2 event collection (#1690): `createRecordingSink` turns the raw sink
 * callbacks into a flat, ordered, turn-stamped log.
 */

import { describe, test, expect, afterEach } from 'bun:test'
import { createSignal, createEffect, createRoot, beginTurn, endTurn, setProfilerSink } from '../src/reactive'
import { createRecordingSink } from '../src/profiler-events'

afterEach(() => setProfilerSink(null))

describe('createRecordingSink', () => {
  test('stamps events with the turn in scope and orders them by seq', () => {
    const rec = createRecordingSink()
    setProfilerSink(rec.sink)

    createRoot(() => {
      const [n, setN] = createSignal(0, 'C#signal:n')
      createEffect(() => { n() }, 'C#effect:5')
      beginTurn('C#handler:s0:click', 'C.tsx:5')
      setN(1)
      endTurn()
    })

    const seqs = rec.events.map(e => e.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b)) // strictly ordered

    const set = rec.events.find(e => e.type === 'signalSet')!
    expect(set.signal).toBe('C#signal:n')
    expect(set.turn).toBe('C#handler:s0:click') // attributed to the open turn

    const begin = rec.events.find(e => e.type === 'turnBegin')!
    expect(begin.handlerId).toBe('C#handler:s0:click')
    expect(begin.loc).toBe('C.tsx:5')
    expect(begin.turn).toBeNull() // the marker itself carries the parent turn
  })

  test('events fired outside a turn have turn=null', () => {
    const rec = createRecordingSink()
    setProfilerSink(rec.sink)
    createRoot(() => {
      const [, setN] = createSignal(0, 'C#signal:n')
      setN(1)
    })
    expect(rec.events.find(e => e.type === 'signalSet')!.turn).toBeNull()
  })

  test('reset clears the log and the turn stack', () => {
    const rec = createRecordingSink()
    setProfilerSink(rec.sink)
    createRoot(() => {
      const [, setN] = createSignal(0, 'C#signal:n')
      beginTurn('C#handler:s0:click')
      setN(1)
      // intentionally no endTurn — reset must drop the dangling turn
    })
    rec.reset()
    expect(rec.events).toHaveLength(0)

    createRoot(() => {
      const [, setN] = createSignal(0, 'C#signal:n')
      setN(2)
    })
    // After reset the stack is empty, so this set is outside any turn.
    expect(rec.events.find(e => e.type === 'signalSet')!.turn).toBeNull()
  })
})
