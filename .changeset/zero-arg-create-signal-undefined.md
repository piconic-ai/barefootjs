---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

`createSignal()` with no argument now type-checks and compiles on every path. A new overload, `createSignal<T>(): Signal<T | undefined>`, makes the zero-argument call legal: the signal starts as `undefined`, and its type is widened to include it. Before, `createSignal<string | undefined>()` failed with TS2554. The compiler now records a missing initial value as `undefined`, so a zero-argument call compiles exactly like `createSignal(undefined)`. Before, the Hono SSR module emitted `const v = () =>  as string | undefined`, which does not parse.
