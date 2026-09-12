import { createFixture } from '../src/types'

/**
 * #2946: a `'use client'` component that declares a static array-of-objects
 * const at MODULE scope (outside the component function) and `.map()`s it
 * directly — no `createSignal` wrapper in between — used to fail to render
 * its rows on every non-Hono adapter (ERB, Jinja, Twig, Blade, Xslate,
 * Rust/minijinja, Mojolicious, Go template). Hono (the reference adapter)
 * always rendered correctly, since plain JS needs no template-variable
 * indirection for a module-level `const`.
 *
 * Root cause: `resolveStaticLoopSource` (`packages/jsx/src/static-literal.ts`)
 * — the one shared resolver every adapter's `renderLoop` consults to inline
 * a `.map()` loop's array source as a native literal — deliberately excluded
 * `isModule` consts on the theory that a separate seeding path
 * (`ssr-defaults.ts` / Go's `convertInitialValue`) already handled them. That
 * path only ever sees a module const through a `createSignal(...)`
 * argument, never a bare `.map()` with no signal in between, so the array
 * was left completely unresolved: each adapter's fallback for an
 * unresolvable identifier produced its own distinct failure (a silently
 * empty loop body on the stash/context-based adapters, a Perl compile error
 * on Mojolicious, a Go execution-time `can't evaluate field` error).
 */
export const fixture = createFixture({
  id: 'module-const-loop-source',
  description: 'A module-scope const array `.map()`\'d directly (no signal) renders its rows on every adapter (#2946)',
  source: `
'use client'

const items = ['a', 'b', 'c']

export function ModuleConstLoopSource() {
  return (
    <div className="container">
      {items.map(item => (
        <div key={item} data-item={item}>row {item}</div>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2" class="container">
      <div bf="s1" data-item="a" data-key="a">row <!--bf:s0-->a<!--/--></div>
      <div bf="s1" data-item="b" data-key="b">row <!--bf:s0-->b<!--/--></div>
      <div bf="s1" data-item="c" data-key="c">row <!--bf:s0-->c<!--/--></div>
    </div>
  `,
})
