/**
 * Which code creates a loop row's root element, and whether that row is
 * connected before its body's tail runs.
 *
 * The "connect before init" invariant exists because `useContext` resolves by
 * walking `parentElement`: a child that initialises inside a detached row finds
 * no ancestors and falls through to the global last-writer-wins context store,
 * silently reading whichever provider on the page wrote last. So the creation
 * site has to know its destination in advance, and there are two ways to tell
 * it — a PLACEHOLDER already in the tree (`mountAt`, child slots), or the
 * AMBIENT row mount point.
 *
 * Both work because a runtime FUNCTION creates the element and can take an
 * argument. A row whose root is a template clone written inline in the emitted
 * body has no such function, so the compiler emits `mountRowRoot(clone)` to
 * consume the same ambient point — but only for the variant that initialises
 * anything inside the row. A row with no nested init has nothing that could
 * resolve wrongly, and skipping it there keeps the high-volume `mapArrayLazy`
 * emission untouched.
 *
 * This matrix pins that split against compiled output rather than
 * recollection. `mountsRow` is the load-bearing column: if it ever flips to
 * false for a shape that initialises a child, that shape has silently gone
 * back to initialising detached, and nothing else in the suite would say so —
 * the wrong value it produces is only wrong when a second provider of the same
 * context happens to be on the page.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

interface RowShape {
  /** How the row's root element comes into existence. */
  rowRoot: 'createComponent' | 'template-clone'
  /**
   * Does a child inside the row reach its `init` through a placeholder slot
   * (`upsertChild` / `upsertChildItem`)?
   *
   * Narrower than "something initialises in this row" — a conditional child
   * arrives via `insert` + `initChild` and reads false here. Read it alongside
   * `mountsRow`, never as a substitute.
   *
   * `initChild` on the row ROOT is deliberately excluded: that is the
   * hydration branch adopting an SSR-rendered row, which is in the document by
   * construction and never part of this problem.
   */
  nestedChildInit: boolean
  /** Multi-root (Fragment) body — the sibling-walk lookup path. */
  multiRoot: boolean
  /** Is the fresh row connected before the body's tail runs? */
  mountsRow: boolean
  /** Which list runtime the loop compiles to. */
  loopRuntime: string
}

function classify(loopBody: string): RowShape {
  const source = `"use client"
import { createSignal } from '@barefootjs/client'
import { Chip } from './chip'
function T() {
  const [items] = createSignal([{ id: '1', name: 'a' }])
  return <ul>{items().map((it) => ${loopBody})}</ul>
}
export { T }`
  const result = compileJSX(source, 'T.tsx', { adapter: new TestAdapter() })
  const hard = result.errors.filter((e) => e.severity !== 'warning')
  if (hard.length > 0) throw new Error(`unexpected compile error: ${hard.map((e) => e.code).join(',')}`)
  const js = result.files.find((f) => f.type === 'clientJs')?.content ?? ''

  // Slice from the list call to the end of the emitted init function.
  // Everything the row does at setup time is in there, and the top-level
  // `createComponent('T', …)` export sits after it, so it cannot be mistaken
  // for a row root. Starting at the call also excludes the import line, so
  // `mountsRow` reflects a real call site rather than the import of one.
  const call = /mapArray(?:Lazy|Anchored)?\(/.exec(js)
  if (!call) throw new Error('no list runtime call emitted')
  const hydrateAt = js.indexOf('\nhydrate(')
  const region = js.slice(call.index, hydrateAt === -1 ? undefined : hydrateAt)

  return {
    rowRoot: /cloneNode\(/.test(region) ? 'template-clone' : 'createComponent',
    nestedChildInit: /upsertChild\(|upsertChildItem\(/.test(region),
    multiRoot: /__bfExtras|upsertChildItem\(|qsaItem\(/.test(region),
    mountsRow: /mountRowRoot\(/.test(region),
    loopRuntime: /mapArray(?:Lazy|Anchored)?/.exec(region)?.[0] ?? 'unknown',
  }
}

describe('loop row creation paths — who makes the row root, and when it is connected', () => {
  test('component row root: the runtime creates it, so it takes the mount point itself', () => {
    // `<Chip/>` IS the row. `createComponent` consumes the ambient point in its
    // own step 7b, so no separate call is emitted.
    expect(classify('<Chip key={it.id} id={it.id} />')).toEqual({
      rowRoot: 'createComponent',
      nestedChildInit: false,
      multiRoot: false,
      mountsRow: false,
      loopRuntime: 'mapArray',
    })
  })

  test('markup row root with no component inside: a clone, and deliberately not mounted', () => {
    // Nothing initialises inside this row, so there is no `useContext` call
    // during setup to resolve wrongly — and this is the high-volume path, so
    // leaving it alone keeps the `mapArrayLazy` emission and the measurements
    // taken against it untouched. `mountsRow: false` here is a decision.
    expect(classify('<li key={it.id}>{it.name}</li>')).toEqual({
      rowRoot: 'template-clone',
      nestedChildInit: false,
      multiRoot: false,
      mountsRow: false,
      loopRuntime: 'mapArrayLazy',
    })
  })

  test('markup row root with a nested component: clone, mounted before the tail', () => {
    // The row root is user markup, so it is not and cannot become a component;
    // `mountRowRoot` is what gives it a destination. Flip `mountsRow` to false
    // and `upsertChild` goes back to running the child's `init` against a
    // detached element.
    expect(classify('<li key={it.id}><Chip id={it.id} /></li>')).toEqual({
      rowRoot: 'template-clone',
      nestedChildInit: true,
      multiRoot: false,
      mountsRow: true,
      loopRuntime: 'mapArray',
    })
  })

  test('two nested components in one markup row: same case, one mount', () => {
    expect(classify('<li key={it.id}><Chip id={it.id} /><Chip id={it.name} /></li>')).toEqual({
      rowRoot: 'template-clone',
      nestedChildInit: true,
      multiRoot: false,
      mountsRow: true,
      loopRuntime: 'mapArray',
    })
  })

  test('Fragment row with a nested component: mounted, and the multi-root lookup copes', () => {
    // A Fragment root can never be a component, so this shape only became
    // reachable for a mount point once the clone path got one. It is also the
    // multi-root lookup, whose sibling walk in `qsa-item.ts` used to end with
    // `return` and skip the `__bfExtras` stash the moment the primary was
    // attached — a `break` now, so an attached primary still finds its extras.
    expect(classify('<><Chip id={it.id} /><span>{it.name}</span></>')).toEqual({
      rowRoot: 'template-clone',
      nestedChildInit: true,
      multiRoot: true,
      mountsRow: true,
      loopRuntime: 'mapArray',
    })
  })

  test('conditional child in a markup row: mounted, though it inits through `insert`', () => {
    // `nestedChildInit` is false because this child arrives via `insert` +
    // `initChild` rather than `upsertChild` — but it is still a child
    // initialising inside the row, and the emission is keyed on the loop
    // variant (composite), not on which call the child arrives through. This
    // row is why the two columns have to be read separately.
    expect(classify('<li key={it.id}>{it.name ? <Chip id={it.id} /> : null}</li>')).toEqual({
      rowRoot: 'template-clone',
      nestedChildInit: false,
      multiRoot: false,
      mountsRow: true,
      loopRuntime: 'mapArray',
    })
  })
})
