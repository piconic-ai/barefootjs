import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'aliased-import-child-component',
  description:
    '#2777 — a client component referenced under an import alias (`import { Foo as Bar }`, `<Bar/>`) must ' +
    "register/init/render under the DECLARED name (`Foo`, what the child's own module registers under via " +
    "hydrate('Foo', ...)), not the caller-local alias (`Bar`) — the runtime registry is keyed by string name, " +
    "so a mismatch there left initChild('Bar', ...) unable to find Foo's registration and hydration silently " +
    'never ran. SSR was already correct on every JSX-runtime adapter (the JSX tag keeps the local binding, ' +
    'which is what resolves inside the parent module) — only the client-JS registry key was wrong.',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Label as AliasedLabel } from './label'
export function Parent() {
  const [text, setText] = createSignal('hello')
  return <div><AliasedLabel value={text()} /><button onClick={() => setText('world')}>Change</button></div>
}
`,
  components: {
    './label.tsx': `
export function Label({ value }: { value: string }) {
  return <span>{value}</span>
}
`,
  },
  expectedHtml: `
    <div bf-s="test">
      <span bf-s="test_s0" bf="s1"><!--bf:s0-->hello<!--/--></span>
      <button bf="s1">Change</button>
    </div>
  `,
})
