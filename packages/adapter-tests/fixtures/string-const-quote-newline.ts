import { createFixture } from '../src/types'

/**
 * String consts and string literals holding a newline, a double quote,
 * `<`, `&`, a tab, `$` / `@` or a backslash, written by a template adapter
 * into its own syntax. A raw newline inside a string literal on a
 * line-oriented directive (Mojolicious `%`, Xslate `:`) ends the line and
 * breaks the template, so the module-const loop sources and the `===`
 * comparisons against a newline literal must be spelled with escapes. A
 * constant expression printed into an attribute (a module string const, or
 * a ternary of string literals) must be HTML-escaped like a dynamic value:
 * Twig and Pebble leave a constant expression unescaped.
 *
 * Positions: attribute, text, ternary, `&&`, concatenation, template
 * literal, a multiline template literal compared with `===`, a module
 * record read with a computed literal key (`REC['lf']`, LF and CR) in
 * attribute and text positions, module-const and inline loop sources, and child props into both a destructured child
 * and a `function C(props)` child, from consts and from JSX string
 * attributes holding a quote, a backslash or a newline.
 */
export const fixture = createFixture({
  id: 'string-const-quote-newline',
  description:
    'string consts and literals with a newline or a quote stay valid template syntax and are HTML-escaped in attribute, text, condition, loop and child-prop positions',
  source: `
import { QuoteChild, QuotePropsChild } from './quote-child'
const QS = ['q1\\nq2', 'w"x']
const Q = 'say "hi" <now> & \\'go\\''
const NL = 'a\\nb'
const FIRST = 'q1\\nq2'
const SIG = 'cost $5 @me\\t"q" \\\\end\\n'
const ML = \`m1
 m2 "x"\`
const REC = { lf: 'r1\\nr2', cr: 'c1\\rc2', q: 'say "r"' }
export function StringConstQuoteNewline({ on = true, label = 'a\\nb' }: { on?: boolean; label?: string }) {
  return (
    <div data-q={Q} data-a={on ? 'a"b' : 'c'} data-n={on ? NL : 'z'} data-t={\`\${Q} | \${on ? 'x"y' : 'z'}\`} data-c={'pre ' + Q}>
      <p>{Q}</p>
      <p>{on ? 'a"b<c>' : 'd'}</p>
      {label === 'a\\nb' && <b>eq</b>}
      {label === NL ? <i>same</i> : <i>diff</i>}
      {on && <s data-s={Q}>and</s>}
      {ML === \`m1
 m2 "x"\` && <u data-sig={SIG}>{ML}</u>}
      <ul>
        {QS.map(q => (
          <li key={q} data-q={q}>
            {q}
          </li>
        ))}
      </ul>
      <ol>
        {['r1\\nr2', 'z"y', SIG].map(r => (
          <li key={r} title={r}>
            {r}
          </li>
        ))}
      </ol>
      <dl data-rl={REC['lf']} data-rc={REC['cr']} data-rq={REC['q']} data-ro={REC['lf'] || 'z'} data-rt={on ? REC['lf'] : REC['q']}>
        <dt>{REC['lf']}</dt>
        <dd>{REC['cr']}</dd>
      </dl>
      <QuoteChild text={Q} on={on} />
      <QuotePropsChild text={FIRST} on={on} alt={on ? 'p"q' : 'r'} />
      <QuoteChild text="it's \\ a" on={false} />
      <QuotePropsChild text="l1
l2" on={false} alt="m'n" />
    </div>
  )
}
`,
  components: {
    './quote-child.tsx': `
export function QuoteChild({ text, on }: { text: string; on: boolean }) {
  return (
    <em title={text} data-a={on ? 'c"d' : 'e'}>
      {text}
      {on ? 'f"g' : 'i'}
    </em>
  )
}
export function QuotePropsChild(props: { text: string; on: boolean; alt: string }) {
  return (
    <span title={props.text} data-x={props.on ? 'j"k' : 'l'} data-nl={props.text === 'q1\\nq2' ? 'y' : 'n'}>
      {props.alt}
    </span>
  )
}
`,
  },
  expectedHtml: `
    <div bf-s="test" bf="s16" data-a="a&quot;b" data-c="pre say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39;" data-n="a b" data-q="say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39;" data-t="say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39; | x&quot;y">
      <p>say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39;</p>
      <p bf="s1"><!--bf-cond-start:s0-->a&quot;b&lt;c&gt;<!--bf-cond-end:s0--></p>
      <b bf-c="s2">eq</b>
      <i bf-c="s3">same</i>
      <s bf-c="s4" data-s="say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39;">and</s>
      <u data-sig="cost $5 @me &quot;q&quot; \\end ">m1 m2 &quot;x&quot;</u>
      <ul bf="s7">
        <li bf="s6" data-key="q1 q2" data-q="q1 q2"><!--bf:s5-->q1 q2<!--/--></li>
        <li bf="s6" data-key="w&quot;x" data-q="w&quot;x"><!--bf:s5-->w&quot;x<!--/--></li>
      </ul>
      <ol bf="s10">
        <li bf="s9" data-key="r1 r2" title="r1 r2"><!--bf:s8-->r1 r2<!--/--></li>
        <li bf="s9" data-key="z&quot;y" title="z&quot;y"><!--bf:s8-->z&quot;y<!--/--></li>
        <li bf="s9" data-key="cost $5 @me &quot;q&quot; \\end " title="cost $5 @me &quot;q&quot; \\end "><!--bf:s8-->cost $5 @me &quot;q&quot; \\end <!--/--></li>
      </ol>
      <dl bf="s11" data-rc="c1 c2" data-rl="r1 r2" data-ro="r1 r2" data-rq="say &quot;r&quot;" data-rt="r1 r2">
        <dt>r1 r2</dt>
        <dd>c1 c2</dd>
      </dl>
      <em bf-s="test_s12" bf="s2" data-a="c&quot;d" title="say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39;"><!--bf:s0-->say &quot;hi&quot; &lt;now&gt; &amp; &#39;go&#39;<!--/--><!--bf-cond-start:s1-->f&quot;g<!--bf-cond-end:s1--></em>
      <span bf-s="test_s13" bf="s1" data-nl="y" data-x="j&quot;k" title="q1 q2"><!--bf:s0-->p&quot;q<!--/--></span>
      <em bf-s="test_s14" bf="s2" data-a="e" title="it&#39;s \\ a"><!--bf:s0-->it&#39;s \\ a<!--/--><!--bf-cond-start:s1-->i<!--bf-cond-end:s1--></em>
      <span bf-s="test_s15" bf="s1" data-nl="n" data-x="l" title="l1 l2"><!--bf:s0-->m&#39;n<!--/--></span>
    </div>
  `,
})
