import { createFixture } from '../src/types'

/**
 * Outer-loop row content that comes AFTER a nested inner loop — here a
 * spread over a row field (`<footer {...g.extra}>`) following the inner
 * `<ul>{g.tags.map(…)}</ul>`.
 *
 * The Go adapter tracks "am I inside a loop" in a single boolean
 * (`inLoop`) that the inner loop's exit path resets to `false` with no
 * save/restore (its Twig-family analogue does save/restore
 * `prevInLoop`). Everything in the outer row body after the inner loop
 * therefore renders through the NON-loop emission arms — the spread
 * lowers to the component-root slot mechanism (`.Spread_0`) instead of
 * the row-scoped field. The same content placed BEFORE the inner loop
 * emits correctly, which pins the state-clobber mechanism. See the
 * audit trail in #2482.
 */
export const fixture = createFixture({
  id: 'nested-loop-tail-content',
  description: 'Outer-row content after a nested inner loop still renders row-scoped (spread over a row field)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function NestedLoopTail({ groups }: { groups: { id: number; name: string; tags: string[]; extra: Record<string, string> }[] }) {
  const [n, setN] = createSignal(0)
  return (
    <div data-n={n()} onClick={() => setN(n() + 1)}>
      {groups.map((g) => (
        <section key={g.id}>
          <ul>{g.tags.map((t, j) => <li key={j}>{t}</li>)}</ul>
          <footer {...g.extra}>{g.name}</footer>
        </section>
      ))}
    </div>
  )
}
`,
  props: { groups: [{ id: 1, name: 'alpha', tags: ['x', 'y'], extra: { 'data-kind': 'a' } }, { id: 2, name: 'beta', tags: ['z'], extra: { 'data-kind': 'b' } }] },
  expectedHtml: `
    <div bf-s="test" bf="s4" data-n="0">
      <section data-key="1">
        <ul bf="s1">
          <li data-key-1="0"><!--bf:s0-->x<!--/--></li>
          <li data-key-1="1"><!--bf:s0-->y<!--/--></li>
        </ul>
        <footer bf="s3" data-kind="a"><!--bf:s2-->alpha<!--/--></footer>
      </section>
      <section data-key="2">
        <ul bf="s1"><li data-key-1="0"><!--bf:s0-->z<!--/--></li></ul>
        <footer bf="s3" data-kind="b"><!--bf:s2-->beta<!--/--></footer>
      </section>
    </div>
  `,
})
