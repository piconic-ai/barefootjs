import { createFixture } from '../src/types'

// This escape intentionally emits no SSR rows. Keep it as an inline
// conformance fixture: SSR-vs-hydrated equality is not its contract.
export const fixture = createFixture({
  id: 'conditional-nested-loop-client-reactivity',
  description: 'Client-directive escape for conditional nested const loops',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
const GROUPS = ['a', 'b']
const CHOICES = ['1', '2']
export function ConditionalNestedClient() {
  const [open, setOpen] = createSignal(true)
  const [picked, setPicked] = createSignal('a1')

  return <section>
    <button id="toggle" onClick={() => setOpen(!open())}>toggle</button>
    <output>{picked()}</output>
    {open() ? <div>{/* @client */ GROUPS.map(group => <div key={group}>
      {CHOICES.map(choice => <button key={choice} data-choice={\`\${group}\${choice}\`}
        aria-checked={picked() === \`\${group}\${choice}\` ? 'true' : 'false'}
        onClick={() => setPicked(\`\${group}\${choice}\`)}>
        <span className="status">{picked() === \`\${group}\${choice}\` ? 'on' : 'off'}</span>
        <span className="value">{picked() + ':' + \`\${group}\${choice}\`}</span>
      </button>)}
    </div>)}</div> : null}
  </section>
}
`,
  expectedHtml: `
    <section bf-s="test" bf="s11">
      <button bf="s0" id="toggle">toggle</button>
      <output bf="s2"><!--bf:s1-->a1<!--/--></output>
      <div bf-c="s3" bf="s10"></div>
    </section>
  `,
})
