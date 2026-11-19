import { createFixture } from '../src/types'

/**
 * A const computed by a method on a literal (`['doc', 'api'].includes(...)`)
 * whose name a loop row also binds (#3926). Inside the row `label` is the
 * row's own value, outside it is the const. Both must render their own value
 * on a CSR mount, with the const's call still evaluated at template scope.
 */
export const fixture = createFixture({
  id: 'csr-const-literal-method-call-shadow',
  description: 'A literal-method const and a same-named loop row binding each render their own value',
  source: `
export function Shadow(props: { kind: string }) {
  const label = ['doc', 'api'].includes(props.kind) ? 'known' : 'other'
  return (
    <section title={label}>
      <h2>{label}</h2>
      <ul>
        {['x', 'y'].map(label => (
          <li key={label}>{label}</li>
        ))}
      </ul>
    </section>
  )
}
`,
  props: { kind: 'api' },
  expectedHtml: `
    <section bf-s="test" bf="s5" title="known">
      <h2 bf="s1"><!--bf:s0-->known<!--/--></h2>
      <ul bf="s4">
        <li bf="s3" data-key="x"><!--bf:s2-->x<!--/--></li>
        <li bf="s3" data-key="y"><!--bf:s2-->y<!--/--></li>
      </ul>
    </section>
  `,
})
