import { createFixture } from '../src/types'

/**
 * String consts and string literals holding a carriage return (a lone `\r`,
 * a CRLF, a CR at the start or end) next to other control characters (a
 * tab, U+0001, U+2028 / U+2029), written by a template adapter into its own
 * syntax. Twig's and Jinja's lexers rewrite every `\r\n` and lone `\r` in
 * the template source to `\n`, and Ruby reads a CRLF inside a string literal
 * as `\n`, so the value must be spelled with an escape the engine decodes
 * rather than a raw CR.
 *
 * The HTML comparison collapses whitespace, so a CR that came out as LF reads
 * the same as one kept. The comparisons against a prop that holds the same
 * text (`got`, `rows`) are what tell them apart: a CR the template lost makes
 * the const differ from the prop, in attribute, text, `&&`, loop-row and
 * child-prop positions, from a module const, a component-local const, a
 * Record read and an inline literal. The raw positions (attribute, text,
 * template literal, a const-array loop source, a JSX attribute entity, a
 * value with `#{`, `%>`, a backslash and quotes) keep the values in the
 * output, so a dropped CR still shows as two words run together.
 */
export const fixture = createFixture({
  id: 'string-const-carriage-return',
  description:
    'string consts and literals holding a carriage return keep it in attribute, text, comparison, loop and child-prop positions',
  source: `
import { CrChild, CrPropsChild } from './cr-child'
const CTRL = 'a\\u0001b\\rc'
const CRLF = 'x\\r\\ny'
const EDGE = '\\rmid\\r'
const WS = 'tab\\there\\u2028ls\\u2029ps'
const KEY = 'k\\rv'
const REC = { a: 'r\\rs', b: 'n' }
const ODD = '#{x} %> \\\\ " \\' \\r!'
export function StringConstCarriageReturn({ got = 'none', rows = [], pick = 'a' }: { got?: string; rows?: string[]; pick?: 'a' | 'b' }) {
  const LOCAL = 'l\\rm'
  return (
    <div data-c={CTRL} data-crlf={CRLF} data-e={EDGE} data-w={WS} data-l={LOCAL} data-i={'i\\rj'} data-t={\`[\${CTRL}]\`} data-r={REC[pick]} data-o={ODD} title="e&#13;f">
      <p>{CTRL}</p>
      <p>{CRLF}|{EDGE}|{LOCAL}|{'t\\ru'}|{ODD}</p>
      <p>{WS}</p>
      <p title="&#123;&#13;x">&#123;&#13;x</p>
      <p data-eq={got === KEY ? 'same' : 'diff'}>{got === KEY ? 'same' : 'diff'}</p>
      <p>{got === 'k\\rv' && <b>lit-same</b>}</p>
      <p>{REC[pick] === 'r\\rs' ? 'rec-same' : 'rec-diff'}</p>
      <p>{rows.includes(CRLF) ? 'has-crlf' : 'no-crlf'}</p>
      <ul>
        {[CTRL, 'r\\rs', CRLF].map(v => (
          <li key={v} data-v={v}>
            {v}
          </li>
        ))}
      </ul>
      <ol>
        {rows.map(r => (
          <li key={r} data-hit={r === KEY ? 'hit' : 'miss'}>
            {r}
          </li>
        ))}
      </ol>
      <CrChild text={CTRL} want={KEY} got={got} />
      <CrPropsChild text={'w\\rx'} want={'k\\rv'} got={got} />
    </div>
  )
}
`,
  components: {
    './cr-child.tsx': `
export function CrChild({ text, want, got }: { text: string; want: string; got: string }) {
  return (
    <em title={text} data-m={got === want ? 'same' : 'diff'}>
      {text}
    </em>
  )
}
export function CrPropsChild(props: { text: string; want: string; got: string }) {
  return (
    <span title={props.text} data-m={props.got === props.want ? 'same' : 'diff'}>
      {props.text}
    </span>
  )
}
`,
  },
  props: { got: 'k\rv', rows: ['k\rv', 'x\r\ny', 'z'] },
  expectedHtml: `
    <div bf-s="test" bf="s16" data-c="ab c" data-crlf="x y" data-e=" mid " data-i="i j" data-l="l m" data-o="#{x} %&gt; \\ &quot; &#39; !" data-r="r s" data-t="[ab c]" data-w="tab here ls ps" title="e f">
      <p>ab c</p>
      <p>x y| mid |l m|t u|#{x} %&gt; \\ &quot; &#39; !</p>
      <p>tab here ls ps</p>
      <p title="{ x">{ x</p>
      <p bf="s1" data-eq="same"><!--bf-cond-start:s0-->same<!--bf-cond-end:s0--></p>
      <p bf="s3"><b bf-c="s2">lit-same</b></p>
      <p bf="s5"><!--bf-cond-start:s4-->rec-same<!--bf-cond-end:s4--></p>
      <p bf="s7"><!--bf-cond-start:s6-->has-crlf<!--bf-cond-end:s6--></p>
      <ul bf="s10">
        <li bf="s9" data-key="ab c" data-v="ab c"><!--bf:s8-->ab c<!--/--></li>
        <li bf="s9" data-key="r s" data-v="r s"><!--bf:s8-->r s<!--/--></li>
        <li bf="s9" data-key="x y" data-v="x y"><!--bf:s8-->x y<!--/--></li>
      </ul>
      <ol bf="s13">
        <li bf="s12" data-hit="hit" data-key="k v"><!--bf:s11-->k v<!--/--></li>
        <li bf="s12" data-hit="miss" data-key="x y"><!--bf:s11-->x y<!--/--></li>
        <li bf="s12" data-hit="miss" data-key="z"><!--bf:s11-->z<!--/--></li>
      </ol>
      <em bf-s="test_s14" bf="s1" data-m="same" title="ab c"><!--bf:s0-->ab c<!--/--></em>
      <span bf-s="test_s15" bf="s1" data-m="same" title="w x"><!--bf:s0-->w x<!--/--></span>
    </div>
  `,
})
