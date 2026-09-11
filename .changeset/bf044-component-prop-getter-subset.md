---
"@barefootjs/jsx": patch
---

BF044 (signal/memo getter passed without calling it) no longer refuses a bare getter passed directly to a component prop (`<Foo x={val} />`) — it now compiles, matching the already-legal object-literal-wrapped form (`<Foo x={{ val }} />`). Both forms are this codebase's deliberate Context-Provider idiom: the child owns *when* to call the accessor, so it can subscribe reactively at its own read site instead of the value being frozen at the parent's render time (measured: 66 real-world uses of this idiom, none a forgotten `()`). The diagnostic's entire check — top-level included, not just its nested-descent walk — is now gated on whether the position is genuinely RENDERED (a DOM attribute, a JSX text child), which a component prop never is (#2760).
