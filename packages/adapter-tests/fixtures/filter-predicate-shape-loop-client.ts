import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `filter-predicate-shape-loop`: both filtered loops
 * are deferred to the browser, so the server renders their empty markers and
 * the client runtime renders the rows at hydration.
 */
export const fixture = createFixture({
  id: 'filter-predicate-shape-loop-client',
  description: 'A /* @client */ loop filter with no template form defers to the browser instead of refusing SSR (#3534)',
  source: `
export function FilterShapes(props: { items: { name: string; done: boolean; a: boolean; b: boolean }[] }) {
  return (
    <div>
      <ul>{/* @client */ props.items.filter(t => t.done ? t.a : t.b).map(t => <li key={t.name}>{t.name}</li>)}</ul>
      <ol>{/* @client */ props.items.filter(t => \`\${t.done ? t.name : ''}\`).map(t => <li key={t.name}>{t.name}</li>)}</ol>
    </div>
  )
}
`,
  props: {
    items: [
      { name: 'one', done: true, a: true, b: false },
      { name: 'two', done: true, a: false, b: true },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1"></ul>
      <ol bf="s3"></ol>
    </div>
  `,
})
