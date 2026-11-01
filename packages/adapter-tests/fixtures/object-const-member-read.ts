import { createFixture } from '../src/types'

/**
 * A member read of a const holding an object literal (`flags.label`) reads
 * the value the literal gives that key, as JS does, wherever it is read: a
 * ternary condition, an attribute, a template literal, text, `&&`, a
 * literal-key index. The values are computed from props (`n > 1`,
 * `'L' + n`), a shorthand prop (`{ name }`) and literals, including `0`. A
 * key the literal does not list reads `undefined`. A module object const
 * reads the same way.
 */
export const fixture = createFixture({
  id: 'object-const-member-read',
  description: 'a member read of a local or module const object reads the value the object holds',
  source: `
const MODULE_FLAGS = { wide: true, label: 'mod' }
export function ObjectConstMemberRead({ n, name }: { n: number; name: string }) {
  const flags = { big: n > 1, label: 'L' + n, zero: 0, name }
  return (
    <div className={flags.big ? 'big' : 'small'} data-label={flags.label} title={\`t-\${flags.label}\`}>
      {flags.label}|{flags.zero}|{flags.name}|{flags['label']}
      {flags.big && <b>big</b>}
      {flags.zero ? <s>zero</s> : <u>no-zero</u>}
      {MODULE_FLAGS.wide ? <i>{MODULE_FLAGS.label}</i> : null}
    </div>
  )
}
`,
  props: { n: 3, name: 'nm' },
  expectedHtml: `
    <div bf-s="test" bf="s6" class="big" data-label="L3" title="t-L3">
      <!--bf:s0-->L3<!--/-->|<!--bf:s1-->0<!--/-->|<!--bf:s2-->nm<!--/-->|<!--bf:s3-->L3<!--/-->
      <b bf-c="s4">big</b>
      <u bf-c="s5">no-zero</u>
      <i>mod</i>
    </div>
  `,
})
