---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Stop the file-scoped registry key from leaking into CSR `bf-s` scope IDs

Under CSR a non-exported component rendered `bf-s="ToggleItem__be083511_jepihw"`
— a doubled underscore and an 8-hex segment ahead of the usual random suffix —
where the eighteen SSR integrations render the documented `ToggleItem_abc123`.

The hash is deliberate and stays: `nameForRegistryRef` rewrites the registry
key of a **non-exported** component to `Name__<8hex>` so two files each
defining a private component of the same name can't overwrite each other in
the one global registry. That key is an internal disambiguator. `bf-s` is a
documented contract that `integrations/shared/e2e/toggle.spec.ts` asserts, so
CSR was the side in the wrong.

Root cause was one line in `hydrate()`:

```ts
def.name = name   // name is the registry KEY
```

`ComponentDef.name` exists for exactly this — its docstring reads "Used for
scope ID generation" — but `hydrate()` overwrote it with the key. The line
predates file-scoping, when the key and the display name were always the same
string. It is now `def.name ??= name`, keeping the minification fallback while
respecting a compiler-supplied name.

Alongside it: the two runtime sites that built scope IDs straight from the key
(`renderChild`, `createComponent`) now read `def.name`, and the compiler emits
`name: '<plain>'` on the def whenever it file-scopes the key.
