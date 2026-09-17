<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="images/logo/logo-for-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="images/logo/logo-for-light.svg">
    <img alt="BarefootJS" src="images/logo/logo-for-light.svg" width="400">
  </picture>
</p>

<p align="center">
  <strong>TSX in. Your stack out.</strong><br>
  Barefoot compiles signal-based TSX into Hono, Echo, or whatever stack you ship on.<br>
  No virtual DOM. No SPA required.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-barefootjs"><img alt="npm" src="https://img.shields.io/npm/v/create-barefootjs" /></a>
  <a href="https://jsr.io/@barefootjs/client"><img alt="JSR" src="https://jsr.io/badges/@barefootjs/client" /></a>
  <a href="https://github.com/piconic-ai/barefootjs/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/piconic-ai/barefootjs/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://bundlephobia.com/package/@barefootjs/client"><img alt="npm bundle size" src="https://img.shields.io/bundlephobia/minzip/@barefootjs/client" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/piconic-ai/barefootjs" /></a>
  <a href="https://x.com/barefootjs_dev"><img alt="Follow on X" src="https://img.shields.io/badge/follow-%40barefootjs__dev-black?logo=x" /></a>
</p>

> [!NOTE]
> **Stability.** Pre-1.0, so a minor release is still the breaking-change slot. On a **beta**
> surface a breaking change ships with a migration note in the changelog; an **alpha** surface
> may change without notice, so pin exact versions if you depend on it. Each row below links to
> that surface's section of the [API Reference](./docs/core/advanced/api-reference.md), which lists every API with the release it
> first shipped in, its tier and an example — generated from the JSDoc on the exports.
>
> | Surface | Status | Covers |
> |---|---|---|
> | [Runtime](./docs/core/advanced/api-reference.md#runtime) | **Beta** | The `@barefootjs/client` APIs a component author writes: `createSignal`, `createEffect`, `createMemo`, `onMount`, `onCleanup`, `untrack`, `batch`, context, portals, `<Async>` / `<Region>`, `queryHref`, `formatDate`. The rest of the package is alpha or compiler-internal |
> | [Directives](./docs/core/advanced/api-reference.md#directives) | **Beta** | `"use client"` and `/* @client */` |
> | [Browser mount](./docs/core/advanced/api-reference.md#browser-mount) | **Beta** | The two APIs an app calls itself on the browser-only `@barefootjs/client/runtime` entry: `render()` for CSR and `setupStreaming()` for a streaming page or the client router |
> | [Vite plugin](./docs/core/advanced/api-reference.md#vite-plugin) | **Beta** | What configuring a build takes: `@barefootjs/vite`'s `barefoot()`, its four options, the `afterEmit` context, and the files it writes |
> | [Adapter builders](./docs/core/advanced/api-reference.md#adapter-builders) | Alpha | Each adapter's `/vite` subpath and the helpers re-exported for them |
> | [Adapters](./docs/core/advanced/api-reference.md#adapters) | Alpha | The adapter classes, everything `@barefootjs/jsx` exports, and the language-side runtimes |

---

## Quick Start

Requires Node 22+.

```sh
npm create barefootjs@latest
```

You'll be prompted for a target directory (defaults to `my-app`). After scaffolding:

```sh
cd my-app   # or whatever name you entered at the prompt
npm install
npm run dev
```

Then open the URL the dev server prints (defaults to `http://localhost:8787`). The starter app ships a Counter component you can edit at `components/Counter.tsx`.

The full walkthrough — adapter / CSS choices, generated layout, and editing the Counter — lives in [`docs/core/quick-start.mdx`](./docs/core/quick-start.mdx).

---

## AI-Assisted Development

BarefootJS ships an agent skill that gives AI deep knowledge of the compiler, IR, CLI, and component system — so it can build, test, and debug BarefootJS components autonomously. Works with both **Claude Code** and **Codex**.

**Claude Code:**

```sh
/plugin marketplace add piconic-ai/barefootjs
/plugin install barefootjs@barefootjs
```

**Codex:**

```
install the barefootjs skill from piconic-ai/barefootjs
```

Once installed, the agent can use the `bf` CLI, write IR tests, trace signal graphs, and scaffold components — all without reading source files. See [AI-native Development](./docs/core/core-concepts/ai-native.md) for the full workflow.

---

## Design Principles

- **Backend Freedom** — Same JSX works with Hono, Go, Mojolicious, etc. No Node.js lock-in.
- **MPA-style development** — Add interactivity to existing server apps without an SPA framework.
- **Fine-grained reactivity** — Signal-based, only affected DOM nodes update. SolidJS-equivalent performance.
- **AI-native development** — IR enables browser-free testing. CLI for component discovery. AI agents can develop autonomously.

---

## Adapters

BarefootJS compiles JSX into your backend's native template format — no Node.js required at serving time for non-TypeScript backends. The compiler produces a backend-agnostic IR; an adapter converts it into the target language's templates plus a small runtime.

<!-- ADAPTER-TABLE:START (auto-generated by scripts/generate-adapter-docs.ts — do not edit by hand) -->
| Language | Backend | Package |
|----------|---------|---------|
| TypeScript | [Hono](docs/core/adapters/hono-adapter.md) | `@barefootjs/hono` |
| Go | [html/template](docs/core/adapters/go-template-adapter.md) | `@barefootjs/go-template` |
| Perl | [Mojolicious](docs/core/adapters/perl-adapter.md) | `@barefootjs/mojolicious` |
| Perl | [Text::Xslate](docs/core/adapters/perl-adapter.md) | `@barefootjs/xslate` |
| Ruby | [ERB](docs/core/adapters/ruby-adapter.md) | `@barefootjs/erb` |
| Python | [Jinja2](docs/core/adapters/python-adapter.md) | `@barefootjs/jinja` |
| PHP | [Twig](docs/core/adapters/php-adapter.md) | `@barefootjs/twig` |
| PHP | [Laravel Blade](docs/core/adapters/php-adapter.md) | `@barefootjs/blade` |
| Rust | [minijinja](docs/core/adapters/rust-adapter.md) | `@barefootjs/rust` |
| Java | [Pebble](docs/core/adapters/java-adapter.md) | `@barefootjs/pebble` |
| — | [CSR (browser only)](docs/core/adapters/csr.md) | `@barefootjs/client` |
<!-- ADAPTER-TABLE:END -->

The IR contract is stable — see [Backend Freedom](./docs/core/core-concepts/backend-freedom.md) and [write a custom adapter](./docs/core/adapters/custom-adapter.md) for any backend not listed here.

---

## Documentation

- [barefootjs.dev](https://barefootjs.dev/) - Core documentation
- [ui.barefootjs.dev](https://ui.barefootjs.dev/) - UI components built with BarefootJS

---

## Known limitations

Tracked patterns the compiler / adapters / runtime don't yet handle live in the known-limitation registry, one file per entry under [`packages/adapter-tests/limitations/`](packages/adapter-tests/limitations/). Each entry states the input shape (`given`), what the Hono reference renders for it (`expected`), what the affected adapters do instead (`actual`), and the minimal conformance fixtures that reproduce it; which adapters are affected is derived from the pins that cite the entry. `kind` classifies the behaviour: `silent` is a divergence to fix, `refusal` is a capability gap behind a loud, escapable compile-time refusal, and `by-design` is an accepted permanent position with its reason stated. The registry is rendered on the docs [compatibility matrix](https://barefootjs.dev/docs/advanced/compatibility-matrix#known-limitations) page.

Run `bun run compat` for a live component × adapter compile-compatibility matrix, generated by compiling every `ui/` component against every workspace adapter in-process. The committed snapshot lives at `ui/compat.lock.json` (regenerated with `bun run compat:lock`; CI fails on drift). The matrix measures **compile** compatibility only, not render identity — rendered-output parity is verified separately by the adapter conformance suite. This tooling is repo-internal (`packages/compat`, never published) — the published CLI does not ship it.

---

## Acknowledgements

This project is inspired by and built with:

- [SolidJS](https://www.solidjs.com/) - Fine-grained reactivity model and Signal API design
- [shadcn/ui](https://ui.shadcn.com/) - UI component design system (docs/ui)
- [Hono](https://hono.dev/) - JSX runtime for server-side rendering

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
