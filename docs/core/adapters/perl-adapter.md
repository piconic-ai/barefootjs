---
title: Perl Adapter
description: Render BarefootJS components from Perl — one engine-agnostic runtime with Mojolicious and Text::Xslate (PSGI/Plack) backends.
---

# Perl Adapter

Run the same JSX components on a Perl backend. BarefootJS compiles your JSX into
a **marked template** plus **client JS**; on the server, a small Perl runtime
renders those templates. The runtime is deliberately **template-engine- and
web-framework-agnostic**, so one implementation drives multiple stacks.

```
JSX → IR → marked template (.ep / .tx) + Component.client.js
                 │
                 ▼
   BarefootJS runtime  ──delegates──▶  pluggable backend
   (@barefootjs/perl)                  (Mojolicious | Text::Xslate)
```

## Two backends, one runtime

| Backend | Template syntax | Compile-time package | Runtime | Where it runs |
|---------|-----------------|----------------------|---------|---------------|
| Mojolicious | EP (`<%= %>`) | `@barefootjs/mojolicious` | `Mojolicious::Plugin::BarefootJS` + `BarefootJS::Backend::Mojo` | Mojolicious apps |
| Text::Xslate | Kolon (`<: :>`) | `@barefootjs/xslate` | `BarefootJS::Backend::Xslate` | **any PSGI / Plack app** (no framework) |

Both compile-time packages emit per-component template files and the shared
client JS, and both render through the same engine-agnostic Perl runtime
(`BarefootJS`, shipped by `@barefootjs/perl`). The only thing that differs is
the **backend**: a tiny object that implements the four operations the runtime
delegates to.

### The backend contract

Everything that depends on *how* a template renders — JSON marshalling,
raw-string marking, JSX-children materialisation, and named-template
rendering — lives behind a `backend` object with four methods:

| Method | Purpose |
|--------|---------|
| `encode_json($data)` | Serialize a value for `bf-p` props / inline JSON |
| `mark_raw($str)` | Mark already-safe HTML so the engine won't re-escape it |
| `materialize($value)` | Resolve captured JSX children to a string |
| `render_named($name, $bf, \%vars)` | Render a child component's template |

Because that is the *only* engine-specific surface, the EP→Kolon mapping is
mechanical and the runtime is reused unchanged:

| Mojolicious EP | Text::Xslate Kolon |
|----------------|--------------------|
| `<%= EXPR %>` (escaped) | `<: EXPR :>` (Kolon auto-escapes) |
| `<%== EXPR %>` (raw) | `<: EXPR \| mark_raw :>` |
| `bf->method(args)` | `$bf.method(args)` |
| `% if (C) { … % }` | `: if (C) { … : }` |

## Mojolicious

```
npm install @barefootjs/mojolicious
```

Scaffold a runnable starter:

```
npm create barefootjs@latest -- --adapter mojo
```

Configure the build (`barefoot.config.ts`):

```typescript
import { createConfig } from '@barefootjs/mojolicious/build'

export default createConfig({
  components: ['./components'],
  outDir: 'dist',
})
```

In your app, load the plugin — it registers a `bf` helper that gives each
request a `BarefootJS` runtime backed by `BarefootJS::Backend::Mojo`:

```perl
use Mojolicious::Lite -signatures;

plugin 'BarefootJS';

get '/counter' => sub ($c) {
    $c->render(template => 'Counter', layout => 'default');
};

app->start;
```

The generated `.html.ep` templates call the runtime through the `bf` helper
(`<%== bf->scope_attr %>`, `<%= bf->json($data) %>`, …).

## Text::Xslate (PSGI / Plack)

```
npm install @barefootjs/xslate
```

Scaffold a runnable starter (a plain Plack/PSGI app served by Starman):

```
npm create barefootjs@latest -- --adapter xslate
```

```typescript
import { createConfig } from '@barefootjs/xslate/build'

export default createConfig({
  components: ['./components'],
  outDir: 'dist',
})
```

The build emits Kolon `.tx` templates. The backend is just a plain
`Text::Xslate` instance, so it runs under **any PSGI/Plack app** — no
Mojolicious required:

```perl
use BarefootJS;
use BarefootJS::Backend::Xslate;

my $backend = BarefootJS::Backend::Xslate->new(path => ['dist/templates']);

my $app = sub {
    my $env = shift;
    my $bf  = BarefootJS->new(undef, { backend => $backend });
    $bf->_scope_id('Counter_' . int(rand(1e6)));
    my $body = $backend->render_named('Counter', $bf, { count => 0 });
    my $html = "<!doctype html><body>$body" . $bf->scripts . '</body>';
    return [200, ['Content-Type' => 'text/html; charset=utf-8'], [$html]];
};
```

The generated Kolon templates call the runtime as a `bf` object
(`<: $bf.scope_attr() :>`, `<: $bf.json($data) :>`, …). Kolon auto-escapes
`<: … :>` interpolations; helpers that emit markup return `mark_raw` values.

## CPAN distributions

The Perl side is packaged as standalone CPAN distributions (built with
[Minilla](https://metacpan.org/pod/Minilla)), so a Perl app can depend on them
without the JS toolchain at runtime:

| Distribution | Main module | Depends on |
|--------------|-------------|------------|
| `BarefootJS` | `BarefootJS` | core Perl only |
| `BarefootJS-Backend-Xslate` | `BarefootJS::Backend::Xslate` | `BarefootJS`, `Text::Xslate` |
| `Mojolicious-Plugin-BarefootJS` | `Mojolicious::Plugin::BarefootJS` | `BarefootJS`, `Mojolicious` |

## Dev auto-reload

`barefoot build --watch` writes a sentinel after each rebuild; the browser can
subscribe to a small SSE endpoint and reload automatically. The logic is
framework-agnostic (`BarefootJS::DevReload`):

- **Mojolicious:** `plugin 'BarefootJS::DevReload'`, then emit `%== bf_dev_snippet` before `</body>`.
- **PSGI / Plack:** mount `BarefootJS::DevReload->to_app(dist_dir => 'dist')` at the SSE endpoint, and emit `BarefootJS::DevReload->snippet($endpoint)` in your layout. Run under a prefork server (Starman / Starlet) in dev.

Both are no-ops in production.

## Examples

Runnable end-to-end apps that render the same shared components on a Perl
backend live under
[`integrations/`](https://github.com/piconic-ai/barefootjs/tree/main/integrations) —
including SSR, fine-grained reactivity, a REST todo API, and SSE streaming.

## See also

- [Adapter Architecture](./adapter-architecture.md) — the `TemplateAdapter` interface and IR contract
- [Backend Freedom](../core-concepts/backend-freedom.md) — why the same JSX runs on any stack
- [Writing a Custom Adapter](./custom-adapter.md)
