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

# Default: MOCK AI, no Cloudflare login required.
bun run dev                          # build + wrangler dev --local
# open http://127.0.0.1:8787/

# Real Workers AI (requires `wrangler login` once, and a Workers AI-enabled
# account — calls proxy to the real account and may incur usage charges).
bun run dev:ai                       # build + wrangler dev (remote AI binding)
```

`bun run dev` runs `build/build-counter.ts` (writes `generated/`) and then
starts `wrangler dev --local`. `--local` keeps the Workers AI binding offline,
so `/_pg/chat` falls back to MOCK mode — no `wrangler login` / account ID
needed just to boot the playground UI.

`bun run dev:ai` drops `--local`: wrangler establishes a remote proxy for
`env.AI` and `/_pg/chat` calls the real model. Run `wrangler login` first.

The lower-level recipe still works if you want explicit control:

```sh
bun run build/build-counter.ts      # (re)build the embedded artifacts
bunx wrangler dev --local           # boot the host worker (mock AI)
# …or, with `wrangler login` first, for real AI:
bunx wrangler dev
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
      semantic UnoCSS theme + tokens.css. Sources fetched from the live
      `https://ui.barefootjs.dev/r/<name>.json` registry at build time.
- [x] **Phase 4-5 / 4-6** — tool-calling agent (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
      with build-time-extracted bf/Hono CLI knowledge as in-Worker tools
      (`search_components` / `get_component_docs` / `barefoot_guide` / `hono_docs`),
      a validate→self-repair loop, and a deterministic wiring check.
- [x] **Session persistence** — per-session Durable Object (`PlaygroundSession`)
      stores the compiled modules; survives `wrangler dev` restarts. The fixed
      `barefoot.js` runtime is served from an embedded constant to stay under the
      DO 128 KiB value limit.
- [ ] **Phase 5** — public deploy to `playground.barefootjs.dev`. **Deferred —
      see "Public release / cost" below.**

## Status

**Feature-complete and fully working locally; not publicly deployed.**

The end-to-end loop works under `wrangler dev`: chat with the AI agent (or edit
in Monaco) → compile in the browser → load a fresh Dynamic Worker isolate per
session → SSR + client hydration in the preview iframe, across multi-route apps,
the shadcn registry components, and DO-backed persistence. Verified locally with
real Workers AI (counter, todo, and a shadcn contact form).

### Public release / cost

After observing real Workers AI usage, **opening this as a public instance is
not cost-viable today, so Phase 5 (public deploy) is deferred.** Every chat turn
runs *multiple* 70B inferences — the tool-calling round(s), the validate→repair
round(s, cap 2), and the wiring fix — so a single "build me a todo app" request
fans out into a handful of large-model calls. An unauthenticated public endpoint
would incur unbounded Workers AI neuron cost and is an obvious abuse target.

Making it public would first require cost controls that are out of scope here:
authentication, per-user quotas / rate limiting, and/or a cheaper model (the
8B model is unreliable even with the guardrails — it detects issues but cannot
fix them; the cheap models we tried were not viable). The branch is kept so the
playground can be revived once those controls — or a more cost-effective model —
are in place.
