import { createFixture } from '../src/types'

/**
 * A component that takes its props as one object whose parameter is not
 * named `props`. The root names it `p` and reads `p.<name>` as an attribute,
 * text, a ternary, an `&&` branch, a prop forwarded into a child, inside a
 * loop row, in a `.filter()` predicate feeding a `.map()` and a `.some()`
 * callback, and in a `+` concatenation, a numeric `+` and a template
 * literal. A loop whose row parameter is also named `p` shadows the props
 * object inside that row only. The children name their props object `scopeID` (read as text) and
 * `bfParent` (read as an attribute and in a ternary); `Tag` destructures
 * its props. `props-object-non-props-name-spread` spreads such an object.
 */
export const fixture = createFixture({
  id: 'props-object-non-props-name',
  description: 'A props object parameter named p, scopeID or bfParent reads the component props in every position',
  source: `
function Tag({ text }: { text: string }) {
  return <b>{text}</b>
}
function Kid(scopeID: { label: string }) {
  return <i>{scopeID.label}</i>
}
function Pill(bfParent: { label: string; on: boolean }) {
  return <u title={bfParent.label}>{bfParent.on ? bfParent.label : 'off'}</u>
}
type Row = { id: string; name: string }
export function PropsObjectNonPropsName(p: { label: string; on: boolean; n: number; cls: string; skip: string; rows: Row[] }) {
  return (
    <div className={p.cls} title={p.label}>
      <span>{p.label}</span>
      <span>{p.on ? p.label : 'off'}</span>
      {p.on && <em>{p.label}</em>}
      <Tag text={p.label} />
      <Kid label={p.label} />
      <Pill label={p.label} on={p.on} />
      <ul>
        {p.rows.map((r) => (
          <li key={r.id} title={p.label}>{r.name}-{p.label}</li>
        ))}
      </ul>
      <ol>
        {p.rows.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ol>
      <section>
        {p.rows.filter((r) => r.id !== p.skip).map((r) => (
          <a key={r.id}>{r.name}</a>
        ))}
      </section>
      <p data-on={p.on}>{p.rows.some((r) => r.id === p.skip) ? 'has' : 'none'}</p>
      <s>{p.label + '!'}</s>
      <s>{p.n + 1}</s>
      <s>{\`\${p.label}:\${p.n}\`}</s>
    </div>
  )
}
`,
  props: {
    label: 'L',
    on: true,
    n: 7,
    cls: 'c',
    skip: 'b',
    rows: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s27" class="c" title="L">
      <span bf="s1"><!--bf:s0-->L<!--/--></span>
      <span bf="s4"><!--bf-cond-start:s2--><!--bf:s3-->L<!--/--><!--bf-cond-end:s2--></span>
      <em bf-c="s5" bf="s7"><!--bf:s6-->L<!--/--></em>
      <b bf-s="test_s8" bf="s1"><!--bf:s0-->L<!--/--></b>
      <i bf-s="test_s9" bf="s1"><!--bf:s0-->L<!--/--></i>
      <u bf-s="test_s10" bf="s2" title="L"><!--bf-cond-start:s0--><!--bf:s1-->L<!--/--><!--bf-cond-end:s0--></u>
      <ul bf="s14">
        <li bf="s13" data-key="a" title="L"><!--bf:s11-->A<!--/-->-<!--bf:s12-->L<!--/--></li>
        <li bf="s13" data-key="b" title="L"><!--bf:s11-->B<!--/-->-<!--bf:s12-->L<!--/--></li>
      </ul>
      <ol bf="s16">
        <li data-key="a"><!--bf:s15-->A<!--/--></li>
        <li data-key="b"><!--bf:s15-->B<!--/--></li>
      </ol>
      <section bf="s18"><a data-key="a"><!--bf:s17-->A<!--/--></a></section>
      <p bf="s20" data-on="true"><!--bf-cond-start:s19-->has<!--bf-cond-end:s19--></p>
      <s bf="s22"><!--bf:s21-->L!<!--/--></s>
      <s bf="s24"><!--bf:s23-->8<!--/--></s>
      <s bf="s26"><!--bf:s25-->L:7<!--/--></s>
    </div>
  `,
})
