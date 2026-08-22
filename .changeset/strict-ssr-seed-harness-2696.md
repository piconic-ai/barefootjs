---
"@barefootjs/jsx": patch
"@barefootjs/jinja": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/rust": patch
---

The 7 template-stash adapters' conformance test harnesses (`test-render.ts`) now seed a root component's signal/memo template vars EXCLUSIVELY from `deriveStashFromDefaults(extractSsrDefaults(...), props)` — the same manifest-driven value a real before_render-equivalent plugin/integration consumes at runtime. Removes the harness's own `evaluateSignalInit` re-evaluation of a signal's initializer against raw props, and the `?? 0` fallback a memo used to get when the manifest had no entry for it; the #2669 self-derivation propName-skip these loops carried is gone too, since `deriveStashFromDefaults` already resolves a propName-carrying entry correctly on its own. Root-path seeding is now the same semantics the child-component-renderer path already had.

`@barefootjs/jsx` removes `evaluateSignalInit`/`tryEvaluateSignalInit`/`SignalInitEvalResult` (`signal-init-eval.ts`, added for #2209): a test-harness-only sandboxed real-JS evaluator (`new Function`) strictly more powerful than production's own static `extractSsrDefaults`/`tryStaticEval`, which has no support for `.map()` on any receiver shape. That extra power was silently masking a real production gap — a signal/memo initialized via a `.map()` chain never gets a working SSR seed in production either, on any of the 7 backends. The 7 harnesses were its only remaining callers.

Surfaced (and pinned via `renderDivergences`, `#2696`) on all 7 adapters:

- `todo-app` / `todo-app-ssr`: the `todos` signal (`(props.initialTodos ?? []).map(t => ({ ...t, editing: false }))`) seeds `null`/`nil`/`undef`/`None` — `extractSsrDefaults` can't statically resolve the `.map()` over a differently-named prop, and `computeSsrSeedPlan` classifies it opaque (no in-template recompute). `todo-app-ssr`'s unmarked todo-list loop throws on Python/Ruby/Perl (jinja, erb, mojolicious) and silently renders empty on Kolon/PHP/minijinja (xslate, blade, twig, rust); `todo-app`'s unmarked toggle-all conditional silently renders as if there are zero todos on every backend.
- `callback-param-shadows-prop`: the `first` signal (`[{ a: 'p' }].map((title) => title.a).join(',')`) is a constant expression that's still unresolvable the same way, and — unlike the fixture's sibling `joined` memo, whose structurally similar `.map().join()` chain over a signal getter DOES get an in-template recompute — also classifies opaque, so `<span>{first()}</span>` SSRs empty instead of `p`.

`@barefootjs/mojolicious`'s child-renderer path (`buildChildDefaultsPerl`) had one further leftover `evaluateSignalInit(..., undefined)` call for an ordinary (non-propName) child signal default, inconsistent with the memo loop right beside it (which already used the static `ssrDefaults` value verbatim) — fixed to match; no currently-covered fixture exercises a child component with a non-statically-resolvable signal, so this is not a new pinned divergence.

Graduation path per entry: fix `extractSsrDefaults`'s static evaluator (or add an in-template recompute for the affected signal shapes) so the manifest's own seed is correct, regenerate `expectedHtml` from the fixed reference, delete the `renderDivergences` entries.
