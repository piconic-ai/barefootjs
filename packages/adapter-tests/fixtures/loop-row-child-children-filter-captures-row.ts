import { createFixture } from '../src/types'

/**
 * A loop-row child's forwarded children read the calling row's item from
 * inside a nested `.filter()` predicate (`t !== o.label`). The predicate
 * runs inside the inner loop, where the template's dot is the inner row, so
 * the outer row is read through its own variable. Siblings: the same
 * capture over a destructured row, the row index captured by the
 * predicate, the row read in a nested loop's body, the capture through a
 * component nested in the forwarded children, and the row read in a
 * condition and in an inner element's attribute. Each loop has its own
 * wrapper component. Each row renders its own values.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-filter-captures-row',
  description:
    "A filter predicate, nested loop, condition and attribute inside a loop-row child's forwarded children read the calling row item per row",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Card({ children }: { children?: any }) {
  return <q class="card">{children}</q>
}

function Tag({ children }: { children?: any }) {
  return <b class="tag">{children}</b>
}

function Mark({ children }: { children?: any }) {
  return <em class="mark">{children}</em>
}

function Pill({ children }: { children?: any }) {
  return <s class="pill">{children}</s>
}

function Box({ children }: { children?: any }) {
  return <u class="box">{children}</u>
}

function Note({ children }: { children?: any }) {
  return <small class="note">{children}</small>
}

function Flag({ children }: { children?: any }) {
  return <mark class="flag">{children}</mark>
}

type Row = { id: string; label: string; tags: string[]; on: boolean }

export function LoopRowChildChildrenFilterCapturesRow(props: { rows: Row[] }) {
  return (
    <div>
      <p class="filter">
        {props.rows.map((o, i) => (
          <Chip key={o.id}>
            <ul>{o.tags.filter(t => t !== o.label).map(t => <li key={t}>{t}</li>)}</ul>
          </Chip>
        ))}
      </p>
      <p class="destructured">
        {props.rows.map(({ id, label, tags }) => (
          <Card key={id}>
            <ul>{tags.filter(t => t !== label).map(t => <li key={t}>{t}</li>)}</ul>
          </Card>
        ))}
      </p>
      <p class="index">
        {props.rows.map((o, i) => (
          <Tag key={o.id}>
            <ul>{o.tags.filter(t => i > 0 || t !== 'q').map(t => <li key={t}>{t}</li>)}</ul>
          </Tag>
        ))}
      </p>
      <p class="body">
        {props.rows.map((o) => (
          <Mark key={o.id}>
            <ul>{o.tags.map(t => <li key={t}>{o.label}-{t}</li>)}</ul>
          </Mark>
        ))}
      </p>
      <p class="nested">
        {props.rows.map((o) => (
          <Pill key={o.id}>
            <Box>
              <ul>{o.tags.filter(t => t !== o.label).map(t => <li key={t}>{t}</li>)}</ul>
            </Box>
          </Pill>
        ))}
      </p>
      <p class="cond">
        {props.rows.map((o) => (
          <Note key={o.id}>
            {o.on ? <b>{o.label}</b> : <i>off</i>}
          </Note>
        ))}
      </p>
      <p class="attr">
        {props.rows.map((o) => (
          <Flag key={o.id}>
            <a data-label={o.label} title={o.id}>{o.label}</a>
          </Flag>
        ))}
      </p>
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 'x', label: 'p', tags: ['p', 'q', 'r'], on: true },
      { id: 'y', label: 'r', tags: ['p', 'q', 'r'], on: false },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s3" class="filter">
        <span bf-s="Chip_*" class="chip" data-key="x"><ul bf="^s1"><li data-key-1="q"><!--bf:^s0-->q<!--/--></li><li data-key-1="r"><!--bf:^s0-->r<!--/--></li></ul></span>
        <span bf-s="Chip_*" class="chip" data-key="y"><ul bf="^s1"><li data-key-1="p"><!--bf:^s0-->p<!--/--></li><li data-key-1="q"><!--bf:^s0-->q<!--/--></li></ul></span>
      </p>
      <p bf="s7" class="destructured">
        <q bf-s="Card_*" class="card" data-key="x"><ul bf="^s5"><li data-key-1="q"><!--bf:^s4-->q<!--/--></li><li data-key-1="r"><!--bf:^s4-->r<!--/--></li></ul></q>
        <q bf-s="Card_*" class="card" data-key="y"><ul bf="^s5"><li data-key-1="p"><!--bf:^s4-->p<!--/--></li><li data-key-1="q"><!--bf:^s4-->q<!--/--></li></ul></q>
      </p>
      <p bf="s11" class="index">
        <b bf-s="Tag_*" class="tag" data-key="x"><ul bf="^s9"><li data-key-1="p"><!--bf:^s8-->p<!--/--></li><li data-key-1="r"><!--bf:^s8-->r<!--/--></li></ul></b>
        <b bf-s="Tag_*" class="tag" data-key="y"><ul bf="^s9"><li data-key-1="p"><!--bf:^s8-->p<!--/--></li><li data-key-1="q"><!--bf:^s8-->q<!--/--></li><li data-key-1="r"><!--bf:^s8-->r<!--/--></li></ul></b>
      </p>
      <p bf="s16" class="body">
        <em bf-s="Mark_*" class="mark" data-key="x"><ul bf="^s14"><li data-key-1="p"><!--bf:^s12-->p<!--/-->-<!--bf:^s13-->p<!--/--></li><li data-key-1="q"><!--bf:^s12-->p<!--/-->-<!--bf:^s13-->q<!--/--></li><li data-key-1="r"><!--bf:^s12-->p<!--/-->-<!--bf:^s13-->r<!--/--></li></ul></em>
        <em bf-s="Mark_*" class="mark" data-key="y"><ul bf="^s14"><li data-key-1="p"><!--bf:^s12-->r<!--/-->-<!--bf:^s13-->p<!--/--></li><li data-key-1="q"><!--bf:^s12-->r<!--/-->-<!--bf:^s13-->q<!--/--></li><li data-key-1="r"><!--bf:^s12-->r<!--/-->-<!--bf:^s13-->r<!--/--></li></ul></em>
      </p>
      <p bf="s21" class="nested">
        <s bf-s="Pill_*" class="pill" data-key="x"><u bf-s="test_s19" class="box"><ul bf="^s18"><li data-key-1="q"><!--bf:^s17-->q<!--/--></li><li data-key-1="r"><!--bf:^s17-->r<!--/--></li></ul></u></s>
        <s bf-s="Pill_*" class="pill" data-key="y"><u bf-s="test_s19" class="box"><ul bf="^s18"><li data-key-1="p"><!--bf:^s17-->p<!--/--></li><li data-key-1="q"><!--bf:^s17-->q<!--/--></li></ul></u></s>
      </p>
      <p bf="s25" class="cond">
        <small bf-s="Note_*" class="note" data-key="x"><b bf-c="^s22"><!--bf:^s23-->p<!--/--></b></small>
        <small bf-s="Note_*" class="note" data-key="y"><i bf-c="^s22">off</i></small>
      </p>
      <p bf="s29" class="attr">
        <mark bf-s="Flag_*" class="flag" data-key="x"><a bf="^s27" data-label="p" title="x"><!--bf:^s26-->p<!--/--></a></mark>
        <mark bf-s="Flag_*" class="flag" data-key="y"><a bf="^s27" data-label="r" title="y"><!--bf:^s26-->r<!--/--></a></mark>
      </p>
    </div>
  `,
})
