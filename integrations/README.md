# Integrations

Backend integration showcases. Each subdirectory is a small app that runs the
same JSX components on a different stack:

| Adapter | Runtime | Internal port | Where it runs in dev |
|---|---|---|---|
| `hono` | TypeScript / Cloudflare Workers | 3000 (bun default) | container |
| `h3` | TypeScript / UnJS h3 (Node) | 3003 | container |
| `elysia` | TypeScript / Elysia (Bun) | 3005 | container |
| `echo` | Go / Labstack Echo | 8080 | container |
| `gin` | Go / Gin | 8081 | container |
| `chi` | Go / Chi | 8082 | container |
| `nethttp` | Go / net/http (stdlib) | 8083 | container |
| `mojolicious` | Perl / Mojolicious::Lite | 3000 (morbo default) | container |
| `xslate` | Perl / Text::Xslate (Plack / Starman) | 3007 | container |
| `flask` | Python / Flask (Jinja2) | 3008 | container |
| `fastapi` | Python / FastAPI (Jinja2) | 3009 | container |
| `sinatra` | Ruby / Sinatra (ERB) | 3010 | container |
| `rails` | Ruby / Ruby on Rails (ERB) | 3011 | container |
| `axum` | Rust / Axum (minijinja) | 3012 | container |
| `php` | PHP / built-in server (Twig) | 3013 | container |
| `django` | Python / Django (Jinja2) | 3014 | container |
| `blade` | PHP / built-in server (Blade) | 3015 | container |
| `laravel` | PHP / Laravel (`artisan serve`, Blade) | 3016 | container |
| `csr` | TypeScript (no SSR) | 3002 | host (manual) |

Plus `site/core` (the docs / landing / catalog site) on internal port 4001
— it also runs in a container during dev so a single `docker compose up`
brings up the full public surface. The 4xxx range groups the host-developer
entrypoints (proxy at 4000, site shell at 4001); 3xxx is reserved for each
adapter's natural backend default.

## Development setup

`docker compose up` starts everything inside the compose network and exposes
**only the proxy port (4000) to the host** — no per-adapter port collisions
to manage. BarefootJS compilation stays on the host (`bun run build:watch`)
because that's where the JSX iteration loop is fastest; containers
bind-mount the host-built `dist/` and the file-watchers (`bun --watch`,
`air`, `morbo`) pick up the rebuilt output.

```
host:                                  containers (docker compose):
  - bun install (workspace deps)         - proxy        (bun, 4000 exposed)
  - bun run build:watch per integration  - hono         (bun + Hono)
                                         - h3           (bun + h3)
                                         - elysia       (bun + Elysia)
                                         - echo         (golang + air)
                                         - gin          (golang + air)
                                         - chi          (golang + air)
                                         - nethttp      (golang + air)
                                         - mojolicious  (perl + morbo)
                                         - xslate       (perl + starman)
                                         - flask        (python + werkzeug reloader)
                                         - fastapi      (python + uvicorn --reload)
                                         - sinatra      (ruby + puma + rerun)
                                         - rails        (ruby + puma + rerun)
                                         - axum         (rust + cargo-watch)
                                         - php          (php built-in server)
                                         - django       (python + runserver autoreload)
                                         - blade        (php built-in server)
                                         - laravel      (php artisan serve)
                                         - site-core    (bun + Hono)
```

The proxy routes by path prefix:

```
:4000/integrations/hono/*        → hono service
:4000/integrations/h3/*          → h3 service
:4000/integrations/elysia/*      → elysia service
:4000/integrations/echo/*        → echo service
:4000/integrations/gin/*         → gin service
:4000/integrations/chi/*         → chi service
:4000/integrations/nethttp/*     → nethttp service
:4000/integrations/mojolicious/* → mojolicious service
:4000/integrations/xslate/*      → xslate service
:4000/integrations/flask/*       → flask service
:4000/integrations/fastapi/*     → fastapi service
:4000/integrations/sinatra/*     → sinatra service
:4000/integrations/rails/*       → rails service
:4000/integrations/axum/*        → axum service
:4000/integrations/php/*         → php service
:4000/integrations/django/*      → django service
:4000/integrations/blade/*       → blade service
:4000/integrations/laravel/*     → laravel service
:4000/*                          → site-core (landing / docs / catalog)
```

