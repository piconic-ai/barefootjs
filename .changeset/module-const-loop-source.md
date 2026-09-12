---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/go-template": patch
---

Fixes #2946: a `'use client'` component that declares a static array at MODULE scope and `.map()`s it directly — no `createSignal` wrapper in between — now renders its rows correctly on every adapter. Previously ERB, Jinja, Twig, Blade, Xslate, Rust (minijinja), and Mojolicious silently rendered the loop body empty, and Go template raised an execution-time `can't evaluate field ... in type ...Props` error; only Hono (the reference adapter) rendered correctly.

Root cause: `resolveStaticLoopSource` (`packages/jsx/src/static-literal.ts`) — the one shared resolver every adapter's `renderLoop` consults to inline a `.map()` loop's array source as a native literal — deliberately excluded module-scope consts, on the theory that a separate seeding path (`ssr-defaults.ts` / Go's `convertInitialValue`) already handled them. That path only ever sees a module const through a `createSignal(...)` argument, never a bare `.map()` with no signal in between, so a directly-mapped module array was left completely unresolved.

Fixed at the source: `resolveStaticLoopSource` now resolves a bare identifier bound to a local const's static initializer regardless of whether it's declared at module or function scope — the only remaining exclusions are a name shadowed by the enclosing loop scope, a non-literal (runtime-computed) initializer, and a const flagged `mutatedAfterDeclaration` (#2910 — its initializer would otherwise bake a stale snapshot). Each adapter's own "unresolvable local const" BF101 diagnostic is widened the same way, so a module-scope const computed via a function call (e.g. `const items = buildItems()`) now refuses loudly and uniformly instead of only being caught when declared inside the component.

Adds `module-const-loop-source` (plain-element loop body) and `module-const-loop-source-child-component` (child-component loop body, exercising Go's per-item bake path) as new passing fixtures across all 9 adapters, plus `module-const-loop-source-computed` (BF101-pinned on the 8 non-Hono adapters) with its `/* @client */` escape twin `module-const-loop-source-computed-client`.
