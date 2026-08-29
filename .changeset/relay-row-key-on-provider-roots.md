---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
---

Restore the caller-key relay (`IRElement.keyAttr`, #2753's "mechanism 2") on components whose root is a `<Ctx.Provider>`.

`resolveRootKeyAttr` looked for the component's render root by walking down from the IR root through `element` / `if-statement` / `fragment` and stopping at anything else. A provider is none of those, but `transformProviderElement` passes `ctx.isRoot` through to its children — so the element under the provider IS a render root, carries `needsScope`/`bf-s`, and the walk never reached it. Every adapter then emitted that root without the relay, and a caller rendering such a component as a keyed loop row got a row with no key attribute for `mapArray` to reconcile against.

The relay is now resolved by testing `needsScope` throughout the tree rather than by an enumeration of the constructs `ctx.isRoot` passes through, which is the same predicate the reference adapter applied at emit time before the decision moved into the IR, and matches the client runtime's own CSR half (`renderChild` / `materializeComponent` splice `data-key` onto the rendered markup's first element whatever wrapper nodes sit above it).

Affects every provider-rooted component, including `select`, `popover`, `accordion`, `carousel`, `combobox`, `command`, `dropdown-menu` and `radio-group`. The DSL adapters had never emitted the relay for this shape; Hono had, and regressed when the decision was centralized.
