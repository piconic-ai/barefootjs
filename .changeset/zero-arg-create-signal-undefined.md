---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

`createSignal()` with no argument now type-checks and compiles on every path. A new overload, `createSignal<T>(): Signal<T | undefined>`, makes the zero-argument call legal: the signal starts as `undefined`, and its type is widened to include it. Before, `createSignal<string | undefined>()` failed with TS2554. The compiler now records a missing initial value as `undefined` and widens the signal's type to `T | undefined`, so a zero-argument call compiles exactly like `createSignal<T | undefined>(undefined)`. Before, the Hono SSR module emitted `const v = () =>  as string | undefined`, which does not parse.

The Go adapter now seeds a nullable signal whose initial value is `undefined` or `null` as `nil`. Before, it seeded the zero value of the non-nullish type (`""`, `0`), so a child's rest bag received `tag=""` where Hono omits the attribute.
