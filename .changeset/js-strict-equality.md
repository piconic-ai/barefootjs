---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
"@barefootjs/erb": patch
---

`===` and `!==` now give the JS answer on every template adapter, decided once by the shared primitive plan (#3824 step 8, #3769).

- A comparison is native only when Phase 1 proves both operands are non-nil and of the same primitive type, and the adapter's own operator is pinned for that type: Ruby, Python and MiniJinja `==`, Perl `==` for numbers and booleans and `eq` for strings, Kolon `==` for strings only. Go, Twig, Blade and Pebble keep calling `eq` / `bf_eq`. Native-safe rests on the declared types: the host must pass JSON-typed values (a `number` prop receives a number, not `'1'`).
- Operands proven of different types fold to a constant: a `digits: string` prop compared with the literal `1` is `false`.
- Any other comparison calls the runtime's `strict_eq`: Mojolicious no longer compares an untyped operand with numeric `==` (`'abc' === 0` was true), and ERB, Jinja, MiniJinja and Xslate no longer compare a nil or mixed-type pair with the host's `==` (`True == 1` in Python).
- **Breaking for templates that compared objects or arrays:** `===` / `!==` with an operand that may be an object or array (an object, array or interface-typed value, an object or array literal, or an element of an array seeded with objects) is refused with BF101 on every template adapter (#3774). JS compares objects by reference, which no template runtime can tell from equal contents. Compare a primitive field (`a.id === b.id`) or defer the comparison with `/* @client */`. `x === null` and `x === undefined` are unaffected.
- Go: an optional prop compared with `===` gets a nillable `interface{}` field in its component's `Input` and `Props` structs, so an omitted prop is not equal to `0` / `''` / `false`. Host code that reads such a field as a concrete type must type-assert.
- ERB: the `strict_eq` helper compares an object or array that still reaches it by reference instead of raising.
