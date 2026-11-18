---
"@barefootjs/go-template": patch
---

Go template: untyped object-literal rows with a non-identifier key or a nested object now render (#3795).

- A signal seeded with rows such as `createSignal([{ 'a.b': 1, '*': 3, meta: { n: 1 } }])`, and an untyped module const array a loop row passes to a child component, used to get no row struct: the rows were not baked and the loop rendered nothing (or was refused with BF101 for the const). The synthesized row struct now gives a non-identifier key a field carrying the key as its JSON tag, which `bf_get` reads (`row['a.b']`, a destructured `{ 'a.b': ab }`), and a nested object a struct of its own (`row.meta.n`).
- Rows stay unbaked when two keys would share one Go field name (`a` and `A`, `'a.b'` and `'a-b'`), or a key cannot be carried as a JSON tag (a quote, a comma, `-`, an empty key, a non-identifier key with a leading capital).
