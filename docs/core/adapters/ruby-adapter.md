---
title: Ruby Adapter
description: Render BarefootJS components from Ruby via ERB — runs under any Rack app (Sinatra, Rails).
---

# Ruby Adapter

Run the same JSX components on a Ruby backend. BarefootJS compiles your JSX
into an **ERB marked template** plus **client JS**; on the server, a small
Ruby runtime (`BarefootJS`) renders those templates through Ruby's stdlib
`ERB` — no web framework is required, so it runs under any Rack app
(Sinatra, Rails, or plain Rack).

```
JSX → IR → marked template (.erb) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  BarefootJS::Backend::Erb
   (lib/barefoot_js.rb)                (stdlib ERB)
```

It is a Ruby port of the Perl runtime (`BarefootJS.pm`, see the
[Perl Adapter](./perl-adapter.md)), keeping method names 1:1 (`bf.scope_attr`,
`bf.hydration_attrs`, `bf.render_child`, …) so the compile-time adapter and
runtime share one naming contract across languages.

## Backend contract

Like the Perl and Text::Xslate ports, everything that depends on *how* a
template renders is delegated to a small `backend` object:

| Method | Purpose |
|--------|---------|
| `encode_json(data)` | Serialize a value for `bf-p` props / inline JSON |
| `mark_raw(str)` | Mark already-safe HTML (identity for ERB — see below) |
| `materialize(value)` | Resolve captured JSX children to a string |
| `render_named(name, bf, vars)` | Render a child component's `.erb` template |

Unlike Kolon or Twig, stdlib ERB's `<%= %>` does **not** auto-escape, so
`mark_raw` is a no-op — the compiled templates call `bf.h(...)` explicitly
wherever escaping is required. `mark_raw` exists purely so runtime helpers
that already produce finished HTML (e.g. `spread_attrs`) share one
`backend.mark_raw(...)` call shape with every other BarefootJS backend.

## Usage

```
npm install @barefootjs/erb
```

Configure the build (`barefoot.config.ts`):

```typescript
import { createConfig } from '@barefootjs/erb/build'

export default createConfig({
  components: ['./components'],
  outDir: 'dist',
})
```

`bf build` emits one `.erb` file per component plus the client JS bundle. On
the Ruby side, vendor `lib/barefoot_js.rb` (from `@barefootjs/erb`) into your
app and construct the ERB backend against the output directory:

```ruby
require 'barefoot_js'
require 'barefoot_js/backend/erb'

backend = BarefootJS::Backend::Erb.new(path: 'dist/templates')
bf = BarefootJS::Context.new(backend)
bf._scope_id("Counter_#{rand(1_000_000)}")

html = backend.render_named('Counter', bf, { count: 0 })
```

Each compiled `.erb` template receives exactly two locals: `bf` (the
`BarefootJS::Context` for this render) and `v` (a symbol-keyed Hash holding
every prop/signal/memo the template references) — e.g.
`<%= bf.h(v[:count]) %>`, `<%= bf.spread_attrs(bag) %>` — stdlib ERB's
`<%=` never auto-escapes, so both plain and already-safe-HTML helpers use
the same tag; there is no separate raw-output tag like Mojolicious's `<%==`.

## See also

- [Perl Adapter](./perl-adapter.md) — the runtime this port mirrors method-for-method
- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Writing a Custom Adapter](./custom-adapter.md)
