import { createFixture } from '../src/types'

/**
 * An optional prop with a destructure default (`count = 0`, `on = false`,
 * `label = ''`, `n = 5`) forwarded into a child that reads it with `??` /
 * a presence test. The destructure applies the default before the child is
 * called, so an omitted prop reaches the child as the default — `0`,
 * `false` and `''` included — never as `undefined` (also in a loop row).
 * A present value still replaces the default.
 */
export const fixture = createFixture({
  id: 'child-forwarded-defaulted-optional-prop',
  description: 'an omitted optional prop with a destructure default forwarded into a child\'s ?? read',
  source: `
function ShowNumber(props: { value?: number }) {
  return <i data-v={props.value ?? 'none'}>{props.value ?? 'none'}|{props.value !== undefined ? 'set' : 'unset'}</i>
}
function ShowBool({ value }: { value?: boolean }) {
  return <b>{String(value ?? 'none')}|{value !== undefined ? 'set' : 'unset'}</b>
}
function ShowText(props: { value?: string }) {
  return <s data-v={props.value ?? 'none'}>[{props.value ?? 'none'}]|{props.value !== undefined ? 'set' : 'unset'}</s>
}
export function ChildForwardedDefaultedOptionalProp({ count = 0, on = false, label = '', n = 5, items }: { count?: number; on?: boolean; label?: string; n?: number; items: string[] }) {
  return (
    <div>
      <ShowNumber value={count} />
      <ShowBool value={on} />
      <ShowText value={label} />
      <ShowNumber value={n} />
      <ul>{items.map(item => <li key={item}><ShowNumber value={count} /></li>)}</ul>
    </div>
  )
}
`,
  props: { items: ['a'] },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s2" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1--></i>
      <b bf-s="test_s1" bf="s2"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1--></b>
      <s bf-s="test_s2" bf="s2" data-v="">[<!--bf:s0--><!--/-->]|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1--></s>
      <i bf-s="test_s3" bf="s2" data-v="5"><!--bf:s0-->5<!--/-->|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1--></i>
      <ul bf="s5"><li data-key="a"><i bf-s="test_s4" bf="s2" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf-cond-start:s1-->set<!--bf-cond-end:s1--></i></li></ul>
    </div>
  `,
  dataPoints: [
    { name: 'present', props: { count: 3, on: true, label: 'x', n: 2.5, items: ['a'] } },
  ],
})
