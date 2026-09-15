# BarefootJS + Spring Boot Example

This example runs the shared BarefootJS components on Java's [Spring Boot](https://spring.io/projects/spring-boot)
(Spring MVC + embedded Tomcat), demonstrating server-side rendering + client-side hydration with the
`@barefootjs/pebble` adapter — [Pebble](https://pebbletemplates.io/) templates rendered by the Pebble
Java runtime (`packages/adapter-pebble/java`).

It is a peer of `integrations/axum` — same JSX components (`integrations/shared/components`), same
shared styles, same routes, same rendering architecture (manifest-driven child registration instead
of Flask-style manual `children={...}` wiring per route) — wired to a Spring Boot server instead of
Rust/axum.

## Quick start

```bash
bun install                              # from the repo root (workspace deps)
bun run --filter '@barefootjs/pebble' build   # @barefootjs/pebble ships from dist/ (see below) — build it once before anything imports it
cd integrations/spring

bun run build          # JSX → .peb templates + hashed client assets (Vite), copy shared styles
bun run dev            # BASE_PATH=/integrations/spring APP_ENV=development PORT=3017 gradle bootRun
# → http://localhost:3017/integrations/spring
```

`vite.config.ts` imports `@barefootjs/pebble/vite`, and that subpath's `exports` entry resolves to
`packages/adapter-pebble/dist/vite.js` — a built artifact, not the TypeScript source — so
`@barefootjs/pebble` must be built at least once after `bun install` before this app's own
`bun run build`/`build:watch` can resolve it (`Error [ERR_MODULE_NOT_FOUND]: Cannot find package
'@barefootjs/pebble'` otherwise). The repo-root `bun run build` already does this for you, in the
same order as `ci-compat.yml`; the explicit `--filter` above is the one-off equivalent when you
only want this example's own dependency built.

No Gradle wrapper is committed, matching `packages/adapter-pebble/java`'s own documented
convention — `gradle` is expected directly on `PATH`.

In development (`APP_ENV=development`) the server re-parses templates on every request (a fresh
`PebbleEngine` built per request, reading straight off disk), so edits picked up by
`bun run build:watch` are visible on the next request with no server restart. In production
(`APP_ENV=production`, the default) templates are parsed once at startup.

## How it works

| Concern | Where |
|---|---|
| Routes | `src/main/java/dev/barefootjs/integrations/spring/controller/*.java` |
| App-wide startup state (manifest, engine, blog data, session store) | `BfContext.java` |
| Rendering helpers on top of the Pebble Java runtime | `Render.java` |
| Page layout (HTML shell) + response helpers | `Layout.java` |
| Per-visitor todo session store | `SessionStore.java` |
| Static asset serving + trailing-slash normalization | `WebConfig.java` |
| Compiled templates (`.peb`) + manifest | `src/main/resources/templates/` (git-ignored, written by Vite) |
| Compiled client JS / styles | `dist/` (git-ignored, written by Vite — see `vite.config.ts`) |

Route handlers build props/stash maps with `Render.obj(...)`/`Render.arr(...)` and call
`Render.renderComponent(...)`, which resolves the component's `ssrDefaults` (from the build
manifest) against the supplied props, layers any route-specific stash on top, and evaluates the
compiled `.peb` template through the Pebble Java runtime's `Bf` helper object — the same
architecture `integrations/axum`'s `render.rs` documents in full.

### The Pebble runtime dependency (composite build, not Maven Central)

`packages/adapter-pebble/java` is not published anywhere — `settings.gradle.kts` pulls it in as a
Gradle **composite build** (`includeBuild` + dependency substitution), the Gradle equivalent of
`integrations/axum`'s Cargo.toml path dependency. A change to the shared Java runtime is picked up
automatically on the next build; nothing here is vendored.

### `bf.render_child` and the snake_case template alias

The Pebble adapter's compiled templates call child components as
`bf.render_child('snake_case_name', {...})`, but `@barefootjs/vite`'s core plugin writes each
component's `.peb` file named after the component **verbatim** (`ToggleItem.peb`, not
`toggle_item.peb`). `scripts/snake-case-templates.ts` (run as part of `bun run build`) copies every
`<Name>.peb` to its snake_case name so `render_child` resolves — see that script's docstring for
the full story; it's filed as a `known-limitation` follow-up for `@barefootjs/pebble` itself.
Root-level page renders are unaffected (they look up the real, PascalCase filename directly).

## URL layout

- `/integrations/spring/` — index with links to every demo
- `/integrations/spring/counter`, `/toggle`, `/form`, `/portal`, `/reactive-props`,
  `/conditional-return[-link]` — component demos
- `/integrations/spring/todos` / `/todos-ssr` — interactive todo list backed by an in-memory,
  per-session (`bf_session` cookie) store, plus the REST API under `/api/todos/*`
- `/integrations/spring/ai-chat` + `/api/ai-chat` — token-by-token SSE streaming demo. The SSE
  endpoint returns an `SseEmitter` immediately and streams from a **virtual-thread executor**, never
  blocking a servlet (Tomcat) worker thread for the stream's duration (see `AiChatController`'s
  docstring — the same non-blocking-SSE lesson `integrations/fastapi`'s asyncio handler documents).
- `/integrations/spring/blog` + `/blog/posts/{slug}` — the `@barefootjs/router` showcase: a
  region-shell layout whose islands persist across client-side navigations
- `/integrations/spring/client/*` — compiled, content-hashed client JS (Vite `build.outDir`)
- `/integrations/spring/styles/*` — shared CSS (copied into `dist/styles` by `scripts/copy-shared.ts`)

## Tests

```bash
bun run test:e2e       # Playwright; boots the Spring Boot server automatically
```

The specs in `e2e/` re-use the shared suites in `integrations/shared/e2e` (plus an adapter-local
`blog.spec.ts` for region/island navigation, ported from `integrations/axum`'s), so the same
user-facing behaviour is verified across every adapter.

For the Java side:

```bash
cd ../../packages/adapter-pebble/java && gradle test   # Pebble runtime unit + golden-vector tests
```

## Container / deploy

The container listens on **port 8080** (Spring Boot's own default — only local dev overrides it to
3017 via `PORT`), matching every other integration's `container.ts`/`wrangler.toml` convention.
`Dockerfile` is a multi-stage build: Bun installs + Vite build in one stage, `gradle bootJar` in a
second (both need the repo root as build context so the composite-build path to
`packages/adapter-pebble/java` resolves), then a slim `eclipse-temurin:21-jre` runtime image running
the fat jar. `container.ts` + `wrangler.toml` wrap it as a Cloudflare Container, same shape as every
other integration.
