import { createFixture } from '../src/types'

/**
 * A module const read with a key its literal does not list but its
 * prototype does is not `undefined`: `REC['toString']`, `REC.constructor`
 * and `NEST.a.hasOwnProperty` read `Object.prototype`'s functions and
 * `QS['map']` reads `Array.prototype.map`, so each condition is true. A
 * template holds the literal without a prototype, so a template adapter
 * refuses the read (BF101) instead of rendering the key as missing.
 */
export const fixture = createFixture({
  id: 'module-const-inherited-key',
  description: 'a module const read with a key only its prototype has reads the inherited function',
  escapes: [{ kind: 'client-directive', fixture: 'module-const-inherited-key-client' }],
  source: `
const QS = ['a', 'b']
const REC = { k: 'v' }
const NEST = { a: { b: 1 } }
export function ModuleConstInheritedKey() {
  return (
    <p>
      {REC['toString'] ? 'y' : 'n'}|{REC.constructor ? 'y' : 'n'}|{QS['map'] ? 'y' : 'n'}|{NEST.a.hasOwnProperty ? 'y' : 'n'}
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test">y|y|y|y</p>
  `,
})
