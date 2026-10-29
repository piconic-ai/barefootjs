import { createFixture } from '../src/types'

/**
 * An optional, no-default prop typed as a literal union (`'default' |
 * 'icon'`, `1 | 2`) read under `??`, while the
 * caller omits it. The prop is `undefined`, so every `??` takes its
 * fallback: in a memo body, a signal seed, a child prop value, an
 * attribute, text, a ternary, `&&`, a loop row and a template literal.
 * Both a `props` object and a destructured component.
 */
export const fixture = createFixture({
  id: 'memo-nullish-omitted-literal-union-prop',
  description: 'an omitted literal-union prop takes the `??` fallback in a memo, a seed, a child prop and the template',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Show(props: { v?: string }) {
  return <i>{props.v}</i>
}

function PropsForm(props: { size?: 'default' | 'icon'; level?: 1 | 2; rows: string[] }) {
  const sz = createMemo(() => props.size ?? 'icon')
  const lv = createMemo(() => (props.level ?? 3) * 10)
  const [seed] = createSignal(\`s-\${props.size ?? 'icon'}\`)
  const sizes = { default: 'h-9', icon: 'size-9' }
  return (
    <div class={\`x \${sizes[sz()]}\`} data-lv={lv()} data-seed={seed()} data-a={props.size ?? 'icon'}>
      {sz()}|{props.size ?? 'icon'}|{(props.size ?? 'icon') === 'icon' ? 'I' : 'D'}|{(props.level ?? 0) > 1 && 'big'}
      <Show v={props.size ?? 'icon'} />
      <Show v={sz()} />
      <ul>{props.rows.map(r => <li key={r}>{r}-{props.size ?? 'icon'}-{sz()}</li>)}</ul>
      <b>{\`t:\${props.size ?? 'icon'}:\${sz()}\`}</b>
    </div>
  )
}

function Destructured({ size, level, rows }: { size?: 'default' | 'icon'; level?: 1 | 2; rows: string[] }) {
  const sz = createMemo(() => size ?? 'icon')
  const lv = createMemo(() => (level ?? 3) * 10)
  const sizes = { default: 'h-9', icon: 'size-9' }
  return (
    <p class={\`x \${sizes[sz()]}\`} data-lv={lv()} data-a={size ?? 'icon'}>
      {sz()}|{size ?? 'icon'}|{(size ?? 'icon') === 'icon' ? 'I' : 'D'}
      <Show v={size ?? 'icon'} />
      <ul>{rows.map(r => <li key={r}>{r}-{size ?? 'icon'}-{sz()}</li>)}</ul>
    </p>
  )
}

export function MemoNullishOmittedLiteralUnionProp(props: { size?: 'default' | 'icon'; level?: 1 | 2; rows: string[] }) {
  return (
    <section>
      <PropsForm rows={props.rows} />
      <PropsForm size={props.size} level={props.level} rows={props.rows} />
      <Destructured rows={props.rows} />
      <Destructured size={props.size} level={props.level} rows={props.rows} />
    </section>
  )
}
`,
  props: { rows: ['r'] },
  expectedHtml: `
    <section bf-s="test">
      <div bf-s="test_s0" bf="s13" class="x size-9" data-a="icon" data-lv="30" data-seed="s-icon">
        <!--bf:s0-->icon<!--/-->|<!--bf:s1-->icon<!--/-->|<!--bf-cond-start:s2-->I<!--bf-cond-end:s2-->|<!--bf-cond-start:s3-->
        <!--bf-cond-end:s3-->
        <i bf-s="test_s0_s4" bf="s1"><!--bf:s0-->icon<!--/--></i>
        <i bf-s="test_s0_s5" bf="s1"><!--bf:s0-->icon<!--/--></i>
        <ul bf="s10"><li bf="s9" data-key="r"><!--bf:s6-->r<!--/-->-<!--bf:s7-->icon<!--/-->-<!--bf:s8-->icon<!--/--></li></ul>
        <b bf="s12"><!--bf:s11-->t:icon:icon<!--/--></b>
      </div>
      <div bf-s="test_s1" bf="s13" class="x size-9" data-a="icon" data-lv="30" data-seed="s-icon">
        <!--bf:s0-->icon<!--/-->|<!--bf:s1-->icon<!--/-->|<!--bf-cond-start:s2-->I<!--bf-cond-end:s2-->|<!--bf-cond-start:s3-->
        <!--bf-cond-end:s3-->
        <i bf-s="test_s1_s4" bf="s1"><!--bf:s0-->icon<!--/--></i>
        <i bf-s="test_s1_s5" bf="s1"><!--bf:s0-->icon<!--/--></i>
        <ul bf="s10"><li bf="s9" data-key="r"><!--bf:s6-->r<!--/-->-<!--bf:s7-->icon<!--/-->-<!--bf:s8-->icon<!--/--></li></ul>
        <b bf="s12"><!--bf:s11-->t:icon:icon<!--/--></b>
      </div>
      <p bf-s="test_s2" bf="s9" class="x size-9" data-a="icon" data-lv="30">
        <!--bf:s0-->icon<!--/-->|<!--bf:s1-->icon<!--/-->|<!--bf-cond-start:s2-->I<!--bf-cond-end:s2-->
        <i bf-s="test_s2_s3" bf="s1"><!--bf:s0-->icon<!--/--></i>
        <ul bf="s8"><li bf="s7" data-key="r"><!--bf:s4-->r<!--/-->-<!--bf:s5-->icon<!--/-->-<!--bf:s6-->icon<!--/--></li></ul>
      </p>
      <p bf-s="test_s3" bf="s9" class="x size-9" data-a="icon" data-lv="30">
        <!--bf:s0-->icon<!--/-->|<!--bf:s1-->icon<!--/-->|<!--bf-cond-start:s2-->I<!--bf-cond-end:s2-->
        <i bf-s="test_s3_s3" bf="s1"><!--bf:s0-->icon<!--/--></i>
        <ul bf="s8"><li bf="s7" data-key="r"><!--bf:s4-->r<!--/-->-<!--bf:s5-->icon<!--/-->-<!--bf:s6-->icon<!--/--></li></ul>
      </p>
    </section>
  `,
  dataPoints: [
    { name: 'present', props: { size: 'default', level: 2, rows: ['r'] } },
  ],
})
