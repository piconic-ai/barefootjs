# JS Primitive Semantics: One Decision, Shared Helpers

Design note for #3824. It answers one question: how do the template adapters
lower the JS primitive operations (ToBoolean, ToNumber, ToString, property
keys, `===`, relational operators, `+`, unary `-`, nullish checks,
`JSON.stringify` numbers) so that every output position on every runtime
gives the JS answer, without each emitter deciding again per position?

> Status: **design, not implemented.** Every claim about current behaviour
> cites the code it was read from, a rendered issue, or a probe run while
> writing this note (one-liners under "Native operators, measured"). The
> rollout at the end is the work.

Terms used throughout:

- **Target**: one of the nine template adapters. They run on seven
  **runtimes**: Go (go-template), Perl (Mojolicious, Xslate), Python (Jinja),
  Rust (MiniJinja), PHP (Twig, Blade), Ruby (ERB), Java (Pebble). Hono and
  CSR run JS and are the reference; they are out of scope.
- **Native**: the emitter spells the target language's own operator
  (`<`, `==`, `if x`, `a[i]`).
- **Helper**: the emitter calls a runtime helper (`bf.truthy(x)`,
  `$bf->get(a, i)`, `bf_lt a b`).
- **Proof**: what Phase-1 type information establishes about an operand
  (it is a `number`, a `string`, a `boolean`, never nil, …).
- **Native-safe**: a (operation, proof) pair for which a target's native
  operator is known to agree with JS. Known means pinned by vectors (see
  "Conformance"), not assumed.
