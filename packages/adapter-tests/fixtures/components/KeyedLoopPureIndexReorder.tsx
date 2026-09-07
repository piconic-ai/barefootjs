'use client'

// Test fixture (#2861): a keyed `.map()` row whose badge text and class are
// derived PURELY from the row's own index — no signal read, no function
// call anywhere in either expression (`{i}`, `i === 1 ? … : …`). (The
// class expression deliberately avoids `%` — the Go adapter's ternary
// condition lowering has no `bf_mod` case and panics on a raw `%` in the
// emitted template; filed separately as a known-limitation, out of scope
// here since this fixture only needs SOME pure-index expression, not
// specifically modulo.)
//
// #2859/#2860 fixed index-derived output that ALREADY got a `createEffect`
// wired for some other reason (a signal read elsewhere in the expression,
// or a function call tripping the AST-flag fallback — see
// `KeyedLoopIndexReorder.tsx`'s `String(i + 1)`). This fixture is the
// residual gap those didn't touch: before #2861, `classifyReactivity` had
// no case for a pure index reference at all, so `{i}` and the class
// ternary here were baked into the row's template once at creation and
// never revisited — not even across a same-key reorder.
//
// The fix teaches `classifyReactivity` a `loop-index` source (mirroring
// its existing `loop-param` one for the item), which is enough on its own:
// the accessor-wrapping (#2859/#2860) and the lazy-row `entry.index`
// tracking (#2859/#2860's stacked follow-on) already handle whatever
// reaches them — this fixture's row has no ref/child component/inner loop,
// so it takes the LAZY row graph (`mapArrayLazy`), unlike
// `KeyedLoopIndexReorder`'s eager `mapArray` (forced eager there by the
// `class={selected() === i ...}` binding's extra signal read tripping a
// different, already-fixed path — this fixture deliberately has NO signal
// read anywhere in its row, to isolate the pure-index case on its own).
//
// The initial rows are inlined directly into `createSignal<Row[]>([...])`
// rather than referenced from a separate module-level constant — the Go
// template adapter's signal-initializer seeding only resolves an INLINE
// array literal, not a reference to a named constant (piconic-ai/barefootjs#2862).

import { createSignal } from '@barefootjs/client'

interface Row {
  id: number
  label: string
}

export function KeyedLoopPureIndexReorder() {
  const [rows, setRows] = createSignal<Row[]>([
    { id: 1, label: 'Alpha' },
    { id: 2, label: 'Bravo' },
    { id: 3, label: 'Charlie' },
  ])

  const rotate = () => {
    setRows(prev => {
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  return (
    <div>
      <button type="button" class="rotate" onClick={rotate}>
        Rotate
      </button>
      <ul>
        {rows().map((row, i) => (
          <li key={row.id} class={i === 1 ? 'odd' : 'even'}>
            <span class="badge">{i}</span>
            <span class="label">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
