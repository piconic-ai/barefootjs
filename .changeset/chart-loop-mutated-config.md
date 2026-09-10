---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Fixed two silent rendering failures (#2910) that combine in `@barefootjs/chart`'s `LineChart`/`Line` whenever their series/config are built dynamically instead of as static JSX/object literals:

- A `.map()`-produced child component nested two component-levels below a comment-scoped wrapper (e.g. `<ChartContainer><LineChart>{series.map(s => <Line .../>)}</LineChart></ChartContainer>`) never initialised on hydration — its parent's own `__scopeId` resolved against the wrong scope, so every `[bf-h="…"]` child lookup matched nothing. Fixed by a new `ownScopeId` runtime helper that reads the comment-scope registry instead of the proxy element's own `bf-s` attribute.
- A `const` mutated in place after its declaration (`const config = {}; for (const s of series) config[s.key] = {...}`) was re-inlined by its stale pre-mutation initializer text wherever referenced as a component prop, silently dropping the mutation. The analyzer now flags such bindings so every inlining consumer falls back to a live reference instead.
