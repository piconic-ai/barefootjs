import { createFixture } from '../src/types'

/**
 * A module const declared after the component that reads it (#3739). The
 * component runs after the module has been evaluated, so the read sees the
 * value, as it does a module const declared before it. `late` reads another
 * late const, and `early` is declared before the component. `tail` reads a
 * late const (`k`) that a component const of the same name hides.
 */
export const fixture = createFixture({
  id: 'module-const-declared-after-component',
  description: 'A component reads a module const declared after it',
  source: `
'use client'
const early = 'e'

export function ModuleConstDeclaredAfterComponent() {
  const k = 'local'
  return <p title={late}>{early}/{late}/{count}/{k}/{tail}</p>
}

const lateBase = 'lb'
const late = lateBase + '!'
const count = 3
const k = 'm'
const tail = 'tail-' + k
`,
  expectedHtml: `
    <p bf-s="test" title="lb!">e/lb!/3/local/tail-m</p>
  `,
})
