import { createFixture } from '../src/types'

/**
 * `template-delimiter-static-text` with the props read through a props
 * object (`function C(props)`) instead of destructuring.
 */
export const fixture = createFixture({
  id: 'template-delimiter-static-text-props-object',
  description: 'Static text, literal attributes and string literals spelling template tag syntax print as written (props object)',
  source: `
export function TemplateDelimiterStaticTextPropsObject(props: { a: string; show: boolean; items: string[] }) {
  return (
    <div title="{{ 1 }}" data-d={\`{{ \${props.a} }}\`} data-e={\`{\${props.a}}\`}>
      <p>&#123;&#123; 1 &#125;&#125; &#123;% if x %&#125; &#123;# c #&#125; &#123;!! 1 !!&#125;</p>
      <p>&#123;{props.a}&#125; &#123;&#123;{props.a}&#125;&#125;</p>
      <p>{props.show ? '{{ 1 }}' : '{% x %}'}</p>
      <p>{props.show && <em>&#123;&#123; 1 &#125;&#125;{props.a}</em>}</p>
      <ul>{props.items.map(item => <li key={item} title="{{ 2 }}">{item}&#123;&#123; 2 &#125;&#125;</li>)}</ul>
      <p>{props.a + '{{ 5 }}'}|{\`\${props.a}{% 6 %}\`}</p>
    </div>
  )
}
`,
  props: { a: 'x', show: true, items: ['r1', 'r2'] },
  expectedHtml: `
    <div bf-s="test" bf="s14" data-d="{{ x }}" data-e="{x}" title="{{ 1 }}">
      <p>{{ 1 }} {% if x %} {# c #} {!! 1 !!}</p>
      <p bf="s2">{<!--bf:s0-->x<!--/-->} {{<!--bf:s1-->x<!--/-->}}</p>
      <p bf="s4"><!--bf-cond-start:s3-->{{ 1 }}<!--bf-cond-end:s3--></p>
      <p bf="s8"><em bf-c="s5" bf="s7">{{ 1 }}<!--bf:s6-->x<!--/--></em></p>
      <ul bf="s10">
        <li data-key="r1" title="{{ 2 }}"><!--bf:s9-->r1<!--/-->{{ 2 }}</li>
        <li data-key="r2" title="{{ 2 }}"><!--bf:s9-->r2<!--/-->{{ 2 }}</li>
      </ul>
      <p bf="s13"><!--bf:s11-->x{{ 5 }}<!--/-->|<!--bf:s12-->x{% 6 %}<!--/--></p>
    </div>
  `,
})
