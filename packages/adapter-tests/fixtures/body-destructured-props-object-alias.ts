import { createFixture } from '../src/types'

/**
 * A body destructure that reads the props object through a component-scope
 * `const` alias (`const p = props; const q = p; const { … } = q`) — the
 * shape the mutation sweep's `alias-props` mutation produces from a
 * `const { … } = props` component. It must compile exactly like the
 * destructure of `props` itself: the alias is the props object, so every
 * destructured name is a prop read (with its default and rename).
 *
 * The destructured bindings are read as an attribute, text, a ternary, an
 * `&&`, a child component prop, inside a loop row, in a `+` concat and in a
 * template literal. `on`/`title` are omitted in the default render so the
 * destructure defaults apply; the data points pass them.
 */
export const fixture = createFixture({
  id: 'body-destructured-props-object-alias',
  description: 'a body destructure of a const alias of the props object reads props in every position',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Todo = { id: number; label: string }

function AliasBadge(props: { text: string }) {
  return <b className="badge">{props.text}</b>
}

export function BodyDestructuredPropsObjectAlias(props: { title?: string; count: number; on?: boolean; name: string }) {
  const p = props
  const q = p
  const { title = 'none', count, on = false, name: renamed } = q
  const [todos] = createSignal<Todo[]>([{ id: 1, label: 'Alpha' }, { id: 2, label: 'Beta' }])
  return (
    <div data-title={title} className={\`card-\${title}\`}>
      <span className="count">{count}</span>
      <span className="state">{on ? 'yes' : 'no'}</span>
      {on && <em className="shown">{renamed}</em>}
      <AliasBadge text={renamed} />
      <span className="concat">{'n:' + renamed}</span>
      <ul>
        {todos().map(t => (
          <li key={t.id}>{t.label + ':' + title}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: {
    count: 3,
    name: 'Ann',
  },
  expectedHtml: `
    <div bf-s="test" bf="s13" class="card-none" data-title="none">
      <span bf="s1" class="count"><!--bf:s0-->3<!--/--></span>
      <span bf="s3" class="state"><!--bf-cond-start:s2-->no<!--bf-cond-end:s2--></span>
      <!--bf-cond-start:s4-->
      <!--bf-cond-end:s4-->
      <b bf-s="test_s7" bf="s1" class="badge"><!--bf:s0-->Ann<!--/--></b>
      <span bf="s9" class="concat"><!--bf:s8-->n:Ann<!--/--></span>
      <ul bf="s12">
        <li bf="s11" data-key="1"><!--bf:s10-->Alpha:none<!--/--></li>
        <li bf="s11" data-key="2"><!--bf:s10-->Beta:none<!--/--></li>
      </ul>
    </div>
  `,
  dataPoints: [
    { name: 'all-passed', props: { title: 'T', count: 0, on: true, name: 'Bo' } },
    { name: 'on-only', props: { count: 1, on: true, name: 'Cy' } },
  ],
})
