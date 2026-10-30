---
"@barefootjs/go-template": patch
---

Go templates render the rows of array signals whose seed used to stay `nil`, and build identity memos over array signals.

- `createSignal<{ id: string }[]>([...])` (an inline element type), `createSignal(SEED)` with an untyped module-const array, and untyped rows holding a scalar array (`tags: ['a']`) now seed a row struct slice. Loops over them rendered no rows.
- `createSignal(props.items ?? [...])` (or `||`) holds the fallback rows when the prop is omitted or `null`. It held the bare prop field.
- `createMemo(() => rows())`, and a memo of that memo, takes the signal's slice type and rows. It seeded `0` into a slice field and failed the Go build.
