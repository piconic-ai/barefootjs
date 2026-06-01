# Integrations

Backend integration showcases. Each subdirectory is a small app that runs the
same JSX components on a different stack:

| Adapter | Runtime | Internal port | Where it runs in dev |
|---|---|---|---|
| `hono` | TypeScript / Cloudflare Workers | 3000 (bun default) | container |
| `h3` | TypeScript / UnJS h3 (Node) | 3003 | container |
| `echo` | Go / Labstack Echo | 8080 | container |
| `mojolicious` | Perl / Mojolicious::Lite | 3000 (morbo default) | container |
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
                                         - echo         (golang + air)
                                         - mojolicious  (perl + morbo)
                                         - site-core    (bun + Hono)
```

The proxy routes by path prefix:

```
:4000/integrations/hono/*        → hono service
:4000/integrations/h3/*          → h3 service
:4000/integrations/echo/*        → echo service
:4000/integrations/mojolicious/* → mojolicious service
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

The same env var pattern works for `ECHO_TARGET`, `MOJOLICIOUS_TARGET`, and
`SITE_CORE_TARGET`.

### Why dev images are separate from `Dockerfile`

`Dockerfile` (production) is consumed by `wrangler deploy` for echo /
mojolicious and ships only the runtime + the host-built artifacts.
`Dockerfile.dev` variants add watcher tools (`air`, `morbo`, `bun --watch`)
and expect source via bind mount. Keeping them separate avoids bloating the
production image and lets dev tooling evolve independently.
