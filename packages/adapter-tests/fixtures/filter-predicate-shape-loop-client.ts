import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `filter-predicate-shape-loop`: both filtered loops
 * are deferred to the browser, so no BF101 fires and every adapter renders
 * their empty markers. The rows start empty (a signal, not a prop) so the
 * CSR template renders the same markers, the same pattern as
 * `filter-nested-callback-predicate-client`.
 */
export const fixture = createFixture({
  id: 'filter-predicate-shape-loop-client',
  description: 'A /* @client */ loop filter with no template form defers to the browser instead of refusing SSR (#3534)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { name: string; done: boolean; a: boolean; b: boolean }
export function FilterShapesClient() {
  const [items, setItems] = createSignal<Item[]>([])
  return (
    <div>
      <ul>{/* @client */ items().filter(t => t.done ? t.a : t.b).map(t => <li key={t.name}>{t.name}</li>)}</ul>
      <ol>{/* @client */ items().filter(t => \`\${t.done ? t.name : ''}\`).map(t => <li key={t.name}>{t.name}</li>)}</ol>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"></ul>
      <ol bf="s3"></ol>
    </div>
  `,
})
