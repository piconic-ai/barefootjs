---
"@barefootjs/jsx": patch
---

Widen BF044 (signal/memo getter passed without calling it) to descend into
rendered positions instead of testing only an expression's top-level node.

`checkBareSignalOrMemoIdentifier` opened with `if (!ts.isIdentifier(expr)) return`,
so it caught `className={count}` but nothing nested: `className={count ? 'a' : 'b'}`,
`className={Boolean(count)}`, `` className={`x-${count}`} ``, `className={[count].join('')}`
and `style={{ color: count }}` all compiled silently. The bare accessor then reached
every downstream emitter, each mishandling it differently — a controlled input's live
`.value` became the source text of the client runtime's internal `read()` (#2755), and
the module-scope CSR template thunk referenced an init-scope binding and threw
`ReferenceError` (#2751). Both were downstream symptoms of this one gate, not three
separate lowering bugs.

The check now walks the whole expression, but only where the value is RENDERED — a DOM
element's attribute value, or a JSX text child. It deliberately does NOT descend inside a
component's prop: passing a live accessor to a child is this codebase's Context idiom
(`<SelectContext.Provider value={{ open, value: () => … }}>` hands descendants the
accessor so each consumer subscribes at its own read site), and calling those eagerly at
the provider would freeze the value and break reactivity for every consumer. A blast-radius
scan over `ui/components/**`, `site/**` and the fixture corpus found 66 instances of that
idiom and zero genuine forgotten-`()` bugs, so nothing that compiled before this change
stops compiling. Top-level behaviour is unchanged, so `<Foo x={count} />` keeps its
existing refusal; the resulting asymmetry with `<Foo value={{ x: count }} />` predates this
change and is tracked separately in #2760.

Two supporting fixes the walk needed: it stops at `JsxElement`/`JsxSelfClosingElement`/
`JsxFragment` boundaries, since descending into JSX embedded in the checked expression
(a `.map()` callback returning JSX) misread a nested element's own attribute NAME as a bare
reference; and it consults the existing `BindingScope` (`ctx.scope.isBound()`) so a name
shadowed OUTSIDE the checked expression — a loop-row or callback parameter — is not flagged,
mirroring how `csrSubstituteOnce` takes an `enclosingScope`.

Also fixes three latent bugs this newly catches in the adapter authoring docs, where
`items.map(...)` was written for a signal `items` (correct: `items().map(...)`) — silently
mislowered through a static-array codegen path, so anyone copying those examples got
working-looking but non-reactive output.
