---
"@barefootjs/jsx": patch
---

Give `.forEach()` a dedicated unsupported-method diagnostic (#1448 Tier C).

`.forEach()` returns `undefined`, so it is never a template-position lowering target — its only meaningful use is side effects inside event handlers / `createEffect` callbacks (client JS, which never reaches the adapter). The template-language adapters already refuse it in template position via the parser's `UNSUPPORTED_METHODS` gate (surfaced as BF101); this swaps the generic "wrap in `/* @client */` to defer to hydration" hint for a `forEach`-specific reason that explains the `undefined` return and points to `.map(...)` / `createEffect` instead — deferring an `undefined`-valued expression to hydration still renders nothing, so the generic hint was misleading.

No behaviour change for the client-callback path: `.forEach()` inside event handlers / `createEffect` continues to pass straight through to the emitted runtime. A regression test pins both halves of the contract.
