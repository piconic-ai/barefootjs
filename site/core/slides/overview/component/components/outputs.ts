export const OUTPUTS = [
  {
    "id": "hono",
    "lang": "Hono",
    "engine": "hono/jsx",
    "fence": "tsx",
    "code": "export function Counter(__allProps: CounterProps & { __instanceId?: string /* ... */ }) {\n  const { __instanceId, /* ... */ ...props } = __allProps\n  const count = () => props.initial ?? 0\n\n  return (\n    <div bf-s={__scopeId} /* bf-r, bf-p ... */>\n      <p bf=\"s1\">{bfText(\"s0\")}{count()}{bfTextEnd()}</p>\n      <button onClick={() => {}} bf=\"s2\">+1</button>\n    </div>\n  )\n}"
  },
  {
    "id": "go",
    "lang": "Go",
    "engine": "html/template",
    "fence": "html",
    "code": "{{define \"Counter\"}}\n{{if .Scripts}}{{.Scripts.Register \"/static/client/barefoot.js\"}}\n             {{.Scripts.Register \"/static/client/Counter.client.js\"}}{{end}}\n<div bf-s=\"{{bfScopeAttr .}}\"\n     {{bfHydrationAttrs .}} {{bfPropsAttr .}}\n     {{if .BfDataKey}} data-key=\"{{.BfDataKey}}\"{{end}}>\n  <p bf=\"s1\">\n    {{bfTextStart \"s0\"}}{{.Count}}{{bfTextEnd}}\n  </p>\n  <button bf=\"s2\">+1</button>\n</div>\n{{end}}"
  },
  {
    "id": "rust",
    "lang": "Rust",
    "engine": "minijinja",
    "fence": "html",
    "code": "{% set _bf_reg0 = bf.register_script('/static/components/barefoot.js') %}\n{% set _bf_reg1 = bf.register_script('/static/components/Counter.client.js') %}\n{% set count = (initial if (initial is defined and initial is not none) else 0) %}\n<div bf-s=\"{{ bf.scope_attr() }}\"\n     {{ bf.hydration_attrs() | safe }} {{ bf.props_attr() | safe }}>\n  <p bf=\"s1\">\n    {{ bf.text_start(\"s0\") | safe }}{{ bf.string(count) }}{{ bf.text_end() | safe }}\n  </p>\n  <button bf=\"s2\">+1</button>\n</div>"
  },
  {
    "id": "ruby",
    "lang": "Ruby",
    "engine": "ERB",
    "fence": "erb",
    "code": "<%- bf.register_script('/static/components/barefoot.js') -%>\n<%- bf.register_script('/static/components/Counter.client.js') -%>\n<% v[:count] = ((v[:initial]).nil? ? 0 : v[:initial]) %>\n<div bf-s=\"<%= bf.scope_attr %>\"\n     <%= bf.hydration_attrs %> <%= bf.props_attr %>>\n  <p bf=\"s1\">\n    <%= bf.text_start(\"s0\") %><%= bf.h(v[:count]) %><%= bf.text_end %>\n  </p>\n  <button bf=\"s2\">+1</button>\n</div>"
  },
  {
    "id": "python",
    "lang": "Python",
    "engine": "Jinja2",
    "fence": "html",
    "code": "{% set _bf_reg0 = bf.register_script('/static/components/barefoot.js') %}\n{% set _bf_reg1 = bf.register_script('/static/components/Counter.client.js') %}\n{% set count = (initial if (initial is defined and initial is not none) else 0) %}\n<div bf-s=\"{{ bf.scope_attr() }}\"\n     {{ bf.hydration_attrs() | safe }} {{ bf.props_attr() | safe }}>\n  <p bf=\"s1\">\n    {{ bf.text_start(\"s0\") | safe }}{{ bf.string(count) }}{{ bf.text_end() | safe }}\n  </p>\n  <button bf=\"s2\">+1</button>\n</div>"
  },
  {
    "id": "php",
    "lang": "PHP",
    "engine": "Laravel Blade",
    "fence": "php",
    "code": "@php($bf->register_script('/static/components/barefoot.js'))\n@php($bf->register_script('/static/components/Counter.client.js'))\n@php($count = ($initial ?? 0))\n<div bf-s=\"{!! e($bf->scope_attr()) !!}\"\n     {!! $bf->hydration_attrs() !!} {!! $bf->props_attr() !!}>\n  <p bf=\"s1\">\n    {!! $bf->text_start(\"s0\") !!}{!! e($bf->string($count)) !!}{!! $bf->text_end() !!}\n  </p>\n  <button bf=\"s2\">+1</button>\n</div>"
  },
  {
    "id": "perl",
    "lang": "Perl",
    "engine": "Mojolicious EP",
    "fence": "perl",
    "code": "% bf->register_script('/static/components/barefoot.js');\n% bf->register_script('/static/components/Counter.client.js');\n% my $count = ($initial // 0);\n<div bf-s=\"<%= bf->scope_attr %>\"\n     <%== bf->hydration_attrs %> <%== bf->props_attr %>>\n  <p bf=\"s1\">\n    <%== bf->text_start(\"s0\") %><%= $count %><%== bf->text_end %>\n  </p>\n  <button bf=\"s2\">+1</button>\n</div>"
  }
] as const
