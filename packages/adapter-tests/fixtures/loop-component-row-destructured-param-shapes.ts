import { createFixture } from '../src/types'

/**
 * Sibling of `loop-component-row-destructured-param`: a component loop row
 * whose callback destructures its row param keeps each row's own key and
 * values when the key binding is renamed (`id: key`), when the prop is
 * destructured from a nested path (`meta: { tone }`), and when a
 * destructured name is rendered as text inside the row's forwarded
 * children (`<Chip key={id}><b>{label}</b>…</Chip>`), and when a quoted key
 * is destructured and passed to a component in those forwarded children
 * (`'data-priority': level` → `<Mark tone={level} />`).
 */
export const fixture = createFixture({
  id: 'loop-component-row-destructured-param-shapes',
  description: 'Destructured component loop rows keep their keys and values for renamed, nested, quoted-key and forwarded-children reads',
  source: `
'use client'
import { createMemo, createSignal } from '@barefootjs/client'

function Chip({ children }: { children?: any }) {
  return <span class="chip">{children}</span>
}

function Mark({ tone }: { tone?: string }) {
  return <em data-tone={tone}></em>
}

type Opt = { id: string; label: string; meta: { tone: string }; 'data-priority': string }
const opts: Opt[] = [
  { id: 'a', label: 'A', meta: { tone: 'warm' }, 'data-priority': 'high' },
  { id: 'b', label: 'B', meta: { tone: 'cool' }, 'data-priority': 'low' },
]

export function LoopComponentRowDestructuredShapes() {
  const [only] = createSignal<string | null>(null)
  const shown = createMemo(() => {
    const id = only()
    if (!id) return opts
    return opts.filter(o => o.id === id)
  })
  return (
    <div>
      <ul>{shown().map(({ id: key, meta: { tone } }) => <Mark key={key} tone={tone} />)}</ul>
      <ol>{shown().map(({ id, label, 'data-priority': level }) => <Chip key={id}><b>{label}</b><Mark tone={level} /></Chip>)}</ol>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test">
      <ul bf="s1">
        <em bf-s="Mark_*" bf="s0" data-key="a" data-tone="warm"></em>
        <em bf-s="Mark_*" bf="s0" data-key="b" data-tone="cool"></em>
      </ul>
      <ol bf="s5">
        <span bf-s="Chip_*" class="chip" data-key="a">
          <b><!--bf:^s2-->A<!--/--></b>
          <em bf-s="test_s3" bf="s0" data-tone="high"></em>
        </span>
        <span bf-s="Chip_*" class="chip" data-key="b">
          <b><!--bf:^s2-->B<!--/--></b>
          <em bf-s="test_s3" bf="s0" data-tone="low"></em>
        </span>
      </ol>
    </div>
  `,
})
