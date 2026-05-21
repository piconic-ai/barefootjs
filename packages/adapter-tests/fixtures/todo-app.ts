/**
 * TodoApp fixture lifted from
 * `integrations/shared/components/TodoApp.tsx`.
 *
 * TodoApp is the corpus' first non-trivial composition: a parent
 * signal-driven list whose children are `TodoItem` components imported
 * from a separate file, rendered via a filtered `.map(...)` with `key`.
 *
 * **Scope of this fixture-hydrate test** — TodoApp's add / toggle /
 * delete / edit operations all hit `fetch('/api/todos*')`. The
 * fixture-hydrate runner serves a static page with no API backing, so
 * mutation paths cannot be exercised here. What we DO cover is the
 * pure-client subset that proves hydration + reactivity work for this
 * shape:
 *   - Initial render of the `initialTodos` prop into a `<ul>` of
 *     `TodoItem` children.
 *   - Reactive filter switching (`setFilter` + `window.location.hash`
 *     side-effect) — clicking the filter links visibly re-projects the
 *     list without touching the network.
 *   - `.todo-count` left-counter reflects active-todo count.
 *
 * Mutation paths (toggle / add / delete) are deferred until the runner
 * gains a `page.route` interception hook or we run TodoApp against a
 * stub server fixture.
 *
 * Snapshots in `__snapshots__/todo-app.{html,client.js}` are regenerated
 * by `bun run packages/adapter-tests/scripts/snapshot.ts todo-app`.
 */

import { defineSharedFixture, type SharedFixtureSpec } from './_helpers'

const item = (id: number) => `.todo-list [data-key="${id}"]` as const

export const spec: SharedFixtureSpec = {
  id: 'todo-app',
  componentName: 'TodoApp',
  // TodoItem lives in a separate file imported by TodoApp; the snapshot
  // CLI compiles + merges both bundles so the renderChild registry
  // resolves TodoItem at hydrate time.
  additionalComponents: ['TodoItem'],
  description:
    'TodoMVC parent + filtered list of TodoItem children — initial render + reactive filter switching',
  props: {
    initialTodos: [
      { id: 1, text: 'Eat breakfast', done: true },
      { id: 2, text: 'Write tests', done: false },
      { id: 3, text: 'Ship code', done: false },
    ],
  },
  interactions: [
    // Initial state: all three todos visible, two un-done.
    { type: 'expectVisible', selector: item(1) },
    { type: 'expectVisible', selector: item(2) },
    { type: 'expectVisible', selector: item(3) },
    { type: 'expectContains', selector: '.todo-count', text: '2 items left' },

    // Switch to Active filter — the completed todo (id=1) is reconciled
    // out of the DOM; the two un-done todos remain.
    { type: 'click', selector: '.filters a[href="#/active"]' },
    { type: 'expectHidden', selector: item(1) },
    { type: 'expectVisible', selector: item(2) },
    { type: 'expectVisible', selector: item(3) },

    // Switch to Completed — only the done todo remains.
    { type: 'click', selector: '.filters a[href="#/completed"]' },
    { type: 'expectVisible', selector: item(1) },
    { type: 'expectHidden', selector: item(2) },
    { type: 'expectHidden', selector: item(3) },

    // Back to All — full list is rebuilt by the loop reconciliation.
    { type: 'click', selector: '.filters a[href="#/"]' },
    { type: 'expectVisible', selector: item(1) },
    { type: 'expectVisible', selector: item(2) },
    { type: 'expectVisible', selector: item(3) },
  ],
}

export const fixture = defineSharedFixture(spec)
