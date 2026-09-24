---
title: Perl Adapter
description: Render BarefootJS components from Perl — one runtime with Mojolicious and Text::Xslate (PSGI/Plack) backends.
---

# Perl Adapter

Two packages compile components to Perl templates and share one runtime (`BarefootJS`): `@barefootjs/mojolicious` emits Mojolicious EP (`.html.ep`) and `@barefootjs/xslate` emits Text::Xslate Kolon (`.tx`), which runs under any PSGI/Plack app with no framework.

Scaffold a runnable starter:

```sh
npm create barefootjs@latest -- --adapter mojo     # Mojolicious
npm create barefootjs@latest -- --adapter xslate   # Plack/Starman + Text::Xslate
```

## Install

```sh
npm install @barefootjs/mojolicious   # or @barefootjs/xslate
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/mojolicious/vite' // or '@barefootjs/xslate/vite'

export default defineConfig({
  build: { outDir: 'dist/client' },
  plugins: barefoot({ components: ['components'], templates: 'dist/templates' }),
})
```

## Render from your server

**Mojolicious.** Load `Mojolicious::Plugin::BarefootJS`. It registers a `bf` helper (backed by `BarefootJS::Backend::Mojo`) that the generated templates call, and the templates render like any other `.html.ep`:

```perl
use Mojolicious::Lite -signatures;

plugin 'BarefootJS';
app->renderer->paths->[0] = app->home->child('dist/templates');

get '/' => sub ($c) {
    $c->render(template => 'Counter', layout => 'default', initial => 0);
};

app->start;
```

Print `<%== $c->bf->scripts %>` before `</body>` in the layout.

**Text::Xslate (PSGI/Plack).** The backend is a plain `Text::Xslate` instance, so any PSGI app can render:

```perl
use BarefootJS;
use BarefootJS::Backend::Xslate;

my $backend = BarefootJS::Backend::Xslate->new(path => ['dist/templates']);

my $app = sub {
    my $bf = BarefootJS->new(undef, { backend => $backend });
    $bf->_scope_id('Counter_' . int(rand(1e6)));
    my $body = $backend->render_named('Counter', $bf, { initial => 0 });
    my $html = "<!doctype html><body>$body" . $bf->scripts . '</body>';
    return [200, ['Content-Type' => 'text/html; charset=utf-8'], [$html]];
};
```

## Notes

- CPAN distributions: `BarefootJS` (the runtime, core Perl only), `BarefootJS-Backend-Xslate` (adds `Text::Xslate`), and `Mojolicious-Plugin-BarefootJS` (adds `Mojolicious`). The JS toolchain is needed at build time only.
- EP escapes `<%= %>` and prints raw with `<%== %>`; Kolon auto-escapes `<: :>`, and helpers that emit markup return `mark_raw` values.
- Dev auto-reload: `vite dev` rewrites `dist/.dev/build-id` after every rebuild and `BarefootJS::DevReload` pushes a reload over SSE. Mojolicious: `plugin 'BarefootJS::DevReload'` and `%== bf_dev_snippet` before `</body>`. Plack: mount `BarefootJS::DevReload->to_app(dist_dir => 'dist')` at an endpoint and print `BarefootJS::DevReload->snippet('/_bf/reload')` in the layout; use a prefork server (Starman) in dev. Both are no-ops in production.
- Disable the template cache in development (`xslate_options => { cache => 0 }`, or `app->renderer->cache->max_keys(0)` in Mojolicious) so rebuilt templates render on the next request.

Examples: [`integrations/mojolicious`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/mojolicious) and [`integrations/xslate`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/xslate).
