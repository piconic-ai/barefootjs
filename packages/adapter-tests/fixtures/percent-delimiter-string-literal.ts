import { createFixture } from '../src/types'

/**
 * String literals that spell an embedded-code tag delimiter (`%>`, `<%`,
 * `=%>`, `%%>`, `<%%`, with Kolon `:>` and brace delimiters alongside) in
 * expression positions: text, attribute, ternary, `&&`, child prop, a
 * static array a loop iterates, concatenation and template-literal text,
 * plus one combined with a newline. ERB and Mojolicious spell the literal
 * inside a template tag, so it must not end (or open) that tag. Hono prints
 * each value as written.
 */
export const fixture = createFixture({
  id: 'percent-delimiter-string-literal',
  description: 'String literals spelling %> / <% in expression positions print as written (destructured props)',
  source: `
import { Tag } from './Tag'
export function PercentDelimiterStringLiteral({ a, show }: { a: string; show: boolean }) {
  return (
    <div title={'t %> 1'} data-a={show ? '<% 2' : '%> 3'} data-b={\`\${a} %> 4\`}>
      <p>{'a %> b'}</p>
      <p>{'<% c %>'}|{'d =%> e'}|{'f %%> g'}|{'h <%% i'}|{'j <%= k'}|{'s :> t <: u'}|{'v }} w {{ y'}|{'é "#{z}" \\\\ $q @r %>'}</p>
      <p>{show ? 'l %> m' : '<% n'}</p>
      <p>{show && 'o %> p'}</p>
      <ol>{['r %>', '<% r', 'r =%>'].map(r => <li key={r} title={r + ' %>'}>{r}</li>)}</ol>
      <Tag label="q %> 5" note={'q %> 6'} />
      <p>{a + ' %> 7'}|{\`\${a}<% 8 %>\`}|{'%>\\n<%'}</p>
    </div>
  )
}
`,
  components: {
    './Tag': `
export function Tag(props: { label: string; note: string }) {
  return <span data-label={props.label}>{props.note}</span>
}
`,
  },
  props: { a: 'x', show: true },
  expectedHtml: `
    <div bf-s="test" bf="s13" data-a="&lt;% 2" data-b="x %&gt; 4" title="t %&gt; 1">
      <p bf="s1"><!--bf:s0-->a %&gt; b<!--/--></p>
      <p>&lt;% c %&gt;|d =%&gt; e|f %%&gt; g|h &lt;%% i|j &lt;%= k|s :&gt; t &lt;: u|v }} w {{ y|é &quot;#{z}&quot; \\ $q @r %&gt;</p>
      <p bf="s3"><!--bf-cond-start:s2-->l %&gt; m<!--bf-cond-end:s2--></p>
      <p bf="s5"><!--bf-cond-start:s4-->o %&gt; p<!--bf-cond-end:s4--></p>
      <ol bf="s8">
        <li bf="s7" data-key="r %&gt;" title="r %&gt; %&gt;"><!--bf:s6-->r %&gt;<!--/--></li>
        <li bf="s7" data-key="&lt;% r" title="&lt;% r %&gt;"><!--bf:s6-->&lt;% r<!--/--></li>
        <li bf="s7" data-key="r =%&gt;" title="r =%&gt; %&gt;"><!--bf:s6-->r =%&gt;<!--/--></li>
      </ol>
      <span bf-s="test_s9" bf="s1" data-label="q %&gt; 5"><!--bf:s0-->q %&gt; 6<!--/--></span>
      <p bf="s12"><!--bf:s10-->x %&gt; 7<!--/-->|<!--bf:s11-->x&lt;% 8 %&gt;<!--/-->|%&gt; &lt;%</p>
    </div>
  `,
})
