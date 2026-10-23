import { createFixture } from '../src/types'

/**
 * Sibling of `loop-row-child-children-nested-row-var-shapes`: a loop-row
 * child's forwarded children hold an inner loop that reads both its own
 * index and the row's, next to text whose string literal spells the row
 * index's Go template variable (`$i`) without reading the index. The first
 * prints both indexes per row, the second the literal text.
 */
export const fixture = createFixture({
  id: 'loop-row-child-children-nested-row-var-literal',
  description:
    "An inner loop in a loop-row child's forwarded children reads the row index, and a string literal spells it",
  source: `
'use client'
function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

type Row = { id: string; label: string; tags: string[] }

export function LoopRowChildChildrenNestedRowVarLiteral(props: { rows: Row[] }) {
  return (
    <div>
      <p class="both">
        {props.rows.map((o, i) => (
          <Chip key={o.id}>
            <ul>{o.tags.map((tag, j) => <li key={tag}>{tag}-{j}-{i}</li>)}</ul>
          </Chip>
        ))}
      </p>
      <p class="literal">
        {props.rows.map((o, i) => (
          <Chip key={o.id}>
            <b>{'cost $i'}</b>
            <i>{o.label}</i>
          </Chip>
        ))}
      </p>
    </div>
  )
}
`,
  props: {
    rows: [
      { id: 'x', label: 'X', tags: ['p', 'q'] },
      { id: 'y', label: 'Y', tags: ['r'] },
    ],
  },
  expectedHtml: `
    <div bf-s="test">
      <p bf="s5" class="both">
        <span bf-s="Chip_*" class="chip" data-key="x"><ul bf="^s3"><li data-key-1="p"><!--bf:^s0-->p<!--/-->-<!--bf:^s1-->0<!--/-->-<!--bf:^s2-->0<!--/--></li><li data-key-1="q"><!--bf:^s0-->q<!--/-->-<!--bf:^s1-->1<!--/-->-<!--bf:^s2-->0<!--/--></li></ul></span>
        <span bf-s="Chip_*" class="chip" data-key="y"><ul bf="^s3"><li data-key-1="r"><!--bf:^s0-->r<!--/-->-<!--bf:^s1-->0<!--/-->-<!--bf:^s2-->1<!--/--></li></ul></span>
      </p>
      <p bf="s8" class="literal">
        <span bf-s="Chip_*" class="chip" data-key="x">
          <b>cost $i</b>
          <i><!--bf:^s6-->X<!--/--></i>
        </span>
        <span bf-s="Chip_*" class="chip" data-key="y">
          <b>cost $i</b>
          <i><!--bf:^s6-->Y<!--/--></i>
        </span>
      </p>
    </div>
  `,
})
