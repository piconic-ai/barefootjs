import { createFixture } from '../src/types'

/**
 * A method call on a module array-literal const (`QS.join('-')`,
 * `QS.includes('a')`) is the method's result. The template receives the
 * props, not the module's consts, so a backend that reads `QS` as a
 * template variable calls the method on an unbound name.
 */
export const fixture = createFixture({
  id: 'module-const-array-method-call',
  description: 'a method call on a module array const renders its result',
  source: `
const QS = ['a', 'b']
export function ModuleConstArrayMethodCall() {
  return <p>{QS.join('-')}|{QS.includes('a') ? 'y' : 'n'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test"><!--bf:s0-->a-b<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></p>
  `,
})
