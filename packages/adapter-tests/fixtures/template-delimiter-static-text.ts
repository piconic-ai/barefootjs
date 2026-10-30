import { createFixture } from '../src/types'

/**
 * Static content that spells a template engine's own tag syntax: JSX text
 * that decodes from character references to `{{ 1 }}`, `{% if x %}`,
 * `{# c #}`, Blade's `{!! … !!}` / `{{-- … --}}` and Go's comment action,
 * literal attribute values, string literals in branch, concatenation and
 * child-prop positions and in a static array a loop iterates,
 * template-literal text, and a `{` right before a dynamic expression. Hono
 * prints all of it as written, so every engine must too, instead of
 * compiling it as a tag. A literal attribute value
 * spanning lines puts a line-statement sigil (`%`, `:`) at the start of a
 * template line. The last link holds literal values in URL, handler and
 * style attributes, which an engine may escape by context.
 */
export const fixture = createFixture({
  id: 'template-delimiter-static-text',
  description: 'Static text, literal attributes and string literals spelling template tag syntax print as written (destructured props)',
  source: `
import { Tag } from './Tag'
export function TemplateDelimiterStaticText({ a, show, items }: { a: string; show: boolean; items: string[] }) {
  return (
    <div title="{{ 1 }}" data-a="{% if x %}" data-b="{# c #}" data-c="{!! 1 !!}" data-d={\`{{ \${a} }}\`} data-e={\`{\${a}}\`} data-f="l1
% 1
: 2">
      <p>&#123;&#123; 1 &#125;&#125; &#123;% if x %&#125; &#123;# c #&#125; &#123;&#123;- 1 -&#125;&#125;</p>
      <p>&#123;!! 1 !!&#125; &#123;&#123;-- c --&#125;&#125; &#123;&#123;/* c */&#125;&#125; &#123;&#123;&#123; 1 &#125;&#125;&#125;</p>
      <p>&#123;{a}&#125; &#123;&#123;{a}&#125;&#125;</p>
      <p>{'{{ 1 }}'}</p>
      <p>{show ? '{{ 1 }}' : '{% x %}'}</p>
      <p>{show ? <b>&#123;&#123; 1 &#125;&#125;</b> : <i>&#123;% x %&#125;</i>}</p>
      <p>{show && <em>&#123;&#123; 1 &#125;&#125;{a}</em>}</p>
      <p>{show && '{# c #}'}</p>
      <ul>{items.map(item => <li key={item} title="{{ 2 }}">{item}&#123;&#123; 2 &#125;&#125;</li>)}</ul>
      <ol>{['r{{', 'r}} %}', 'r{%'].map(r => <li key={r}>&#123;&#123;{r}</li>)}</ol>
      <Tag label="{{ 3 }}">&#123;&#123; 4 &#125;&#125;{a}</Tag>
      <p>{a + '{{ 5 }}'}|{\`\${a}{% 6 %}\`}|{\`{{ \${a} }}\`}</p>
      <p>{a + ' }} !!} --}} @if(true)T@endif'}</p>
      <pre>x&#10;% 7&#10;: 8</pre>
      <a href="/x{{y}}" onclick="f({{1}})" style="--a:'{{'">z</a>
    </div>
  )
}
`,
  components: {
    './Tag': `
export function Tag(props: { label: string; children?: any }) {
  return <span data-label={props.label}>{props.label}{props.children}</span>
}
`,
  },
  props: { a: 'x', show: true, items: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s25" data-a="{% if x %}" data-b="{# c #}" data-c="{!! 1 !!}" data-d="{{ x }}" data-e="{x}" data-f="l1 % 1 : 2" title="{{ 1 }}">
      <p>{{ 1 }} {% if x %} {# c #} {{- 1 -}}</p>
      <p>{!! 1 !!} {{-- c --}} {{/* c */}} {{{ 1 }}}</p>
      <p bf="s2">{<!--bf:s0-->x<!--/-->} {{<!--bf:s1-->x<!--/-->}}</p>
      <p>{{ 1 }}</p>
      <p bf="s4"><!--bf-cond-start:s3-->{{ 1 }}<!--bf-cond-end:s3--></p>
      <p bf="s6"><b bf-c="s5">{{ 1 }}</b></p>
      <p bf="s10"><em bf-c="s7" bf="s9">{{ 1 }}<!--bf:s8-->x<!--/--></em></p>
      <p bf="s12"><!--bf-cond-start:s11-->{# c #}<!--bf-cond-end:s11--></p>
      <ul bf="s14">
        <li data-key="r1" title="{{ 2 }}"><!--bf:s13-->r1<!--/-->{{ 2 }}</li>
        <li data-key="r2" title="{{ 2 }}"><!--bf:s13-->r2<!--/-->{{ 2 }}</li>
      </ul>
      <ol bf="s16">
        <li data-key="r{{">{{<!--bf:s15-->r{{<!--/--></li>
        <li data-key="r}} %}">{{<!--bf:s15-->r}} %}<!--/--></li>
        <li data-key="r{%">{{<!--bf:s15-->r{%<!--/--></li>
      </ol>
      <span bf-s="test_s18" bf="s1" data-label="{{ 3 }}"><!--bf:s0-->{{ 3 }}<!--/-->{{ 4 }}<!--bf:^s17-->x<!--/--></span>
      <p bf="s22"><!--bf:s19-->x{{ 5 }}<!--/-->|<!--bf:s20-->x{% 6 %}<!--/-->|<!--bf:s21-->{{ x }}<!--/--></p>
      <p bf="s24"><!--bf:s23-->x }} !!} --}} @if(true)T@endif<!--/--></p>
      <pre>x % 7 : 8</pre>
      <a href="/x{{y}}" onclick="f({{1}})" style="--a:&#39;{{&#39;">z</a>
    </div>
  `,
})