### Full stack

```sh
# Terminal 1 — workspace install + watch-build the JSX for every integration
bun install
bun run --filter 'barefootjs-*-example' build:watch

# Terminal 2 — bring up the proxy + all adapters + site-core
bun run dev          # alias for `docker compose up`
# → http://localhost:4000
```

Other useful root scripts (all from the repo root):

| Command | What it does |
|---|---|
| `bun run dev` | `docker compose up` |
| `bun run dev:build` | `docker compose build` (rebuild dev images) |
| `bun run dev:down` | `docker compose down` |
| `bun run dev:logs` | `docker compose logs -f` |

### Working on a single adapter

Each compose service is independent (no `depends_on` between them), so any
subset can be brought up. The cleanest way to debug one adapter is to start
it together with the proxy so the URL space stays the same:

```sh
docker compose up proxy mojolicious
# → http://localhost:4000/integrations/mojolicious
# (other routes return 502 until you start their service too)
```

Or skip the proxy and hit the container directly via `docker compose run`
with an explicit port mapping:

```sh
docker compose run --service-ports -p 3010:3000 mojolicious
# → http://localhost:3010/integrations/mojolicious
```

### Pointing the proxy at a host process

If you want to run an adapter outside compose (say, attaching a debugger to
a host-side Hono process), keep `proxy` in compose and override that one
target via env so it forwards to the host:

```sh
HONO_TARGET=http://host.docker.internal:3001 docker compose up proxy
```

The same env var pattern works for `H3_TARGET`, `ELYSIA_TARGET`,
`ECHO_TARGET`, `GIN_TARGET`, `CHI_TARGET`, `NETHTTP_TARGET`,
`MOJOLICIOUS_TARGET`, `XSLATE_TARGET`, `FLASK_TARGET`, `FASTAPI_TARGET`,
`SINATRA_TARGET`, `RAILS_TARGET`, `AXUM_TARGET`, `PHP_TARGET`,
`DJANGO_TARGET`, `BLADE_TARGET`, `LARAVEL_TARGET`, and `SITE_CORE_TARGET`.

### Why dev images are separate from `Dockerfile`

`Dockerfile` (production) is consumed by `wrangler deploy` for echo /
mojolicious and ships only the runtime + the host-built artifacts.
`Dockerfile.dev` variants add watcher tools (`air`, `morbo`, `bun --watch`,
Werkzeug's reloader) and expect source via bind mount. Keeping them separate
avoids bloating the production image and lets dev tooling evolve
independently.

The TypeScript adapters (`hono`, `h3`, `elysia`) have **no production
`Dockerfile`** — they deploy straight to Cloudflare Workers via
`wrangler deploy` (Elysia uses its official Cloudflare adapter). The Go
adapters (`echo`, `gin`, `chi`, `nethttp`), the Perl adapters
(`mojolicious`, `xslate`), the Python adapters (`flask`, `fastapi`,
`django`), the Ruby examples (`sinatra`, `rails`), the PHP examples
(`php`, `blade`, `laravel`), and the Rust adapter
(`axum`) ship a
production container image (`Dockerfile`) deployed as a Cloudflare
Container. Every adapter still has a `Dockerfile.dev` for the local
compose network.

The two Ruby examples (`sinatra`, `rails`) run the SAME shared JSX through the
SAME `@barefootjs/erb` compiler + Ruby runtime; they differ only in the web
framework glue around it — Sinatra's routing DSL + Rack builder vs. a
hand-trimmed Rails app (routing + controllers, no ActiveRecord / asset
pipeline). This mirrors the two Perl examples (`mojolicious`, `xslate`)
coexisting on one adapter family, and the two Blade examples (`blade`,
`laravel`) on `@barefootjs/blade` — plain PHP's built-in server with a
standalone `illuminate/view` stack vs. a hand-trimmed Laravel app (routing +
controllers, no Eloquent / asset pipeline) whose own view factory the
BarefootJS Blade backend reuses.

Each Go adapter is its own Cloudflare Worker + Container, routed on the
`barefootjs.dev` zone via its `wrangler.toml` (e.g.
`barefootjs.dev/integrations/gin*`), and deployed by the matching
`deploy-integrations-*` job in `.github/workflows/deploy.yml`.