- **Nil reading**: which JS value a host nil stands for at a read: `null`,
  `undefined`, or `either` (the type admits both). Every runtime holds both
  as one nil (`spec/compiler.md`, "ParsedExpr Evaluator Semantics": "There
  is no `undefined`").

## Problem

### The pattern

Each `ParsedExprEmitter` method (`packages/jsx/src/adapters/parsed-expr-emitter.ts`)
receives a node and picks a native operator or a helper on its own. The
choice is made again in every method, in every emitter class, in every
adapter:

- Each DSL adapter has **two** emitter classes, a filter-predicate emitter and
  a top-level emitter (`JinjaFilterEmitter` / `JinjaTopLevelEmitter` in
  `packages/adapter-jinja/src/adapter/expr/emitters.ts`, the same split in the
  other seven `expr/emitters.ts`). Each class has its own `binary`, `unary`,
  `logical` and `indexAccess`. Their `binary` methods carry the same inline
  `opMap` (`'===': '=='`, `'<': '<'`, …) and differ in which shared
  decisions they apply: the top-level `binary` calls `coerceNullishOperand`,
  the filter one does not (#3750, item 2).
- Go has three `+` sites (value, filter predicate, condition) that share only
  `_emitPlus` (`packages/adapter-go-template/src/adapter/go-template-adapter.ts`),
  and `condition-expr.ts` walks `binary` nodes itself (`case 'binary'`)
  instead of going through the emitter, which is why Go `{{if}}` conditions
  miss the arithmetic coercion (#3750, item 3).
- The truthiness proof exists five times as `truthyTest` (Blade, Jinja,
  Pebble, MiniJinja, Twig `expr/emitters.ts`, each
  `isBooleanResultParsed(node) ? rendered : bf.truthy(rendered)`) and once
  more, narrower, as Go's `isGoBoolShaped` (`adapter-go-template/src/adapter/lib/go-emit.ts`).
  ERB always calls `bf.truthy?`; Mojolicious and Xslate never do.
- Operand typing is assembled per adapter: `collectStringValueNames` (eight
  copies, `spec/dsl-adapter-shared-lowering.md`), `collectNumberValueNames`
  (`adapters/number-value.ts`, used by Perl), `collectBooleanValueNames`
  (`adapters/boolean-result.ts`), fed to `isStringTypedOperand`,
  `isNumberValuedExpr`, `isBooleanResultParsed` and `arithmeticOperandSeed`
  (`nullable-signal-attr.ts`) through per-adapter callbacks.

Fixing one position fixes that position. The neighbouring position (the
other emitter class, the condition walker, the child-prop path, the
callback evaluator) keeps the native operator, and the next fixture finds it.
This is the "one decision, two implementations, no test comparing them"
family AGENTS.md names.

### Native operators, measured

Probed while writing this note (`perl -e`, `php -r`, `python3 -c`,
`ruby -e`, `node -e` one-liners; JS column from Node):

| Expression | JS | Perl | PHP | Python | Ruby |
| --- | --- | --- | --- | --- | --- |
| truthiness of `"0"` | true | false | false | true | true |
| truthiness of `0` | false | false | false | false | **true** |
| truthiness of `NaN` | false | **true** | **true** | **true** | **true** |
| `"10" < "9"` | true | false (numeric) | false (numeric strings) | true | — |
| `"😀" < "｡"` (U+1F600 vs U+FF61) | true (UTF-16 units) | — | — | false (code points) | — |
| `"-2.0" < 0` | true | — | true | `TypeError` | `ArgumentError` |
| `"1e0" == "1"` | false | — | true | — | — |
| `[1] == [1]` (as `===`) | false | — | true | true | true |
| `1 < 2` / `2 < 1` as a value | `true` / `false` | `1` / `''` | — | — | — |
| `1e20` as text | `100000000000000000000` | `1e+20` | `1.0E+20` | — | `1.0e+20` |
| `-0.0` as text | `0` | `0` | `-0` | `-0.0` | `-0.0` |

MiniJinja and Pebble were not probed directly. Their rendered behaviour comes
from the issues: MiniJinja compares `'-2.0' < 0` as strings and Pebble throws
(#3805); MiniJinja `==` compares arrays by contents (#3774); MiniJinja `[]`
does not read a list with the string key `'1'` (#3802).

The existing runtime helpers are not JS-normative either. Their declared
vector divergences (`*/vector-divergences.json`) show `number(null)` and
`number("")` return `NaN` on six of seven runtimes (deliberately, "unset
props must not silently zero downstream arithmetic"), `string(null)` returns
`""` on all seven, and Perl's `filter_truthy` treats `"0"` as falsy. They are
display and defensive helpers. The JS-exact versions already exist on every
runtime, inside the callback evaluator: `_to_number`, `_to_string`,
`_truthy`, `_relational`, `_strict_eq`, `_read_index`
(`packages/adapter-jinja/python/barefootjs/evaluator.py`,
`packages/adapter-perl/lib/BarefootJS/Evaluator.pm`, and the Go, Ruby, PHP,
Java and Rust evaluators), held to `eval-vectors.json` with **no** divergence
allowance (`packages/adapter-tests/vectors/README.md`).

### Issues this explains

| Issue | Operation | Where it diverges |
| --- | --- | --- |
| #3823 | ToBoolean | Perl native truthiness: `"0"` is falsy |
| #3808 | boolean value | Perl has no boolean; a comparison passed as a child prop prints `0` / `1` |
| #3789 | boolean value, nullish | bare `false` text child (all); Perl comparison through `&&` in an attribute; Go `??` on a concrete field; Go absent `&&` operand in an attribute |
| #3805 | relational, ToNumber | ERB, Jinja, Pebble raise on `s < 0`; MiniJinja compares as strings |
| #3769 | `===` | Mojolicious keeps numeric `==` when one side is a number literal |
| #3700 | ToNumber, nil reading | omitted `n?: number \| null` reads as `0`, not `NaN` |
| #3750 | ToNumber, nil reading | the shared coercion is skipped in body destructures, filter predicates, Go conditions, Go `EvalExpr` |
| #3740 | ToString, nil reading | omitted prop in concatenation renders `""`, not `undefined` |
| #3819 | unary `-`, number literal | `-0` spelled as integer zero on all template adapters |
| #3814 | number literal | `1e20` and above fails on Go and Pebble |
| #3720 | number literal | remaining: exponent literals fail to parse on Xslate/Pebble, `1e-7` prints `1e-07` on Mojolicious |
| #3802 | ToPropertyKey | callback evaluators use ToNumber on list keys (ERB, Perl, Pebble); Jinja/MiniJinja `[]` |
| #3795 | ToPropertyKey | Go spells a non-identifier literal key as a struct field; fractional literal index; string receivers |
| #3774 | `===` on objects | contents, not identity (Blade, ERB, Jinja, MiniJinja, Twig, Go) |
| #3704 | string `.at` | lone surrogate becomes U+FFFD (not a primitive operation; see "Out of scope") |

## Operation table

### Summary

| Operation | Helper (canonical id) | Native-safe when Phase 1 proves |
| --- | --- | --- |
| ToBoolean (test of `if`, `?:`, `!`, `&&`, `\|\|`) | `truthy` (exists; Perl: new) | operand is a `boolean` |
| ToNumber (operand of `- * / %`, unary `+`/`-`, relational) | `to_number` (new) | operand is a non-nil `number` |
| ToString (`+` concat operand, template-literal part) | `to_string` (new) | operand is a non-nil `string` |
| Boolean value (a boolean that escapes into a variable, prop, JSON) | `boolean` (Perl, exists), `bool_str` (exists) | target has a boolean type (not Perl) |
| ToPropertyKey / index read (`a[k]`, `a['k']`) | `get` (exists; PHP spells `index`) | receiver is an array and key is a non-negative integer index |
| `===` / `!==` | `strict_eq` (Perl; Go `bf_eq`, PHP and Java `eq`) | both operands non-nil, same primitive type, and the target's operator is pinned for it |
| `<` `<=` `>` `>=` | `lt` `le` `gt` `ge` (exist on Go) | both operands non-nil `number` |
| binary `+` | `plus` (new); `add` (exists, numbers only) | both `number` (native `+`) or one `string` (native concat over `to_string`) |
| unary `-` | `neg` (exists in the catalogue) | operand is a non-zero number literal |
| number literal | `number` over the JS spelling (exists) | value is a safe integer and not `-0` |
| `??`, `?.`, `== null` | `coalesce` (Pebble, exists), `nullish` (Go, exists) | target's nil test is pinned (Perl `//`, PHP `??`, Jinja `is defined and is not none`, Ruby `.nil?`) |
| `JSON.stringify` numbers | `json` (exists, fixed by #3804) | never native |

Every new helper delegates to the runtime's evaluator primitive of the same
operation, as PHP's `index` already delegates to `Evaluator::index`
(`packages/adapter-php/src/BarefootJS.php`). One implementation per runtime,
two entry points, two vector corpora.

### Status by adapter

N = native always; H = helper always; P = native only on a shared proof,
helper otherwise; M = mixed, decided per position or per emitter.

| Operation | Go | Mojo | Xslate | Jinja | MiniJinja | Twig | Blade | ERB | Pebble |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ToBoolean | M | N | N | P | P | P | P | H | P |
| ToNumber | M | M | M | M | M | M | M | M | M |
| ToString (concat) | H | M | M | P | P | P | P | P | H |
| Boolean value | — | M | M | — | — | — | — | — | — |
| index read | H | H | H | N | N | H | H | H | H |
| `===` | H | M | N | N | N | H | H | N | H |
| relational | H | N | N | N | N | N | N | N | N |
| binary `+` | H | H | H | P | P | P | P | P | P |
| unary `-` | H | N | N | N | N | N | N | N | N |
| number literal | N | N | N | N | N | N | N | N | N |
| `??` | M | N | N | N | N | M | N | N | H |
| `JSON.stringify` | H | H | H | H | H | H | H | H | H |

Sources, per row, in the order of the subsections below.

### ToBoolean

**JS.** `false`, `0`, `-0`, `NaN`, `""`, `null`, `undefined` are falsy;
everything else is truthy, including `"0"`, `"00"`, `" "`, `[]`, `{}`.

**Native-safe.** Only a proven `boolean`: a comparison, `!`, a boolean
literal, a `boolean`-typed non-optional name (`collectBooleanValueNames`), or
`&&` / `||` / `?:` whose value operands are all booleans
(`isBooleanResultParsed` with its `isBooleanName`). `number` is not enough:
`NaN` is truthy in Perl, PHP, Python and Ruby (probe). `string` is not
enough on Perl and PHP (`"0"`), and Ruby treats `""` as truthy. A target may
extend its set only with vectors (for example Python with `string`).

Per target: Go's `{{if}}`, `not`, `and`, `or` read an empty slice or map as
false (`go-emit.ts`, `lowerJsNot`); MiniJinja and Pebble native truthiness is
not pinned anywhere, so they stay `boolean`-only.

**Helper.** `truthy(v) → host boolean`: JS ToBoolean; nil is falsy. Exists
as `bf_truthy` (Go), `truthy` (Python, PHP, Java, Rust), `truthy?` (Ruby).
Perl has only `Evaluator::_truthy`; the step adds `BarefootJS::truthy`
delegating to it.

**Status.** Go: `bf_truthy` unless `isGoBoolShaped`, but `&&` / `||` lower to
`and` / `or`, which test natively (`go-template-adapter.ts`, `logical`).
Mojolicious and Xslate: native `!`, `&&`, `||`, `?:` (`expr/emitters.ts`).
Jinja, MiniJinja, Twig, Blade, Pebble: `truthyTest`. ERB: `bf.truthy?` in
every position.

### ToNumber

**JS.** `undefined` → `NaN`; `null` → `0`; booleans → `1` / `0`; strings are
trimmed, `""` → `0`, a numeric literal (including `1e5`, `-2.0`, `0x10`,
`Infinity`) → its value, anything else → `NaN`.

**Native-safe.** The operand is a proven `number` and cannot be nil (a
required prop, a typed signal or memo, a literal, an arithmetic result).
Nil is handled before the operator by the nil-reading rewrite (see
"Decision point"), so an operand whose nil reading is known becomes a
non-nil operand. A `string` operand is never native-safe: Python raises,
Ruby raises, Java/Pebble throws (#3805).

**Helper.** `to_number(v) → host double`: the evaluator's `_to_number`
(nil reads as `null` → `0`). Distinct from the existing `number`, whose
declared divergences (nil and `""` → `NaN`) stay for its current callers.

**Status.** All M. `/` and `%` always go through `div` / `mod`
(`arithmeticHelper`); Perl and Go route `+ - *` through `add` / `subtract`
/ `multiply` and `bf_add` / `bf_sub` / `bf_mul`; the nil coercion is the
shared `arithmeticOperandCoercion` spelled per adapter. No adapter converts
a non-nil string operand.

### ToString and boolean values

**JS.** ToString: `null` → `"null"`, `undefined` → `"undefined"`, booleans
→ `"true"` / `"false"`, numbers → `Number::toString` (shortest round trip,
decimal in [1e-6, 1e21), `-0` → `"0"`, `NaN`, `Infinity`). This is what `+`
concatenation and a template-literal part apply.

Output positions are a different operation. A JSX text child renders nothing
for `true`, `false`, `null`, `undefined`; an attribute is omitted for `null`
/ `undefined`. The existing `string` helper (nil → `""`) and `bool_str`
implement this display rule, not ToString. #3740 and the template-literal
case in its comments come from using `string` where ToString was meant
(`concatOperand` in Jinja, MiniJinja, Twig, Blade, ERB; `templateLiteral` in
Jinja wraps each part in `bf.string`).

**Native-safe.** ToString of a proven non-nil `string`: the operand itself.
Nothing else: number spelling differs on Perl, PHP, Python and Ruby (probe),
boolean spelling differs on Perl and PHP.

**Boolean values.** Perl has no boolean. A comparison yields `1` / `''`, a
boolean literal is emitted as `1` / `0` (`MojoTopLevelEmitter.literal`).
Wherever such a value leaves the expression (a child prop, a stored
variable, a `JSON.stringify` argument, an `&&` result), the plan
materializes it with `boolean(v)` (`BarefootJS.pm`, returns
`JSON::PP::true` / `false`), which `string`, `bool_str` and `json` already
print as `true` / `false`. Printing it at the output alone (`bool_str`, the
#3806 approach) misses every escape route: #3808 (child prop) and the
`JSON.stringify([n, true])` comment on #3789.

**Helper.** `to_string(v) → host string`: the evaluator's `_to_string`
(nil reads as `null` → `"null"`).

### ToPropertyKey and index read

**JS.** `o[k]` converts `k` with ToPropertyKey (ToString for
non-symbols). An array element is read only through a canonical array
index: `"1"` and `1` and `1.0` read element 1; `"01"`, `"1e0"`, `"-0"`,
`"1.0"` are ordinary property names and read `undefined`; `-0` the number
converts to `"0"` and reads element 0; `-1` reads `undefined` (no
wrap-around). A string receiver reads one UTF-16 code unit by index.
An object reads its own key by the string. `arr[1.1]` reads `undefined`.

**Native-safe.** Receiver proven an array and key proven a non-negative
integer: today only a loop `index` binding (`ScopeBindingSource 'index'`).
Python, Perl and Ruby wrap a negative index, Python raises on a string key
(probe), and MiniJinja `[]` reads a string key as a mapping key (#3802), so
nothing broader is safe without vectors.

**Helper.** `get(recv, key) → value | nil`: the evaluator's `_read_index`,
made canonical everywhere. Exists as `bf_get` (Go), `get` (Perl, Python,
Ruby, Java, Rust), `index` (PHP). Python's `_read_index` and Perl's
`BarefootJS::get` already test the canonical form; Perl's
`Evaluator::_read_index` (`int(_to_number($index))`), and the Ruby and Java
evaluators per #3802, do not. Go's `bf_get` is also case-tolerant on struct
fields (Go field names are exported); that stays a declared Go divergence.

A literal key (`obj['a.b']`, `rows[1.1]`) is a computed `member`, not an
`index-access` (`expression-parser.ts`). The plan covers both, so Go stops
spelling a non-identifier key as a struct field (#3795).

**Status.** Helper on every adapter except Jinja and MiniJinja, which emit
`[]` (`indexAccess` in both emitter classes).

### `===` / `!==`

**JS.** Same type and same value. `NaN !== NaN`; `0 === -0`; `null !==
undefined`; no coercion (`1 !== "1"`, `true !== 1`); objects and arrays by
reference.

**Native-safe.** Both operands proven non-nil and of the same primitive
type, and the target's operator pinned for that type:

| Runtime | `number × number` | `string × string` | `boolean × boolean` |
| --- | --- | --- | --- |
| Perl | `==` | `eq` | `==` (values are `1` / `''` / `0` or JSON booleans) |
| PHP | `==` (int/float by value) | `===` only: `"1e0" == "1"` is true | `===` |
| Python, Ruby | `==` | `==` | `==` (Python `True == 1` is true, so only when both are proven boolean) |
| Go, Java | helper (`bf_eq`, `bf.eq`) | helper | helper |
| MiniJinja, Kolon | vectors decide | vectors decide | vectors decide |

Operands proven of **different** primitive types fold to a constant
(`false` for `===`). An `unknown`, union or optional operand takes the
helper. This is the conservative answer to the #3769 design question; the
policy question it raises is under "Open questions".

**Helper.** `strict_eq(a, b) → host boolean`: the evaluator's `_strict_eq`.
Exists as `strict_eq` (Perl), `bf_eq` / `bf_ne` (Go), `eq` / `neq` (PHP,
Java). Python, Ruby and Rust have it only in the evaluator. The negated form
is `!strict_eq` on every target.

**Objects.** Needs a product decision; see rollout step 8.

**Status.** Go, Twig, Blade, Pebble: helper. Mojolicious: `eq` for a
string-typed side, `strict_eq` when neither side is number or boolean, `==`
otherwise (`emitPerlEquality`, `adapter-mojolicious/src/adapter/expr/operand.ts`).
Xslate, Jinja, MiniJinja, ERB: native `==` for every pair.

### Relational `<` `<=` `>` `>=`

**JS.** Abstract Relational Comparison: two strings compare by UTF-16 code
unit; otherwise both go through ToNumber, and a `NaN` makes the result
false. `null < 1` is true, `undefined < 1` is false.

**Native-safe.** Both operands proven non-nil `number`. Not two strings:
Perl `<` is numeric, PHP compares numeric strings numerically (`"10" <
"9"` is false), Python compares code points, not UTF-16 units (probe). A
target may add `string × string` for ASCII-only operands only if the proof
can establish ASCII, which Phase 1 cannot today.

**Helper.** `lt` / `le` / `gt` / `ge(a, b) → host boolean`: the evaluator's
`_relational`. Exists on Go (`Lt` … in `runtime/bf.go`, over `compareJS`).

**Status.** Go: helper. Every DSL adapter: native operator from the `opMap`
in `binary`. By reading the Mojolicious emitter (not rendered), two
string-typed operands reach Perl's numeric `<`; the step's fixture should
include `'10' < '9'`.

### Binary `+`

**JS.** If either operand is a string (after ToPrimitive), ToString both and
concatenate; otherwise ToNumber both and add as doubles.

**Native-safe.** Two proven non-nil `number`s: native `+`, except where the
target's `+` is not IEEE double past 2^53 (Ruby, Python and PHP integers;
declared as `add/beyond the safe-integer edge rounds as a double` in their
`vector-divergences.json`; Perl and Go already use `add` / `bf_add`). One
proven non-nil `string`: native concatenation over `to_string` of the other
operand. Anything else: `plus`.

**Helper.** `plus(a, b) → value`: the evaluator's `+` (`_binary('+', …)`).
`add` stays the numbers-only helper.

**Status.** The string-vs-number split is already shared
(`isStringConcatBinary`). What is missing is the third case: an
`unknown × unknown` `+` lowers to numeric addition on every adapter (Go
`bf_add` maps a string to `0`, per the `_emitPlus` comment; Python `+`
concatenates two strings and raises on a string plus a number).

### Unary `-` and number literals

**JS.** `-x` is `-(ToNumber(x))` and keeps the sign of zero: `-0` is
negative zero, `1 / -0` is `-Infinity`, `String(-0)` is `"0"`. A literal
can be any double: `1e21`, `1e-7`, `100000000000000000000`.

**Native-safe.** Unary minus over a non-zero number literal (Phase 1 folds
it into the literal). Any other operand can be an integer zero in hosts
whose integer and float types differ, and the sign is lost. A number
literal is native-safe when it is a safe integer
(`Number.isSafeInteger(v) && !Object.is(v, -0)`); the parser's `raw` is
TypeScript's normalised decimal (`1e20` → `100000000000000000000`,
`expression-parser.ts`), which overflows Go's integer parse and Java's
`Long.parseLong` (#3814).

**Helper.** `neg(v) → host double` (in the catalogue; must return `-0.0`
for a zero operand). A non-safe-integer literal is spelled as
`number('<String(v)>')`, which every runtime already parses (vector domain
`number/…`), so no target needs an exponent-literal syntax (Kolon and Pebble
lack one, per #3720's comments). `-0` is spelled `neg(0)`.

**Status.** Go emits `bf_neg`; every DSL adapter emits a native prefix `-`.
Literals are emitted from `value` or `raw` natively on every adapter.

### Nullish: `??`, `?.`, `== null`

**JS.** `null` and `undefined` are nullish; `false`, `0`, `""`, `NaN` are
not.

**Native-safe.** The target's nil test, when pinned: Perl `//` and
`defined`, PHP `??`, Jinja and MiniJinja `is defined and is not none`, Ruby
`.nil?`. Go `or` tests truthiness, so it is native-safe only when the left
operand is proven never nil and never falsy; `isNeverNullishOperand` already
returns the left operand directly when it cannot be nil.

**Helper.** `coalesce(a, b)` (Pebble), `bf_nullish` (Go). The distinction
between `null` and `undefined` does not matter here; it matters only to
ToNumber and ToString, which the nil-reading rewrite handles.

**Status.** Go: `or`, `bf_nullish` or the left operand, per operand shape
(`logical`); this is where `nullish-over-false-yielding-operand` is pinned.
Twig: `??`, or an `is null` test for three left-operand shapes
(`nullishCoalesce`). Pebble: `bf.coalesce`. The rest: native.

### `JSON.stringify` numbers

Done by #3804: `json` walks lists and maps and spells each number with the
runtime's JS `Number::toString`, `NaN` / `Infinity` as `null`. It stays
helper-only. The open part is the Perl boolean inside the value (#3789
comment), which is the "boolean value" row.

### Out of scope

- **Lone surrogates** (#3704, `string-at-lone-surrogate`). The host strings
  of seven runtimes cannot carry a lone surrogate through concatenation and
  UTF-8 output (`spec/template-helpers.md`, `at`). No IR decision fixes
  that; see "Open questions".
- **Loose `==` / `!=`.** Out of the evaluator subset (`spec/compiler.md`);
  this note does not add them.
- **ToPrimitive on objects** (`[1,2] + ''`). Covered by `plus` and
  `to_string` returning JS's array join; the plan never proves an object
  native-safe.

## Decision point

### Where

The decision is one pure function in `@barefootjs/jsx`'s `adapters/`
directory, computed by the shared dispatcher and handed to the emitter. The
emitter only spells it.

```ts
// packages/jsx/src/adapters/primitive-plan.ts

/** What Phase-1 types prove about an operand at its read. */
export interface OperandFacts {
  /** The JS types the value can have; `unknown` when not proven. */
  readonly types: ReadonlySet<'number' | 'string' | 'boolean' | 'nil' | 'object' | 'unknown'>
  /** Which JS value a nil stands for, when `types` has `nil`. */
  readonly nil?: 'null' | 'undefined' | 'either'
  /** A non-negative integer (a loop index binding). */
  readonly index?: boolean
}

export type PrimitiveOp =
  | 'to-boolean' | 'to-number' | 'to-string' | 'boolean-value' | 'get'
  | 'strict-eq' | 'relational' | 'plus' | 'neg' | 'number-literal' | 'nullish'

export type Proof =
  | 'boolean' | 'number' | 'string' | 'number-pair' | 'string-pair'
  | 'boolean-pair' | 'array-index' | 'safe-integer' | 'non-nil'

/** The (op, proof) pairs a target's native operators are pinned for. */
export type NativeSafeTable = Readonly<Partial<Record<PrimitiveOp, readonly Proof[]>>>

export type PrimitivePlan =
  | { readonly mode: 'native'; readonly op: PrimitiveOp; readonly proof: Proof }
  | { readonly mode: 'helper'; readonly op: PrimitiveOp; readonly helper: PrimitiveHelper }
  | { readonly mode: 'const'; readonly value: boolean }   // `===` across proven different types
  | { readonly mode: 'refuse'; readonly reason: string }  // BF101, e.g. nil reading `either`

export function operandFacts(expr: ParsedExpr, typing: ScopedOperandTyping): OperandFacts
export function planPrimitive(node: ParsedExpr, typing: ScopedOperandTyping, target: NativeSafeTable): PrimitivePlan | null
```

- `OperandTyping` is built once per component from `ir.metadata`
  (`propsParams` with `optional` / `declaredType`, signals, memos,
  `localConstants`, named types) by one `collectOperandTyping`, which
  replaces the eight `collectStringValueNames`, `collectNumberValueNames` and
  `collectBooleanValueNames`. Note that `collectNumberValueNames` admits an
  optional `number` prop today (it tests `p.type` only); the new typing
  does not, because an omitted prop is nil.
- `ScopedOperandTyping` is that typing seen through a `BindingScope`
  (`typing.at(scope)`): a loop binding shadows outer names, and a row read
  takes its type from `ScopeBinding.row` through `loopValueTypeAt`, as
  `BindingScope.isStringValueName` already does for strings.
- `operandFacts` is the single classifier. It replaces
  `isStringTypedOperand`, `isNumberValuedExpr`, `isBooleanResultParsed`,
  `isGoBoolShaped` and `arithmeticOperandSeed`, which become thin wrappers
  or go away.
- `NativeSafeTable` is data each adapter declares once, next to its
  `CALLBACK_LOWERING`. Step 0 fills it so the plans reproduce today's output;
  each rollout step narrows it to what the vectors pin.

### Nil reading is a tree rewrite

Before planning, Phase 1 rewrites a nil-capable operand of a ToNumber or
ToString consumer by its nil reading, the same way `stringifyBooleanBranches`
rewrites a tree today:

| Consumer | nil reads as `null` | nil reads as `undefined` |
| --- | --- | --- |
| numeric (`- * / %`, unary, relational, numeric `+`) | `x ?? 0` | `x ?? NaN` |
| string (`+` concat, template-literal part) | `x ?? 'null'` | `x ?? 'undefined'` |

`either` (`n?: number | null`, `c?: string | null`) is refused with BF101,
the precedent `arithmeticCoercionOrRefuse` set for numbers (#3700); see
"Open questions" for the cost of extending that to strings. `NaN` is spelled
`number('NaN')`, which the `number` vectors already pin. After the rewrite
the operand is non-nil, so `to_number` and `to_string` need no nil argument
and stay identical to the evaluator's `_to_number` / `_to_string` (nil reads
as `null`). This generalizes `arithmeticOperandCoercion` (#3474) from number
props to every typed read, and closes the #3750 gaps by construction: the
rewrite runs wherever the plan runs.

### How it reaches emitters

`emitParsedExpr` computes the plan for `binary`, `unary`, `logical`,
`conditional` (its test), `index-access`, computed `member` and number
`literal` nodes, and passes it as a new last parameter:

```ts
binary(op: string, left: ParsedExpr, right: ParsedExpr, emit: Emit, plan: PrimitivePlan): string
```

The emitter supplies the inputs through one new `ParsedExprEmitter` member,
`primitives: { typing(): ScopedOperandTyping; nativeSafe: NativeSafeTable }`.
Because the plan is a parameter, TypeScript makes every implementation of
every emitter class accept it, and a method that ignores it is visible in
review and in the cross-adapter test.

**Why not on the `ParsedExpr` nodes in `jsx-to-ir`.** Three reasons, from
the code:

1. One tree is read in more than one scope. A memo's `parsed` body is
   checked in the component scope (`refuseAmbiguousNilMemoArithmetic`) and
   lowered at its use; a row read changes type with the loop it sits in
   (`ScopeBinding.row`). A per-node annotation would hold one scope's answer.
2. Phase 2 builds nodes that Phase 1 never saw:
   `stringifyBooleanBranches`, the synthetic `String` call for `x.toString()`
   in `emitParsedExpr`, and static-const inlining (`_staticArrayElement`
   returns a `ParsedExpr`). An annotation would be missing exactly where
   bugs hide.
3. A new `ParsedExpr` field is a subset extension (`spec/subset-conformance.md`)
   and would also have to be stripped from the evaluator's
   `serializeParsedExpr` payload.

The plan is still a Phase-1 artifact in the sense the epic asks for: the
function, its inputs and its tests live in `@barefootjs/jsx`; an emitter
cannot compute a different answer, only spell the one it is given.

**Go without widening `GoEmitContext`.** `GoTemplateAdapter` implements
`ParsedExprEmitter` itself, so it supplies `primitives` from `this.scope` and
`this.state`; the component typing is a new `CompileState` field, and
`CompileState` is already the context's `state`. The condition and filter
walkers in `condition-expr.ts` stop handling operator nodes themselves (their
`case 'binary'` arms) and delegate them to `ConditionExprHost.renderParsedExpr`,
which already exists. `GoEmitContext` gains nothing.

**The callback evaluator** decides at run time, not compile time: it is
already a dynamic JS implementation of the same operations. It is in scope
only through its primitives, which the helpers share.

## Conformance

`helper-vectors` becomes the single spec for the runtime half; the plan
test pins the compile-time half; shared fixtures pin the positions.

1. **One vector file per operation.** `packages/adapter-tests/vectors/primitives/<op>.ts`
   (cases plus the JS reference) generates `primitives/<op>.json`. Each case
   carries a `domain` tag naming the proof it belongs to
   (`{ fn: 'lt', args: ['10', '9'], domain: 'string-pair', note: … }`).
   Edge cases per file: `truthy` (`"0"`, `"00"`, `""`, `" "`, `NaN`, `-0`,
   `[]`, `{}`, nil), `to_number` (`""`, `" 8 "`, `"1e5"`, `"-2.0"`,
   `"0x10"`, `"abc"`, booleans, nil), `to_string` (`1e21`, `1e-7`, `-0`,
   `NaN`, booleans, nil, arrays), `get` (`'1'`, `'01'`, `'1e0'`, `'-0'`,
   `-0`, `1.1`, `-1`, string receivers by UTF-16 unit), `strict_eq`
   (`NaN`, `0` / `-0`, `1` / `'1'`, `true` / `1`, nil), `lt` (`'10'` /
   `'9'`, `'-2.0'` / `0`, `'a'` / `0`, nil, astral vs BMP), `plus`, `neg`.
   The existing `vectors.json` keeps the catalogue helpers.
2. **One sentinel added.** `{"$num": "-0"}` in `expect`, compared by sign
   (`copysign`), so `neg(0)` is testable; today the catalogue says "`-0` is
   value-equal to `0`" because JSON cannot carry it.
3. **Every runtime, both bindings.** Each harness (the six in
   `vectors/README.md`'s runner table, plus `adapter-rust/runtime/tests/helper_vectors.rs`,
   which that table omits) binds each op to its helper and runs every case.
   It also binds each op to the **native operator** and runs only the cases
   whose `domain` its adapter's `NativeSafeTable` claims. A native claim
   without passing vectors fails the harness. The two Perl adapters, and the
   two PHP adapters, share one table per runtime, read by the harness from a
   JSON file the TS table is generated from (or checked against).
4. **No divergence allowance** for `primitives/`, as for `eval-vectors.json`.
   A helper that delegates to the evaluator primitive passes both corpora by
   construction.
5. **Plan test.** A cross-adapter test, in the style of
   `arithmetic-cross-adapter.test.ts` over `dsl-helper-calls.ts`, compiles
   one component per operation and position with every adapter and asserts
   that each emits the helper or the native spelling its plan names. A local
   special case in one emitter class breaks it.
6. **Position fixtures.** One shared fixture per operation, covering the
   positions #3804's `json-stringify-number-spelling` covers (attribute,
   text, ternary test, `&&` / `||`, concatenation, template literal, loop
   row, destructured props, child prop) plus the condition of an `{{if}}`,
   a `.filter()` predicate and a memo body, in both props forms, with Hono's
   output as `expectedHtml`.

**Why a new runtime cannot drift.** Its harness must bind every op in
`primitives/` (an unbound `fn` fails, `spec/template-helpers.md`); its
`NativeSafeTable` claims are executed against vectors; its emitters receive
plans they did not compute; and the shared fixtures run on it from the first
CI job. Getting an op wrong requires a declared, reviewed divergence, and
`primitives/` admits none.

## Rollout plan

One operation per PR. Step 0 is output-preserving; every later step changes
output only where the fixture shows the JS answer.

| Step | Operation | Closes | Graduates | Risk |
| --- | --- | --- | --- | --- |
| 0 | Infrastructure: `primitive-plan.ts`, `collectOperandTyping`, plan parameter, `NativeSafeTable` = today's behaviour, `primitives/` corpus, `-0` sentinel | — | — | Low: byte-identical (constitution rule 6) |
| 1 | ToBoolean | #3823 | Perl `filter_truthy/the string "0" is truthy` vector divergence | Low: helper exists on six runtimes; real change on Perl and Go `and` / `or` |
| 2 | Index read and literal keys | #3802, #3795 | `callback-noncanonical-index-key`, `string-key-list-index`, `non-identifier-literal-key` | Low: helpers exist; evaluator fixes are local |
| 3 | Relational and ToNumber | #3805 | `string-number-relational-comparison` | Medium: every `<` on a DSL adapter not proven `number × number` becomes a helper call |
| 4 | Nil reading, ToString, `+` | #3740, #3750, #3700 (if refusal stays) | `omitted-optional-row-field-plus`; `omitted-optional-nullable-number-arithmetic` stays a refusal | High: touches every concatenation and template literal; needs the `either` decision |
| 5 | Boolean values and display | #3808, #3789 items 1–2 and the JSON comment | `boolean-text-child` | Medium: Perl value representation |
| 6 | Unary `-` and number literals | #3819, #3814, #3720 | `negative-zero-literal` | Low: literal spelling only |
| 7 | Nullish on Go | #3789 items 3–4 | `nullish-over-false-yielding-operand` | Low: Go only |
| 8 | `===` | #3769; #3774 after the decision | `object-equality-by-contents`, `array-self-equality` | Needs a product decision |

Order: step 1 is the pilot because five adapters already run the same proof,
so the plan reproduces their output and only Perl and Go change. Steps 2
and 3 close the most pinned limitations per line of change. Step 4 has the
most issues but the highest risk and a pending decision, so it follows the
two that prove the machinery. Steps 6 and 7 are small and independent.

**Step 8, `===` on objects (#3774).** Two options; work on one is wasted if
the other is chosen.

- **(a) Reference identity everywhere.** `strict_eq` compares non-primitives
  by identity: Perl already does (`refaddr` in `_strict_eq`), Ruby can use
  `equal?`, Python `is`. Blade and Twig cannot: decoded props are
  copy-on-write PHP arrays, indistinguishable from an equal copy. Go
  cannot: object props are value structs, and comparing slice pointers may
  equate two distinct empty arrays (unverified, #3774 comment). Those three
  stay pinned until their value models change, and MiniJinja depends on an
  API not checked to be public.
- **(b) Refuse.** BF101 for `===` / `!==` when either operand is not proven
  primitive, on template adapters. This matches the evaluator contract,
  which already refuses a non-primitive equality operand
  (`spec/compiler.md`, "ParsedExpr Evaluator Semantics"). It turns code
  that compiles today into a build error; `x === null` style tests are
  unaffected because they lower as nullish checks.

The plan supports either: (a) is `strict_eq` with an identity branch, (b) is
`mode: 'refuse'`.

## Open questions

1. **Trust declared types at the runtime boundary?** Native-safe rests on
   TypeScript types. A Mojolicious controller may pass `'1'` for a
   `number` prop (#3769); with a native `==` it equals `1`, with
   `strict_eq` it does not. Proposed: trust the declared type, and document
   that the host must pass JSON-typed values. The alternative is normalizing
   numeric strings when props enter the runtime.
2. **`either` nil reading for strings.** Refusing `c?: string | null` in
   concatenation, as arithmetic does, breaks common code such as
   `'btn ' + props.className` (#3740 comment). Options: refuse; pick one
   reading (`undefined`) and register a `silent` limitation; or add a
   runtime undefined sentinel to each prop model.
3. **Nils from data, not types.** An optional row field, an index read, or
   an explicit `null` against a missing JSON key all arrive as one nil. The
   rewrite only covers reads whose type gives the reading. Accept the
   evaluator's rule (nil reads as `null`) for these, or refuse?
4. **#3774:** option (a) or (b) above.
5. **Native `+` past 2^53** on Ruby, Python and PHP: keep the pinned
   `add` divergence and the native operator, or route every number `+`
   through `add` as Perl and Go do?
6. **Lone surrogates (#3704):** reclassify `string-at-lone-surrogate` as a
   permanent documented limitation, or refuse `.at()` results that are then
   compared or concatenated?
7. **Helper naming.** This note uses the catalogue's snake_case ids and lets
   runtimes keep their spellings through `helperNames` (`index` for `get` on
   PHP, `bf_eq` for `strict_eq` on Go, as Perl spells `div` `divide`).
   Rename the runtime methods instead?
