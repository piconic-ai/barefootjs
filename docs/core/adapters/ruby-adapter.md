---
title: Ruby Adapter
description: Render BarefootJS components from Ruby via ERB — runs under any Rack app (Sinatra, Rails).
---

# Ruby Adapter

`@barefootjs/erb` compiles components to ERB templates rendered by a small Ruby runtime (`BarefootJS`) over stdlib `ERB`. No web framework is required; it runs under any Rack app.

## Install

```sh
npm install @barefootjs/erb
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/erb/vite'

export default defineConfig({
  plugins: barefoot({ components: ['components'], templates: 'dist/templates' }),
})
```

## Render from your server

Vendor `lib/` (`barefoot_js.rb` and the `barefoot_js/` directory) from the npm package into your app. The runtime depends only on Ruby stdlib (`erb`, `json`).

```ruby
require 'barefoot_js'
require 'barefoot_js/backend/erb'

backend = BarefootJS::Backend::Erb.new(path: 'dist/templates')

bf = BarefootJS::Context.new(backend)
bf._scope_id("Counter_#{rand(1_000_000)}")
body = backend.render_named('Counter', bf, { initial: 0 })
html = "<!doctype html><body>#{body}#{bf.scripts}</body>"
```

## Notes

- Stdlib ERB does not auto-escape, so the compiled templates call `bf.h(...)` wherever escaping is needed. There is no separate raw-output tag: `<%= %>` prints both escaped and already-safe values.
- Each template receives two locals: `bf` (the `BarefootJS::Context` for this render) and `v` (a symbol-keyed Hash holding every prop, signal and memo the template references), e.g. `<%= bf.h(v[:count]) %>`.
- Props and other values are JSON-shaped Ruby data with symbol keys.
- `Backend::Erb.new` takes `cache: false` to re-read templates on every request in development and `json_encoder:` to swap the JSON serializer.

Examples: [`integrations/sinatra`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/sinatra) and [`integrations/rails`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/rails).
