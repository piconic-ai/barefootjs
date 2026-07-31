/**
 * Render-level divergences against the shared conformance corpus
 * (Priority-12 edge-case sweep, #2168): fixtures that COMPILE clean on
 * this adapter but whose rendered output diverges from the Hono
 * reference on real PHP Blade (or fatals at render time).
 *
 * Consumed by this package's conformance test (its `skipJsx` set is
 * derived from these keys, so the skip list and this declaration can't
 * drift) and by `packages/compat`, which publishes the entries in the
 * fixture-divergences section of `ui/compat.lock.json` — surfaced on
 * the docs compatibility-matrix page. Graduating an entry means fixing
 * the adapter (or the shared compiler layer) and deleting the line.
 */

import type { RenderDivergences } from '@barefootjs/jsx'

export const renderDivergences: RenderDivergences = {
  // `todo-app` / `todo-app-ssr` no longer diverge (#2209) — the shared
  // `evaluateSignalInit` (`@barefootjs/jsx`, sandboxed real-JS evaluation
  // instead of a fixed regex-shape catalogue) now correctly seeds `todos`
  // from `(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`.

  // #2444: a child component nested inside a dynamic loop row whose root
  // is a plain element (`composite` loop plan + `nestedComponents`) is
  // rendered through the runtime's `render_child`, which mints its own
  // `Badge_<random>` scope id instead of deriving the parent-scope +
  // mount-slot id (`test_s0`) the Hono reference emits. Content is
  // correct; only `bf-s` diverges. Same class as the `grandchild-
  // composition` CSR skip.
  'composite-row-child-component':
    'a child component nested inside a dynamic loop row gets a random `Name_<id>` scope id from `render_child` instead of the parent-derived `<parent>_s0` the reference emits (https://github.com/piconic-ai/barefootjs/issues/2444)',

  // #2447: the `.map()` callback preamble's value declarations
  // (`const cls = row.done ? 'done' : 'open'`) are not lowered into the
  // template at all, so the emitted row references a variable nothing ever
  // assigns and the attribute renders empty. Pre-existing — confirmed by
  // running the fixture with the §9.5 lazy-preamble compiler change reverted.
  'loop-preamble-attr-value':
    "a `.map()` callback preamble's value declarations are not lowered into the template, so the row reads an unassigned variable and the attribute renders empty (https://github.com/piconic-ai/barefootjs/issues/2447)",
}
