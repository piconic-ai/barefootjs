---
title: Adapters
description: Bridge between the compiler's IR and your backend's template language, enabling cross-stack component reuse.
---

# Adapters

An adapter converts the compiler's IR into a template your server can render. The same JSX source produces correct output for any adapter.

```
JSX Source
    ↓
[Phase 1] → IR (backend-agnostic)
    ↓
[Phase 2a] IR → Adapter → Marked Template  (server)
[Phase 2b] IR → Client JS                  (browser)
```

## Available Adapters

| Adapter | Output | Backend | Package |
|---------|--------|---------|---------|
| [`HonoAdapter`](./adapters/hono-adapter.md) | `.tsx` | Hono / JSX-based servers | `@barefootjs/hono` |
| [`GoTemplateAdapter`](./adapters/go-template-adapter.md) | `.tmpl` + `_types.go` | Go `html/template` | `@barefootjs/go-template` |
| [Perl](./adapters/perl-adapter.md) | `.ep` / `.tx` | Mojolicious, Text::Xslate (PSGI/Plack) | `@barefootjs/mojolicious`, `@barefootjs/xslate` |
| [Ruby](./adapters/ruby-adapter.md) | `.erb` | stdlib ERB (any Rack app — Sinatra, Rails) | `@barefootjs/erb` |
| [Python](./adapters/python-adapter.md) | `.jinja` | Jinja2 (Flask, Django, bare WSGI) | `@barefootjs/jinja` |
| [PHP](./adapters/php-adapter.md) | `.twig` | Twig (Slim, plain PHP) | `@barefootjs/twig` |
| [Rust](./adapters/rust-adapter.md) | `.j2` | minijinja (axum, actix-web, warp) | `@barefootjs/rust` |
| [CSR](./adapters/csr.md) | — (client-rendered) | None (browser-only) | `@barefootjs/client` |

> CSR is not an IR→template adapter. It renders components directly in the browser using client-side template functions — use it when the server can't (or shouldn't) emit the initial HTML.

The `GoTemplateAdapter` is web-framework-agnostic: its `html/template` output runs on any Go server. `npm create barefootjs@latest` ships scaffolds for Echo, Gin, Chi, and net/http (via `--adapter`) — see [Go Template Adapter → Server integration](./adapters/go-template-adapter.md#server-integration).

The Perl adapters share one engine-agnostic runtime (`BarefootJS`): `@barefootjs/mojolicious` targets Mojolicious EP, and `@barefootjs/xslate` targets Text::Xslate (Kolon) and runs under any PSGI/Plack app. See the [Perl Adapter](./adapters/perl-adapter.md) page.

The Ruby, Python, PHP, and Rust adapters are each single-backend, engine-agnostic ports of that same runtime model to another language: `@barefootjs/erb` (Ruby/ERB), `@barefootjs/jinja` (Python/Jinja2), `@barefootjs/twig` (PHP/Twig), and `@barefootjs/rust` (Rust/minijinja) — none of them require a specific web framework. `@barefootjs/twig` and `@barefootjs/rust` are themselves near-mechanical ports of `@barefootjs/jinja`'s Jinja2 syntax, so all three emit near-identical templates.

## Pages

| Topic | Description |
|-------|-------------|
| [Adapter Architecture](./adapters/adapter-architecture.md) | How adapters work, the `TemplateAdapter` interface, and the IR contract |
| [Hono Adapter](./adapters/hono-adapter.md) | Configuration and output format for Hono / JSX-based servers |
| [Go Template Adapter](./adapters/go-template-adapter.md) | Configuration and output format for Go `html/template` |
| [Perl Adapter](./adapters/perl-adapter.md) | Mojolicious and Text::Xslate (PSGI/Plack) backends, sharing one runtime |
| [Ruby Adapter](./adapters/ruby-adapter.md) | ERB backend, running under any Rack app |
| [Python Adapter](./adapters/python-adapter.md) | Jinja2 backend, running under any Python web framework |
| [PHP Adapter](./adapters/php-adapter.md) | Twig backend, running under any PHP web app |
| [Rust Adapter](./adapters/rust-adapter.md) | minijinja backend, running under any Rust web framework |
| [CSR](./adapters/csr.md) | Client-side rendering without a server-rendered template |
| [Writing a Custom Adapter](./adapters/custom-adapter.md) | Step-by-step guide to implementing your own adapter |
