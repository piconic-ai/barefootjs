---
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

Stop treating a class field name as a value reference

`isValueReferenceIdentifier` excluded object-literal keys, method names and
accessor names, but not `ts.PropertyDeclaration` — a class field. So in

```js
class Widget { helper = 1 }
```

the field name `helper` was classified as a read of a binding called `helper`.
It isn't; it's a member key, exactly like the `{ helper: 1 }` case one branch
above it.

The two callers of this classifier are hurt very differently by an over-report,
which is what makes this worth a patch rather than a tidy-up:

- **`detectStrippedReferences` (cli) — a false build error.** BF053 fires when a
  relative import was stripped from a client bundle but its binding is still
  referenced. With the gap, a stripped binding whose name merely *coincided*
  with a class field name anywhere in the assembled bundle failed the build,
  pointing the developer at a reference that does not exist. Legal code, red
  build. Inlined `.ts` helper modules are arbitrary user code, so a class with a
  field named after some unrelated stripped import is not a contrived shape.
- **`makeValueUsageTest` (jsx) — a redundant import.** The client bundle kept an
  import it didn't need. Harmless, since the binding does exist, but it defeats
  the point of the reference-based check that replaced the old text scan.

A **computed** field name stays a reference: in `class C { [helper] = 1 }` the
brackets make `helper` a genuine read, and the exclusion is guarded on
`parent.name === id`, which the computed form doesn't satisfy (its `name` is a
`ComputedPropertyName` node, not the identifier). Both directions are pinned by
tests. `new.target` is excluded for the same reason as the field name — `target`
sits in keyword position and is not a binding either.

The classifier also now states its contract, since #2432 exported it as public
API: it classifies positions in **JavaScript** source, which is what both
callers parse (`ts.ScriptKind.JS`). Identifiers in TypeScript type positions —
`const x: Foo`, `interface` / `type` / `enum` declaration names — are still
reported as value references, so it must not be pointed at TypeScript source.
Every exclusion branch is really a BF053 misfire that can't happen anymore,
which is the lens to read that list through.
