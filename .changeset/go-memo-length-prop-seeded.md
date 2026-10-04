---
"@barefootjs/go-template": patch
---

A memo that reads the length of a signal seeded from an array prop (`const [items] = createSignal(props.items)`, `createMemo(() => items().length)`) now renders the array's length at SSR on Go instead of `0`. This includes a `createQuery` value (`posts()?.length ?? 0`, seeded from `initial`). The constructor bakes the memo as `bf.Length(<seeded value>)`, the runtime helper the template-position `.length` already uses, so an absent prop yields `0` without a panic. A length read also composes with a literal (`items().length * 2`, `+`, `-`) and with another number-typed memo (`items().length + count()`). A prop receiver (`props.items.length`, or a destructured `items.length`) is handled the same way.
