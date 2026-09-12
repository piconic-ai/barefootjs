import { createFixture } from '../src/types'

/**
 * Escape twin for `module-const-loop-source-computed` (#2946): the same
 * module-scope computed-const shape, but the loop is marked
 * `/* @client *\/` so it defers to the browser instead of refusing SSR —
 * mirrors `client-only-loop`'s bare-loop marker-pair shape. SSR renders the
 * container with no rows (nothing left to adopt); the client runtime's
 * `mapArray()` materialises them at hydration time.
 */
export const fixture = createFixture({
  id: 'module-const-loop-source-computed-client',
  description: 'A /* @client */ loop over a module-scope computed const defers to the browser instead of refusing SSR (#2946)',
  source: `
'use client'

function buildItems() {
  return ['a', 'b', 'c']
}

const items = buildItems()

export function ModuleConstLoopSourceComputedClient() {
  return (
    <div className="container">
      {/* @client */ items.map(item => (
        <div key={item} data-item={item}>row {item}</div>
      ))}
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2" class="container"></div>
  `,
})
