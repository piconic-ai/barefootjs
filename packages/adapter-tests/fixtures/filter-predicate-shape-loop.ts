import { createFixture } from '../src/types'

/**
 * A `.filter(...).map(...)` loop whose predicate is a conditional, and one
 * whose predicate is a template literal. Every DSL adapter's loop-filter
 * emitter used to stand the truthy constant `true` / `1` in for these shapes,
 * so every row rendered with no diagnostic; each now refuses with BF101, as
 * Go already did (#3534).
 */
export const fixture = createFixture({
  id: 'filter-predicate-shape-loop',
  description: 'A loop filter predicate with no template form refuses (BF101) instead of rendering every row (#3534)',
  escapes: [{ kind: 'client-directive', fixture: 'filter-predicate-shape-loop-client' }],
  source: `
export function FilterShapes(props: { items: { name: string; done: boolean; a: boolean; b: boolean }[] }) {
  return (
    <div>
      <ul>{props.items.filter(t => t.done ? t.a : t.b).map(t => <li key={t.name}>{t.name}</li>)}</ul>
      <ol>{props.items.filter(t => \`\${t.done ? t.name : ''}\`).map(t => <li key={t.name}>{t.name}</li>)}</ol>
    </div>
  )
}
`,
  props: {
    items: [
      { name: 'one', done: true, a: true, b: false },
      { name: 'two', done: true, a: false, b: true },
      { name: 'three', done: false, a: true, b: false },
      { name: 'four', done: false, a: false, b: true },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <li data-key="one"><!--bf:s0-->one<!--/--></li>
        <li data-key="four"><!--bf:s0-->four<!--/--></li>
      </ul>
      <ol bf="s3">
        <li data-key="one"><!--bf:s2-->one<!--/--></li>
        <li data-key="two"><!--bf:s2-->two<!--/--></li>
      </ol>
    </div>
  `,
})
