import { createFixture } from '../src/types'

/**
 * An omitted optional number prop forwarded into a child whose own number
 * prop is optional and read with `??`. JS hands the child `undefined`, so
 * the child's `??` takes its fallback in text, an attribute and a template
 * literal, its ternary and `&&` test falsy — while a present `0` or a
 * fraction still renders as a number. Forwarded from `props.count`,
 * `props['count']`, a destructured param, a loop row, a conditional branch,
 * into both a `props` child and a destructured child; the destructured
 * relay is declared before the child it forwards into. A `.length` value
 * forwarded into the same field still renders as a number. A backend whose
 * child field is nillable must receive the caller's nil unchanged, not a
 * number converted from it.
 */
export const fixture = createFixture({
  id: 'child-forwarded-omitted-optional-number',
  description: 'an omitted optional number prop forwarded into a child\'s optional number prop read with ??',
  source: `
function RelayD({ count }: { count?: number }) {
  return <Show value={count} />
}
function Show(props: { value?: number }) {
  return (
    <i data-v={props.value ?? 'none'}>
      {props.value ?? 'none'}|{props.value ? 'y' : 'n'}|{props.value !== undefined && <b>{props.value}</b>}|{\`v:\${props.value ?? '-'}\`}
    </i>
  )
}
function ShowD({ value }: { value?: number }) {
  return (
    <em data-v={value ?? 'none'}>
      {value ?? 'none'}|{value ? 'y' : 'n'}|{value !== undefined && <b>{value}</b>}|{\`v:\${value ?? '-'}\`}
    </em>
  )
}
export function ChildForwardedOmittedOptionalNumber(props: { count?: number; items: string[] }) {
  return (
    <div>
      <Show value={props.count} />
      <ShowD value={props.count} />
      <Show value={props['count']} />
      <RelayD count={props.count} />
      <ul>{props.items.map(item => <li key={item}><Show value={props.count} /></li>)}</ul>
      {props.items.length > 0 && <ShowD value={props.count} />}
      {props.items.length > 0 ? <Show value={props.count} /> : null}
      <Show value={props.items.length} />
    </div>
  )
}
`,
  props: { items: ['a'] },
  expectedHtml: `
    <div bf-s="test" bf="s11">
      <i bf-s="test_s0" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></i>
      <em bf-s="test_s1" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></em>
      <i bf-s="test_s2" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></i>
      <i bf-s="test_s3_s0" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></i>
      <ul bf="s5"><li data-key="a"><i bf-s="test_s4" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></i></li></ul>
      <!--bf-cond-start:s6-->
      <em bf-s="test_s7" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></em>
      <!--bf-cond-end:s6-->
      <!--bf-cond-start:s8-->
      <i bf-s="test_s9" bf="s6" data-v="none"><!--bf:s0-->none<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2--><!--bf-cond-end:s2-->|<!--bf:s5-->v:-<!--/--></i>
      <!--bf-cond-end:s8-->
      <i bf-s="test_s10" bf="s6" data-v="1"><!--bf:s0-->1<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1-->|<b bf-c="s2" bf="s4"><!--bf:s3-->1<!--/--></b>|<!--bf:s5-->v:1<!--/--></i>
    </div>
  `,
  dataPoints: [
    { name: 'zero', props: { count: 0, items: ['a'] } },
    { name: 'fraction', props: { count: 2.5, items: ['a'] } },
  ],
})
