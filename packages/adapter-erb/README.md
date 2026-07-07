# barefoot_js

Ruby runtime for [BarefootJS](https://barefootjs.dev/) marked templates, targeting ERB.

[BarefootJS](https://github.com/piconic-ai/barefootjs) is a fine-grained reactive TSX compiler: you write components in TSX, and the compiler emits templates for your backend's template engine plus the client-side JS that hydrates them. This gem is the server half for Ruby — it renders the `.erb` templates produced by the `@barefootjs/erb` adapter.

## Installation

```sh
gem install barefoot_js
```

## Usage

Every compiled `.erb` template receives a `BarefootJS::Context` as the `bf` local. The context is engine-agnostic; everything that depends on how a template is rendered is delegated to a pluggable backend (`BarefootJS::Backend::Erb` is the ERB reference implementation):

```ruby
require 'barefoot_js'

bf = BarefootJS::Context.new(backend)
```

Values are JSON-shaped Ruby data with symbol hash keys throughout (props, env hashes, array-of-hash records).

## Documentation

- [barefootjs.dev](https://barefootjs.dev/) — core documentation
- [GitHub: piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) — monorepo (this gem lives at `packages/adapter-erb`)

## License

MIT
