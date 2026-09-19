# Specifications

Design and conformance specifications for the compiler, adapters, and runtime. These are
normative documents for contributors and adapter authors; user-facing docs live under
`docs/core/`.

- [`compiler.md`](./compiler.md) — the full pipeline architecture, IR schema, transformation
  rules, adapter interface, and error codes.
- [`router.md`](./router.md) — the router and `<Region>` page-lifecycle boundary design.
- [`async.md`](./async.md) — the async value model (`AsyncState`, `createQuery`,
  `createAction`); design draft, not yet implemented.
- [`subset-conformance.md`](./subset-conformance.md) — the JSX/expression subset the compiler
  accepts, and the oracle-conformance policy that keeps adapters faithful to it.
- [`testing.md`](./testing.md) — the testing specification: layers, APIs, and patterns.
- [`adapter-architecture.md`](./adapter-architecture.md) — the target architecture for SSR
  adapters, and the reference shape every adapter implements.
- [`callback-fidelity.md`](./callback-fidelity.md) — callback-body fidelity across backends.
- [`template-helpers.md`](./template-helpers.md) — the language-independent, JS-normative
  spec for the pure template helpers every adapter ships.
- [`slot-unification.md`](./slot-unification.md) — the hydration slot/claim design
  (`bf-s` scopes, claim infrastructure). [`slot-unification.ja.md`](./slot-unification.ja.md)
  is a Japanese overview of the same design.
