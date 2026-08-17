---
"@barefootjs/hono": patch
---

Add a runtime backstop, `serializeHydrationProps`, that throws a clear `TypeError` (rather than silently serializing to `{}`/`null` or crashing with an opaque error) when a top-level hydration prop is a `BigInt`, `Symbol`, `Map`, `Set`, `WeakMap`, `WeakSet`, or `Promise` — none of which survive the `bf-p` JSON hydration boundary. This catches cases the compile-time BF049 check can't statically prove (e.g. a loosely-typed prop that happens to hold one of these values at runtime). `RegExp`/`Error`/`URLSearchParams` are deliberately excluded from the throw set — like the others, they generally serialize to `{}` too — to avoid a breaking behavior change in existing code that already tolerates this degradation today (`site/ui`'s InputOTP demo knowingly passes a live `RegExp` prop).
