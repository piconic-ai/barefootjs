import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-nested-index-prop` and
 * `-preamble-prop`: a loop-row child's forwarded children read the row's
 * index and callback-body locals in every position they can appear — a
 * nested component's prop computed from the index, the index and a local
 * as text, a component nested two levels down, a destructured row over an
 * array prop (whose names the nested component's children also read), and
 * a plain loop over an array prop. Each row renders its own values.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-row-var-shapes',
  description:
    "Components and text inside a loop-row child's forwarded children read the row index and callback locals per row",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Pill({ children }: { children?: any }) {
  return <s class="pill">{children}</s>
}

function Tag({ children }: { children?: any }) {
  return <b class="tag">{children}</b>
}

function Box({ children }: { children?: any }) {
  return <u class="box">{children}</u>
}

function Card({ children }: { children?: any }) {
  return <q class="card">{children}</q>
}

function Mark({ pos, tone, children }: { pos?: number; tone?: string; children?: any }) {
  return <em data-pos={pos} data-tone={tone}>{children}</em>
}

function Dot({ pos }: { pos?: number }) {
  return <i data-pos={pos} />
}

type Opt = { id: string; label: string; tone: string }
const opts: Opt[] = [{ id: 'a', label: 'A', tone: 'warm' }, { id: 'b', label: 'B', tone: 'cool' }]

export function LoopRowChildChildrenNestedRowVarShapes(props: { rows: Opt[] }) {
  return (
    <div>
      <p class="computed">
        {opts.map((o, i) => {
          const t = o.tone + '-' + o.id
          return (
            <Chip key={o.id}>
              <Mark pos={i + 1} tone={t}>{o.label}</Mark>
            </Chip>
          )
        })}
      </p>
      <p class="text">
        {opts.map((o, i) => {
          const t = o.tone
          return (
            <Pill key={o.id}>
              <Mark>{i}:{t}</Mark>
            </Pill>
          )
        })}
      </p>
      <p class="deep">
        {opts.map((o, i) => (
          <Tag key={o.id}>
            <Mark>
              <Dot pos={i} />
            </Mark>
          </Tag>
        ))}
      </p>
      <p class="destructured">
        {props.rows.map(({ id, label }, i) => (
          <Box key={id}>
            <Mark pos={i}>{label}:{id}</Mark>
          </Box>
        ))}
      </p>
      <p class="prop-array">
        {props.rows.map((o, i) => (
          <Card key={o.id}>
            <Mark pos={i}>{o.label}</Mark>
          </Card>
        ))}
      </p>
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 'x', label: 'X', tone: 'dry' },
      { id: 'y', label: 'Y', tone: 'wet' },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s3" class="computed">
        <span bf-s="Chip_*" class="chip" data-key="a"><em bf-s="test_s1" bf="s0" data-pos="1" data-tone="warm-a"><!--bf:^s0-->A<!--/--></em></span>
        <span bf-s="Chip_*" class="chip" data-key="b"><em bf-s="test_s1" bf="s0" data-pos="2" data-tone="cool-b"><!--bf:^s0-->B<!--/--></em></span>
      </p>
      <p bf="s7" class="text">
        <s bf-s="Pill_*" class="pill" data-key="a"><em bf-s="test_s5" bf="s0"><!--bf:^s4-->0<!--/-->:warm</em></s>
        <s bf-s="Pill_*" class="pill" data-key="b"><em bf-s="test_s5" bf="s0"><!--bf:^s4-->1<!--/-->:cool</em></s>
      </p>
      <p bf="s11" class="deep">
        <b bf-s="Tag_*" class="tag" data-key="a"><em bf-s="test_s9" bf="s0"><i bf-s="test_s8" bf="s0" data-pos="0"></i></em></b>
        <b bf-s="Tag_*" class="tag" data-key="b"><em bf-s="test_s9" bf="s0"><i bf-s="test_s8" bf="s0" data-pos="1"></i></em></b>
      </p>
      <p bf="s16" class="destructured">
        <u bf-s="Box_*" class="box" data-key="x"><em bf-s="test_s14" bf="s0" data-pos="0"><!--bf:^s12-->X<!--/-->:<!--bf:^s13-->x<!--/--></em></u>
        <u bf-s="Box_*" class="box" data-key="y"><em bf-s="test_s14" bf="s0" data-pos="1"><!--bf:^s12-->Y<!--/-->:<!--bf:^s13-->y<!--/--></em></u>
      </p>
      <p bf="s20" class="prop-array">
        <q bf-s="Card_*" class="card" data-key="x"><em bf-s="test_s18" bf="s0" data-pos="0"><!--bf:^s17-->X<!--/--></em></q>
        <q bf-s="Card_*" class="card" data-key="y"><em bf-s="test_s18" bf="s0" data-pos="1"><!--bf:^s17-->Y<!--/--></em></q>
      </p>
    </div>
  `,
})
