import { createFixture } from '../src/types'

/**
 * A component-scope const hop through a module const, read inside a loop
 * row that shadows a name the hop passes through (#3696). A module const's
 * initializer reads module bindings, whatever the component scope or the
 * row binds by the same name:
 *
 * - `const x = 'module'; const a = x` at module scope, a component
 *   `const x = 'local'` and `const b = a`, read as `{b}` in
 *   `rows.map((a, x) => …)` and in a row that shadows nothing.
 * - Two module hops (`const tag = base + '!'; const alias = tag`) where the
 *   component declares a const named like the inner module const, read in
 *   rows that bind each name of the chain.
 *
 * The prop-hop version is `const-alias-hop-loop-shadow`.
 */
export const fixture = createFixture({
  id: 'module-const-hop-loop-shadow',
  description: 'A const hop through a module const read in a loop row that shadows a name it passes through keeps the module value',
  source: `
'use client'
const x = 'module'
const a = x
const base = 'm-base'
const tag = base + '!'
const alias = tag

export function ModuleConstHopLoopShadow({ rows }: { rows: string[] }) {
  const x = 'local'
  const b = a
  const base = 'local-base'
  const c = alias
  return (
    <div>
      <ul className="row-a-x">{rows.map((a, x) => <li key={a}>{b}/{a}/{x}</li>)}</ul>
      <ul className="row-plain">{rows.map(r => <li key={r}>{b}|{c}</li>)}</ul>
      <ul className="row-alias">{rows.map(alias => <li key={alias}>{c}/{alias}</li>)}</ul>
      <ul className="row-tag">{rows.map((tag, base) => <li key={tag} title={c}>{c}/{base}</li>)}</ul>
    </div>
  )
}
`,
  props: { rows: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s2" class="row-a-x">
        <li data-key="r1">module/<!--bf:s0-->r1<!--/-->/<!--bf:s1-->0<!--/--></li>
        <li data-key="r2">module/<!--bf:s0-->r2<!--/-->/<!--bf:s1-->1<!--/--></li>
      </ul>
      <ul bf="s3" class="row-plain">
        <li data-key="r1">module|m-base!</li>
        <li data-key="r2">module|m-base!</li>
      </ul>
      <ul bf="s5" class="row-alias">
        <li data-key="r1">m-base!/<!--bf:s4-->r1<!--/--></li>
        <li data-key="r2">m-base!/<!--bf:s4-->r2<!--/--></li>
      </ul>
      <ul bf="s7" class="row-tag">
        <li data-key="r1" title="m-base!">m-base!/<!--bf:s6-->0<!--/--></li>
        <li data-key="r2" title="m-base!">m-base!/<!--bf:s6-->1<!--/--></li>
      </ul>
    </div>
  `,
})
