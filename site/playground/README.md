# BarefootJS Playground (`playground.barefootjs.dev`)

An interactive playground where you **chat with an AI agent** to build a
**Barefoot.js + Hono + UnoCSS** app, and the generated code **runs live** on
[Cloudflare Dynamic Workers](https://developers.cloudflare.com/dynamic-workers/).

Goals:

- **Learning** — see Barefoot + Hono + UnoCSS apps built and running end to end.
- **Showcase** — a real-world example of Cloudflare's AI agents + Dynamic
  Workers (an architecture Cloudflare actively promotes).

This replaces the in-browser-only compile preview at `barefootjs.dev/playground`.

## Architecture

```
Browser (Chat · Code Explorer · Preview iframe)
   │
   ▼
site/playground  (host Worker, this package)
   ├─ Agents SDK (Durable Object) ──► Workers AI (Llama / DeepSeek-Coder …)
   │        generates / edits files under the app's src/
   ├─ build pipeline:  @barefootjs/jsx compile (pure JS) + UnoCSS
   │                   ─► single self-contained Hono ESM module string
   └─ env.LOADER.get(appId, …)  ──► Dynamic Worker (fresh V8 isolate)
            globalOutbound: null            runs the generated Hono app,
            getEntrypoint().fetch(req)      serves SSR HTML + hydration JS + CSS
```

### Why Dynamic Workers

The `worker_loaders` binding (`env.LOADER`) loads and executes Worker code **at
runtime, with no separate deploy**, in a fresh isolated V8 isolate per app.
Millisecond cold start, capability-scoped bindings, and `globalOutbound: null`
to sever network access — ideal for running untrusted AI-generated code.
Sandbox SDK (containers, ~2–3 s cold start) and Workers for Platforms (a deploy
per app) were both considered overkill for ephemeral previews because our build
is **pure JS** (no native toolchain needed).

### Key constraint — no filesystem / no ASSETS binding

A Dynamic Worker is just a module string. The generated Hono app therefore
serves its own static assets (`barefoot.js` runtime, `<Name>.client.js`
hydration, `uno.css`) from **inline string constants via Hono routes**, using a
clean `scriptBasePath` of `/static/components/`.

## Layout

| Path | Purpose |
|------|---------|
| `worker.ts` | Host Worker. Routes `/__host_health` (self), `/__spike` (trivial loader test), everything else → the loaded app. |
| `wrangler.jsonc` | `worker_loaders` binding `LOADER`. |
| `template/` | The fixed app skeleton ("雛形"): `barefoot.config.ts`, `server.tsx`, `renderer.tsx`, and `src/` (the part the AI/user edits). |
| `build/build-counter.ts` | Build pipeline: `bf build` → UnoCSS → inline assets → `Bun.build` → embed as a module string. |
| `generated/counter-bundle.ts` | Generated: `COUNTER_BUNDLE`, the embedded app module string the host loads. |

## Develop

```sh
cd site/playground
bun run build/build-counter.ts      # (re)build the embedded app bundle
bunx wrangler dev --port 8799       # worker_loaders runs locally (miniflare)
# open http://127.0.0.1:8799/
```

## Roadmap

- [x] **Phase 1** — confirm `worker_loaders` loads & dispatches locally.
- [x] **Phase 2** — run a prebuilt Barefoot + Hono + UnoCSS Counter in a Dynamic
      Worker (SSR + hydration verified).
- [x] **Phase 3** — Code Explorer + Preview UI (3 panels).
- [x] **Phase 3b** — Monaco editor with BarefootJS/Hono intellisense (multi-file,
      type-checked editing).
- [x] **Phase 4a** — runtime in-JS compile spike: `compileJSX` + `addScriptCollection`
      + a pre-bundled framework vendor chunk; Worker Loader resolves bare
      specifiers via object-form modules (Path A, no runtime bundler).
- [x] **Phase 4-1** — live recompile loop: edit in Monaco → **Run** → compile in
      the browser (esbuild-wasm + `@barefootjs/jsx`) → POST to host → load a fresh
      Dynamic Worker isolate per session → preview updates and re-hydrates.
- [x] **Phase 4-2** — AI agent (Workers AI `@cf/qwen/qwen2.5-coder-32b-instruct`)
      chats, generates/edits the app's files (same compile→load path as human edits).
- [x] **Phase 4-3** — multi-route apps (AI writes a real Hono `server.tsx` with
      routes + page components) + a mini-browser preview URL bar.
- [x] **Phase 4-4** — shadcn-style registry components (Button/Card/Input/Label/
      Badge/Separator) pre-compiled and importable as `@/components/ui/*`, with the
      semantic UnoCSS theme + tokens.css.
- [ ] **Phase 5** — deploy to `playground.barefootjs.dev` (paid plan + Dynamic
      Workers beta; add to `.github/workflows/deploy.yml`).

## Status

Phases 1–2 complete. The host Worker loads an embedded Counter app bundle into a
Dynamic Worker; SSR markup, the three inline asset routes, and client hydration
(clicking **+1** increments the signal) are all verified locally.
