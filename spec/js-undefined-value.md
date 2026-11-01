# JS `undefined` as a Value: Two Nils on Every Runtime

Design note, follow-up to `spec/js-primitive-semantics.md` (#3824). It
answers one question: how does every template runtime carry JS `undefined`
and `null` as two distinct values, from the host boundary through template
evaluation, the callback evaluator and JSON output, so that one TSX renders
the same HTML as Hono on every backend?

> Status: **design accepted, not implemented.** The owner decided the
> questions in §7 on 2026-11-01. Tracked by #3848. Claims about current behaviour cite the code on
> `main` (`9615fb9a1`) or a throwaway probe (listed in the appendix; not
> committed). "Prior probe" means the earlier per-runtime sentinel probes
> (Python/jinja2, Perl, PHP 8.3, Ruby, Pebble 4.1.2). Anything not verified
> is marked **unverified**.

Terms, in addition to those of `js-primitive-semantics.md`:

- **Host nil**: the language's own nil (`nil`, `None`, `undef`, `null`).
- **Undefined sentinel** (`UNDEF` below): one singleton value per runtime
  that stands for JS `undefined`.
- **Presence**: whether a key exists in a props bag or row object, apart
  from its value. JS has four states for a prop: absent, present
  `undefined`, `null`, a value. They differ in output only through `'k' in
  props` and `{...props}` overrides; everything else sees the first two as
  `undefined`.
- **Carries undefined**: a target whose runtime passes the
  `undefined`-specific vectors (see "Evaluator and vectors"). Declared as
  data next to `NativeSafeTable`, like a native-safe claim.

## Decisions in this note

1. **Host nil is JS `null`. `undefined` is a sentinel, created only at
   reads.** No runtime walks decoded data to convert anything. JSON decoders
   already produce host nil for `null` on every host (Go probe, prior
   Python/Perl/Ruby/PHP/Java probes). `UNDEF` comes from a fixed set of
   producers:
   - a missing key;
   - an index out of range;
   - `at` and `find` / `findLast` with no result;
   - `?.` over a nullish receiver;
   - the `undefined` identifier;
   - an omitted declared prop;
   - an absent `Opt` field (Go).

   The reverse choice (nil is `undefined`, a sentinel for `null`) would
   need every host's JSON `null` rewritten into the sentinel at the boundary
   and inside every nested row. It was rejected.
2. **Presence is tracked apart from the value.** Hash runtimes already have
   it: the key, plus `passed()` for the caller's key set (Perl
   `BarefootJS.pm:395`, Python `runtime.py:872`, Ruby `barefoot_js.rb:361`,
   PHP `BarefootJS.php:536`, Java `Bf.java:1790`, Rust `runtime.rs:1013`).
   Go gets a four-state `bf.Opt[T]`.
3. **One set of predicates per runtime**: `is_undefined`, `is_null` and
   `is_nullish`. Every runtime and emitter site that today means "nullish"
   by testing host nil switches to `is_nullish`.
4. **The static nil reading stays, as an optimisation and as the plan for
   targets that do not carry `undefined` yet.** It no longer limits what
   output is possible.
5. **JSON is `JSON.stringify`.** An object member whose value is `UNDEF` is
   dropped. An array element that is `UNDEF` becomes `null`. A top-level
   `UNDEF` gives no string, and the output position renders nothing.
6. **A destructure default applies to an absent or `undefined` prop
   only.** An explicit `null` keeps `null`. This fixes all nine
   `_derive_stash_from_defaults` ports and the TS twin (`ssr-defaults.ts:141`
   `props[d.propName] != null`).
7. **`x === null` and `x === undefined` become strict tests.** The loose
   `x == null` stays a nullish test.

## 1. The JS contract

Checked with Node 22.22.0 and Hono 4.13.13 (probe `js/contract.mjs`).

### Where `undefined` and `null` diverge in output

| Operation | `undefined` | `null` |
| --- | --- | --- |
| `String(x)`, `` `${x}` `` | `"undefined"` | `"null"` |
| `Number(x)`, `+x` | `NaN` | `0` |
| `x + 1` / `x + 'x'` | `NaN` / `"undefinedx"` | `1` / `"nullx"` |
| `x + x`; `undefined + null` | `NaN`; `NaN` | `0` |
| `x * 2`, `-x` | `NaN`, `NaN` | `0`, `-0` |
| `x < 1` / `x <= 0` | `false` / `false` | `true` / `true` |
| `Math.max(x, 1)`, `Math.round(x)` | `NaN`, `NaN` | `1`, `0` |
| `JSON.stringify(x)` | `undefined` (not a string) | `"null"` |
| `JSON.stringify({a: x})` | `{}` (member dropped) | `{"a":null}` |
| `JSON.stringify({a: {b: x}})` | `{"a":{}}` | `{"a":{"b":null}}` |
| `JSON.stringify([x])`; a hole `[,1]` | `[null]`; `[null,1]` | `[null]` |
| `x === undefined` / `x === null` | `true` / `false` | `false` / `true` |
| `undefined == null` | `true` (loose) | |
| `typeof x` | `"undefined"` | `"object"` |
| `(v = 'D') => v`, `{ a = 'D' }`, `[c = 'D']` | `'D'` | `null` |
| Hono `<D v={x}/>` with `({ v = 'D' })` | `<i>D</i>` | `<i></i>` |
| `'v' in props` for `<K v={x}/>` vs `<K/>` | `true` vs `false` | `true` |
| `{ ...{ a: x } }` keeps key `a` | yes | yes |
| `[x].includes(undefined)` | `true` | `false` |
| `[x].indexOf(undefined)` | `0` | `-1` |
| `[,].includes(undefined)` / `[,].indexOf(undefined)` | `true` / `-1` | |
| `[3, undefined, 1, null, 2].sort((a, b) => a - b)` | `undefined` last, comparator not called | `null` sorts as `0`: `[null,1,2,3,undefined]` |
| `"aundefinedb".includes(x)` | `true` (needle is ToString'd) | (`"anullb"`) `true` |
| `new URLSearchParams({a: x})` | `a=undefined` | `a=null` |

Producers of `undefined`:

- `o.missing`;
- `[1][5]`, `[1][-1]`, and a hole;
- `[1].find(f)`, `.findLast(f)` and `.at(5)` with no result;
- `[].pop()`;
- `null?.x`, `o.missing?.x`, `o.k?.x` (`typeof (null?.x)` is
  `"undefined"`: optional chaining yields `undefined`, never `null`).

Producers of `null`:

- `"ab".match(/z/)`;
- `URLSearchParams.get` of an absent key (`vectors.json`
  `search_params_get/absent key is null`);
- JSON data.

### Where they do not diverge

| Operation | Both |
| --- | --- |
| Truthiness (`!!x`, `if`, `&&` / `\|\|` choice) | falsy |
| `x ?? 'd'`, `x \|\| 'd'` | `'d'` |
| `x && 1` | returns `x` itself (so the operand's identity still matters) |
| `x == null` | `true` |
| `x?.y` | `undefined` |
| JSX text child (`<p>{x}</p>`, `<p>{[x]}</p>`) | renders nothing |
| Attribute (`title`, `data-x`, `class`, `value`, `disabled`) | omitted (Hono: `<a></a>`) |
| `style={{ color: x }}` | property dropped, `style=""` |
| `[null, undefined].join()`, `String([null, undefined])` | `","`: both elements are empty |

Not in scope, so the domain stays as it is: holes as a separate state
(`0 in [,1]` is `false`, `0 in [undefined,1]` is `true`). JSON cannot
carry a hole, and the template subset never creates one.

## 2. Evaluator and vectors

### Value domain

`spec/compiler.md` ("ParsedExpr Evaluator Semantics", value domain,
line 765) is rewritten. The domain becomes JSON values plus `undefined`.
`null` comes only from a literal or from data. The following read as
`undefined`:

- a missing object field;
- an out-of-range or non-canonical index;
- the unshadowed `undefined` identifier (today an unbound name, and refused);
- a nested `.find` with no result, if one is ever admitted.

Rules, from §1:

- ToNumber `undefined` is `NaN`. ToString is `"undefined"`. ToBoolean is
  `false`.
- Relational with `undefined` is `false` (through `NaN`).
- `===` distinguishes the two. `??` coalesces both.
- `includes` uses SameValueZero, which distinguishes them.
- `join` prints both as `""`.
- An `object-literal` member may hold `undefined` in memory. It is dropped
  only at JSON.
- A spread of `undefined` is a no-op (already true).

The reference evaluator (`vectors/eval-reference.ts`) changes in the same
places:

- `EvalValue` gains `undefined` (`:31`);
- `toNum` and `toStr` (`:49`, `:64`);
- `readProperty` missing → `undefined` (`:239-243`);
- `readIndex` out of range → `undefined` (`:290`);
- `join` (`:284`).

A `{ "kind": "identifier", "name": "undefined" }` node is evaluated as the
constant when not bound. The parser already emits that shape:
`expression-parser.ts:968` builds one itself.

### JSON encoding for vectors

The note reserves `{"$undef": true}`, an object with exactly that one key,
in both `args` and `expect`. It sits next to `{"$num": "NaN" | "Infinity" |
"-Infinity" | "-0"}`. Inside an object, a member whose value is
`{"$undef": true}` is a present key holding `undefined`, distinct from a
missing key. That keeps the four presence states testable.

Encoders change in these places:

- `primitives/generate.ts:47-53`: today `undefined` → `null` in an
  expect, and refused in an arg;
- the catalogue generator (`vectors/generate.ts`);
- `eval-generate.ts`.

Every harness decoder maps the sentinel to `UNDEF`:

- Java `JsonDecode.materialize` (`JsonDecode.java:35-71`, which already
  special-cases `$num`);
- Go `primitive_vectors_test.go` / `eval_vectors_test.go`;
- Perl `t/template_primitives.t`;
- Python `test_template_primitives.py`;
- PHP `test_template_primitives.php`;
- Rust `tests/template_primitives.rs`;
- the Ruby runner.

`spec/template-helpers.md` lines 66-68 ("a JS `undefined` expect encodes
as `null` (backends have a single absent value)") are replaced.

### Cases that change

| File | Change |
| --- | --- |
| `primitives/get.ts` | 9 expects go from `null` to `$undef`: lines 38, 47, 48, 51, 52, 55, 56, 57, 61 (out of range, fractional, negative, past 64-bit, missing key) |
| `primitives/to_number.ts` | add `undefined → NaN` |
| `primitives/to_string.ts` | add `undefined → "undefined"` and `['a', undefined] → "a,"` |
| `primitives/truthy.ts` | add `undefined → false` |
| `primitives/plus.ts` | add `u+1 = NaN`, `u+'x' = 'undefinedx'`, `'x'+u`, `u+null = NaN`, `u+u = NaN`. Rewrite the header (lines 4-6, "the `undefined` reading is refused") |
| `primitives/relational.ts` (lt/le/gt/ge) | add `undefined < 1`, `undefined <= 0` (both `false`; the `null <= 0` twin is `true`) |
| `primitives/strict_eq.ts` | add `u === u`, `u === null` (false), `u === 0` (false) |
| `primitives/neg.ts` | add `-undefined = NaN` |
| `primitives/types.ts` | keep one `nil` domain for both values (`unaryDomain` `:94`). No `NativeSafeTable` claims a native operator over nil |
| `vectors.json` (catalogue) | `at` ×4 and `find` ×1 expect `$undef`. `search_params_get/absent key is null` stays `null` |
| `eval-cases.ts` | `:91` (`item.missing`) and `:106` (index out of range) expect `$undef`; notes at `:81` and `:148` reworded. Add `item.missing + ''`, `item.missing + 1`, `item.missing === null`, `item.missing === undefined`, bare `undefined`, `[item.missing].includes(null)`, `({ a: item.missing })`, and `.join` over an `undefined` element |

Each runtime's `vector-divergences.json` entries for `number(null)` and
`string(null)` (the display helpers) stay. Those helpers are not ToNumber
or ToString (`js-primitive-semantics.md`, "ToString and boolean values").

## 3. Host boundary, per runtime

| Runtime | How props arrive today | Missing vs `null` at the boundary | Verdict |
| --- | --- | --- | --- |
| Python (Jinja) | `dict`, through `render_child` / `render_named` (`runtime.py:830`, `backend_jinja.py:138`) | `k in d` | Already three-state. Fix the seed |
| Ruby (ERB) | symbol-keyed `Hash` bound as `v` (`backend/erb.rb:89`) | `key?` | Already three-state. Fix the seed |
| Perl (Mojo, Xslate) | hashref / stash (`BarefootJS.pm:402`) | `exists` | Already three-state. Fix the seed |
| PHP (Twig, Blade) | `array` (`BarefootJS.php:723`) | `array_key_exists` | Already three-state. Fix the seed |
| Java (Pebble) | `Map<String,Object>` (Gson-decoded `LinkedHashMap`, `Main.java:109-117`; Spring passes a `Map`) | `containsKey` (probe: Gson and Jackson maps keep `null` entries) | Already three-state. Document a POJO recipe |
| Rust (MiniJinja) | `&JsValue` from `JsValue::from_json(&serde_json::Value)` (`backend_minijinja.rs:167`) | `Map::contains_key` (probe) | Already three-state. Document a serde recipe |
| Go | generated `XxxInput` struct built in Go code (`adapter-go-template/src/test-render.ts:388`; "Input is never marshalled", `go-template-adapter.test.ts:6185`) | none: an omitted field is its zero value, and `null` is not expressible | **API change: `bf.Opt[T]`** |

### Shared: the seed and the default

Every hash runtime loses presence at the same point.
`_derive_stash_from_defaults` seeds every declared prop with `d.value`,
which the manifest spells `"value": null` for a prop without a default.
For example, `chip.ssr-defaults.json` from the probe is
`{"c":{"propName":"c","value":null}}`. The same function also treats a
present `null` as absent:

- Python `runtime.py:554` (`props.get(..) is not None`);
- Perl `BarefootJS.pm:639` (`defined`);
- PHP `BarefootJS.php:740` (`!== null`);
- Rust `manifest.rs:136` (`!matches!(pv, JsValue::Null)`);
- Ruby `barefoot_js.rb:461`;
- Java `DeriveStashFromDefaults.java:79` (`!= null`);
- the TS twin `ssr-defaults.ts:141`.

New contract:

- The manifest writes `value` only when the prop has a default.
- The runtime seeds as follows:
  - prop absent or `UNDEF`, with a default: the default;
  - prop absent or `UNDEF`, without a default: `UNDEF`;
  - prop present: its value, including host nil, which is `null`.

This also graduates `defaulted-array-prop-explicit-null`, which all nine
adapters pin.

The test harnesses' null-fill goes too. Each passes an omitted declared
prop as nil:

- `adapter-jinja/src/test-render.ts:540`;
- `adapter-erb/src/test-render.ts:553`;
- `adapter-pebble/src/test-render.ts:308`;
- `adapter-rust/src/test-render.ts:469`;
- `adapter-twig/src/test-render.ts:579`;
- `adapter-blade/src/test-render.ts:583`;
- `adapter-xslate/src/test-render.ts:545`;
- `adapter-mojolicious/src/test-render.ts:628-629`.

They must leave the key out, so the runtime's seed decides. A fixture
`props: { c: null }` then exercises a real `null`.

Host-visible change: a host that passes `None` / `nil` / `undef` / `null`
to mean "unset" gets JS `null` semantics:

- `'btn ' + c` renders `btn null`;
- a destructure default no longer applies.

The way to say "unset" is to omit the key. Each runtime also exports its
`UNDEF` for a host that must pass "present `undefined`".

### Go: `bf.Opt[T]`

Candidates, probed with go1.25.6 (`probe go/v1`, `go/v2`):

| Candidate | Missing | `null` | Value | Notes |
| --- | --- | --- | --- | --- |
| `interface{}` field (today) | `nil` | `nil` | value | not distinguishable |
| `*T` field | `nil` | `nil` | `&v` | not distinguishable (probe) |
| `json.RawMessage` | `nil`, len 0 | `"null"` | raw | distinguishable, but untyped. The constructor would decode it itself |
| `map[string]any` | `_, ok := m[k]` false | present, `nil` | value | distinguishable (probe). Untyped, so it fits rows, not the typed Input |
| **generic `Opt[T]` with `UnmarshalJSON`** | method not called: zero value (absent) | `UnmarshalJSON("null")` called | value | **distinguishable** in a struct field, in a `[]Opt`, and as a `map[string]Opt` value (probe) |
| encoding/json/v2 (`GOEXPERIMENT=jsonv2`) | same with `UnmarshalJSONFrom` | `PeekKind()=='n'` | value | works, but only behind the experiment in 1.25 (the build fails without it). v1 `encoding/json` gives the same results under both v1 implementations, so v2 is not needed |

On marshal, the `omitzero` tag (v1, Go ≥ 1.24) with `func (Opt) IsZero()
bool` drops an absent member: `{}`, or `{"label":null,"n":0}` for null and
zero. An absent element of a `[]Opt` marshals as `null`. That is exactly
`JSON.stringify`.

In templates, a field of type `Opt[T]` is a struct, and text/template
treats a struct as always truthy (probe: `{{if .ID}}` is true for an absent
field). So every template read goes through the niladic method `.V`:
`{{.ID.V}}`, `{{if .ID.V}}`, `{{bf_to_string .ID.V}}`. The probe shows
`[|F|undefined]`, `[|F|null]`, `[o|T|o]` and `[|F|]` for absent, null,
`"o"` and `""`.

The JS ecosystem precedents use the same idea:

- `oapi-codegen/nullable`, `Nullable[T]` (absent / null / value, dropped by
  `omitempty`) ([repo](https://github.com/oapi-codegen/nullable)). Its
  internals were not read: **unverified**.
- goja's `_undefined` / `_null` singletons
  ([`value.go`](https://github.com/dop251/goja/blob/master/value.go):
  `type valueUndefined struct { valueNull }`, `_undefined Value =
  valueUndefined{}`).

typescript-go's `internal/evaluator` has no `null` or `undefined` value at
all. `nil` there means "not evaluated"
([`evaluator.go`](https://github.com/microsoft/typescript-go/blob/main/internal/evaluator/evaluator.go)),
which is the current BarefootJS model.

```go
// runtime/opt.go (new)
type optState uint8

const (
	optAbsent optState = iota // zero value: the key is not passed
	optUndef                  // passed, value undefined (a forwarded `c={props.c}`)
	optNull
	optSet
)

type Opt[T any] struct {
	v T
	s optState
}

func Some[T any](v T) Opt[T]  { return Opt[T]{v: v, s: optSet} }
func Null[T any]() Opt[T]     { return Opt[T]{s: optNull} }
func Undef[T any]() Opt[T]    { return Opt[T]{s: optUndef} }
func (o Opt[T]) Passed() bool { return o.s != optAbsent } // JS `'k' in props`
func (o Opt[T]) IsZero() bool { return o.s <= optUndef }  // omitzero: JSON drops undefined
// V is the JS value: Undefined, nil (null) or the value.
func (o Opt[T]) V() any {
	switch o.s {
	case optAbsent, optUndef:
		return Undefined
	case optNull:
		return nil
	}
	return o.v
}

// Forward is what a parent passes for `c={expr}`: the key is present
// even when the value is undefined.
func (o Opt[T]) Forward() Opt[T] {
	if o.s == optAbsent {
		o.s = optUndef
	}
	return o
}

func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*o = Null[T]()
		return nil
	}
	o.s = optSet
	return json.Unmarshal(b, &o.v)
}
func (o Opt[T]) MarshalJSON() ([]byte, error) {
	if o.s != optSet {
		return []byte("null"), nil
	}
	return json.Marshal(o.v)
}

type undefinedT struct{}

func (*undefinedT) String() string { return "" }

// Undefined is JS undefined.
var Undefined any = (*undefinedT)(nil)
```

Rule for the generated Input: a prop whose type admits absence or `null`
becomes `bf.Opt[T]`. That covers `optional`, `| null`, `| undefined`, and
an optional `unknown` / `any` (`bf.Opt[any]`). A required, non-nullable
prop keeps its plain Go type. Optional fields of generated loop-row structs
follow the same rule.

Before (generated today for `props: { label: string; c?: string | null;
n?: number; tone?: string }`, rendered with `bun` in `probe gogen`):

```go
type ChipInput struct {
	ScopeID string // Optional: if empty, random ID is generated
	BfParent string // Optional: parent scope id
	BfMount string // Optional: slot id in parent
	Label string
	C interface{}
	N interface{}
	Tone interface{}
}
// NewChipProps:
	if in.C != nil {
		bfCallerProps["c"] = in.C
	}
	...
		C: in.C,
```

```text
{{bf_string (bf_concat_str "chip " .C)}} ... {{if ne .N nil}}data-n=... title="{{bf_nullish .Tone "plain"}}"
```

After:

```go
type ChipInput struct {
	ScopeID  string
	BfParent string
	BfMount  string
	Label    string          `json:"label"`
	C        bf.Opt[string]  `json:"c,omitzero"`
	N        bf.Opt[float64] `json:"n,omitzero"`
	Tone     bf.Opt[string]  `json:"tone,omitzero"`
}

type ChipProps struct {
	// … unchanged bookkeeping fields …
	Label string `json:"label"`
	C     any    `json:"c"` // bf.Undefined, nil (null) or string
	N     any    `json:"n"`
	Tone  any    `json:"tone"`
}

func NewChipProps(in ChipInput) ChipProps {
	// …
	bfCallerProps := map[string]interface{}{}
	bfCallerProps["label"] = in.Label
	if in.C.Passed() {
		bfCallerProps["c"] = in.C.V() // bf_json drops it when undefined
	}
	// … same for N, Tone …
	return ChipProps{ /* … */ Label: in.Label, C: in.C.V(), N: in.N.V(), Tone: in.Tone.V()}
}
```

```text
{{bf_plus "chip " .C}} ... {{if ne .N nil}}data-n=... title="{{bf_nullish .Tone "plain"}}"
```

The template keeps `ne .N nil`. text/template's `ne` treats the typed-nil
`Undefined` as nil (probe: `ne .U nil` is false), so attribute omission
stays native. `bf_nullish` (`bf.go:4511`) changes to test `isNullish`.

Host code:

```go
// before: no way to pass null; nil and omission are the same
in := ChipInput{Label: "x", C: "primary"}

// after
in := ChipInput{Label: "x", C: bf.Some("primary")} // value
in := ChipInput{Label: "x", C: bf.Null[string]()}  // null  → 'chip null', bf-p {"c":null}
in := ChipInput{Label: "x"}                        // omitted → 'chip undefined', no bf-p key
var in ChipInput; err := json.Unmarshal(body, &in) // {"c":null} → Null, {} → absent
```

What this removes:

- the nillable-flip machinery in `prop-types.ts` (`resolvePropGoType`
  `:855-928`). Every optional scalar becomes an `Opt`, so these eleven
  collectors and `appliesDefaultOnNil`'s boxing reason go away:
  `nullishConsumedPropNames`, `omittableAttrConsumedPropNames`,
  `textConsumedPropNames`, `presenceCheckedPropNames`,
  `nullableSignalSeedPropNames`, `optionalChainReceiverPropNames`,
  `arithmeticAbsentPropNames`, `propsSpreadForwardedPropNames`,
  `nillableForwardedPropNames`, the `localStructFields` map flip and the
  `NULLISH_SCALAR_GO_TYPES` gate;
- the `emitCallerPropsInit` heuristic (`go-template-adapter.ts:2591-2637`),
  whose docstring records that `interface{}` "cannot tell explicit null from
  omitted".

It also graduates the two Go-only limitations:

- `props-spread-explicit-null-override`, which needs the fourth state
  (`Forward()`) for `component-spread-explicit-undefined-prop`;
- `nullish-optional-scalar-row-field`.

### Rust

The boundary is already a map: `JsValue::Object` built from
`serde_json::Value`, and a missing key is `None` from `Map::get` (probe). A
host that builds props from its own structs controls presence with serde
attributes. Probe results (`probe rs`, serde 1.0.228, offline):

| Field | `{}` | `{"c":null}` | `{"c":"x"}` | serialise absent / null |
| --- | --- | --- | --- | --- |
| `Option<String>` | `None` | `None` | `Some` | `{"c":null}` for both |
| `#[serde(default)] Option<Option<String>>` | `None` | **`None`** (serde gotcha) | `Some(Some)` | `{"c":null}` |
| `#[serde(default, skip_serializing_if = "Option::is_none", with = "double_option")] Option<Option<String>>` | `None` | `Some(None)` | `Some(Some)` | `{}` / `{"c":null}` |

The last row is `serde_with::rust::double_option`
([docs](https://docs.rs/serde_with/latest/serde_with/rust/double_option/index.html)).
The probe used a hand-written equivalent in five lines, to avoid a new
crate download. The recommendation is to document that recipe and to add
`barefootjs::Opt<T>` (the same four states as Go, with `Serialize` /
`Deserialize` impls) so hosts need no `serde_with`.

Trap: `serde_json::Value`'s `Index` returns `&Null` for a missing key
(probe: `v["b"]` is `null`). Runtime code must read with `.get()`. This is
**unverified** per call site; step R audits `[` reads in `runtime.rs` and
`manifest.rs`.

### Java

The boundary is a `Map`, and `containsKey` already tells the two apart
(probe, Gson 2.11.0 and Jackson 2.18.2 maps). For a host that binds POJOs
before handing a `Map` over, these options were probed
(`probe java`):

- **Jackson tree**: `JsonNode.has(k)` / `isNull()` tell the two apart.
- **Jackson POJO**: a field `Opt<T> c = Opt.absent()` with a
  `JsonDeserializer` overriding `getNullValue` → `Opt.ofNull()` and
  `getAbsentValue`, plus a serializer whose `isEmpty` is true for absent
  under `@JsonInclude(NON_EMPTY)`. Absent / null / set round-trip as `{}` /
  `{"c":null}` / `{"c":"x"}`, and a list element `[null]`.
- `JsonNullable<T>` (openapitools, `jackson-databind-nullable`):
  `undefined()` is always omitted, `of(null)` writes `null`
  ([repo](https://github.com/OpenAPITools/jackson-databind-nullable)). Not
  probed: no new download.
- **Gson POJO**: a field initialised to the sentinel (`Object c =
  Undefined.U`) stays the sentinel when the key is missing and becomes
  `null` for JSON `null` (probe). Gson writes the sentinel as `{}`, and
  drops `null` members unless `serializeNulls()` is set (probe). The
  runtime's own `Bf.json` writer (`Bf.java:628`) is not Gson, so this
  matters only for host code.

Recommendation: the documented contract stays "`Map<String,Object>` with
JSON semantics". POJO binding is a host concern, covered by the recipes
above.

### Python, Ruby, Perl, PHP

These runtimes read a missing key as follows:

- Python: `d.get` → `None`;
- Ruby: `h[k]` → `nil`;
- Perl: `$h->{k}` → `undef`;
- PHP: `$a['k'] ?? null`, and Twig `strict_variables => false`
  (`TwigBackend.php:81`) makes a missing variable `null`.

The change is to read presence at the three places that matter:

- the seed (above);
- `get` / `bf.get`;
- the generated member read of an optional or unknown field (§4).

Ruby can make a missing top-level var cheap with `Hash#default = UNDEF` on
`v` (**unverified** against the `v[:x]` reads of every emitter).

## 4. Runtime representation, per runtime

| Runtime | `UNDEF` | Native truthiness | Prints | Native nil test sees it as | JSON encoder with it |
| --- | --- | --- | --- | --- | --- |
| Go | `(*undefinedT)(nil)` with `String() ""` | template `if`: false | `""` | template `ne x nil`: nil; Go `v == nil`: **false** | `encoding/json`: `null` (probe) |
| Python | a `ChainableUndefined` subclass, registered as the Environment's `undefined` (`backend_jinja.py:91`); `runtime.py` detects it by a marker, keeping its engine-free rule | false | `""` | `is defined`: false, `is none`: false | `TypeError` (prior probe) |
| Rust | `JsValue::Undefined` ↔ `Value::UNDEFINED` | false | `""` (`backend_minijinja.rs:82`) | `is defined`: false | `tojson`: `null`, members kept (prior probe) |
| Perl | blessed singleton overloading `bool` (false), `""` (`''`), `eq` | false | `''` | `defined`: **true**, `//`: **keeps it** | JSON::PP dies; Mojo::JSON writes `""` (prior probe) |
| Ruby | singleton with `nil?` → true, `to_s` → `''`, `[]` → self, `to_json` → `null` | **true** (Ruby can't override it) | `''` | `.nil?`: true; `== nil`: **false** | `null`, members kept |
| PHP | `final class Undefined` singleton, `__toString` → `''`, `JsonSerializable` → `null` | **true** | `''` | `??` / `isset`: **set**; `=== null`: false | `null`, members kept |
| Java | `Undefined.INSTANCE`, `toString` → `""` | Pebble `if` / `or` **throw** (prior probe) | `""` | `is null`: false; `default`: not applied | Gson `{}` (probe); runtime writer: custom |

ERB, Twig, Blade and Pebble see `UNDEF` as truthy natively. That is safe
only because their ToBoolean already goes through the helper unless the
operand is a proven boolean (status table: ERB H; Twig, Blade, Pebble P). A
proven boolean is a non-optional boolean name, a comparison or a literal
(`collectBooleanValueNames`, `isBooleanResultParsed`), and never holds
`UNDEF`. Perl's ToBoolean is N today. Step 1 of #3824 makes it P. The
overloaded `bool` covers any native position left.

### Runtime helper code to audit

The count is every nil test in the helper and evaluator sources (`grep -c`
over the files named). Each test is either "nullish" (→ `is_nullish`) or
"is JSON `null`" (→ `is_null`).

| Runtime | Files | Count |
| --- | --- | --- |
| Go | `runtime/bf.go`, `runtime/eval.go` (`== nil` / `!= nil` / `case nil`, some are `err`) | 64 |
| Perl | `BarefootJS.pm`, `BarefootJS/Evaluator.pm` (`defined` / `undef` / `//`) | 258 |
| Ruby | `barefoot_js.rb`, `barefoot_js/evaluator.rb` (`nil`) | 167 |
| Python | `runtime.py`, `evaluator.py` (`None`) | 168 |
| PHP | `BarefootJS.php`, `Evaluator.php` (`null` / `isset` / `??`) | 203 |
| Java | `Bf.java`, `JsValue.java`, `eval/Evaluator.java` | 63 |
| Rust | `src/*.rs` (`JsValue::Null`) | 95 |

Named sites that must change whatever the audit finds:

- Go:
  - `EvalNode` `??` (`eval.go:103`, `left == nil`);
  - `evalToString` (`eval.go:398`);
  - `evalToNumber` (`eval.go:332`);
  - `evalReadProperty` (`eval.go:702`), where a missing key must return
    `Undefined`, as must `getFieldValue`, which unwraps an `Opt` through
    `interface{ V() any }`;
  - `evalReadIndex` (`eval.go:1062`);
  - `Nullish` (`bf.go:4511`);
  - `FindEval` (`eval.go:921`), whose miss returns `Undefined`.
- Rust:
  - `mj_to_js` (`runtime.rs:1373`, `Undefined | None => Null`, split);
  - `runtime.rs:1347`;
  - `search_params.rs:118`: today it returns `UNDEFINED` for an absent
    key. JS `URLSearchParams.get` returns `null`, so after the split it must
    return `none`.
- Python: `js_string` returns `''` for an Undefined today (prior probe).
  So do `_read_index` and `bf.get`, which return `None` for a miss.
- Java: `coalesce` (`Bf.java:406`, `a == null`); `get` / `indexValue`
  (`Bf.java:450`); `JsValue.jsString` (`JsValue.java:35`).
- All runtimes:
  - `at` and `find` return `UNDEF` on a miss (catalogue vectors);
  - sort: the comparator and `bf_sort` move `UNDEF` to the end without
    calling the comparator. That is §1 behaviour; today's runtime ordering
    of a nil element is **unverified**.

### Emitter positions that would mishandle `UNDEF`

From a grep of template-string literals in each adapter's `src/adapter`
(origin/main). For each position the table gives the replacement. "OK"
means the native test is already correct for both nils.

| Adapter | Position (file:line) | Construct | Replacement |
| --- | --- | --- | --- |
| Mojolicious | `expr/emitters.ts:432`, `:818` | `(l // r)` for `??` | `do { my $t = l; BarefootJS::is_nullish($t) ? r : $t }` (keeps short-circuit) |
| | `expr/emitters.ts:219-220` | `x === null` / `=== undefined` / `==` → `!defined(x)` | `is_null` / `is_undefined` for strict, `is_nullish` for loose (decision 7) |
| | `expr/emitters.ts:203` | `defined($bf_lookup) &&` | `!is_nullish(...)` |
| | `expr/emitters.ts:262` | `x?.length` → `defined(r) ? … : undef` | `is_nullish(r) ? $BarefootJS::UNDEF : …` |
| | `mojo-adapter.ts:947` | `passed(name, defined($x))` fallback | `!is_undefined($x)` |
| | `mojo-adapter.ts:1058`, `:1085` | attribute omission `if (defined $v)` | `!is_nullish` |
| | `mojo-adapter.ts:1265` | lookup table `->{k} // ''` | `is_nullish` |
| Xslate | `expr/emitters.ts:355`, `:692` | `(l // r)` | `$bf.is_nullish(l) ? r : l` (Kolon has no `do`; `l` is pure and evaluated twice) |
| | `expr/emitters.ts:193` | `?.` → `(r == nil ? nil : …)` | test `is_nullish`, yield `UNDEF` |
| | `xslate-adapter.ts:898` | `(expr // {})` | `is_nullish` |
| | `xslate-adapter.ts:943`, `:1060`, `:1092` | `defined $x` (passed fallback, attribute omission) | as Mojo |
| | `xslate-adapter.ts:1249` | `[k] // ''` | `is_nullish` |
| Jinja | `expr/emitters.ts:239` | `?.` yields `none` | yield `UNDEF` (JS `?.` is `undefined`) |
| | `expr/emitters.ts:395`, `:716`; `jinja-adapter.ts:869`, `:977`, `:1000` | `is defined and is not none` | OK |
| | member `o.f`, index `o[k]` | native (index read N) | OK: a missing key is Undefined natively (probe `row: undefined null`, `oob: undefined`) |
| MiniJinja | `expr/emitters.ts:239` | `?.` yields `none` | yield `UNDEF` |
| | `expr/emitters.ts:386`, `:690`; `minijinja-adapter.ts:928`, `:1036`, `:1059` | `is defined and is not none` | OK |
| | `minijinja-adapter.ts:1220` | `[k] \| default('')` | OK (only an undefined miss) |
| Twig | `expr/emitters.ts:263`, `:265` | `l is null ? r : l`, `l ?? r` | `bf.is_nullish(l) ? r : l` |
| | `expr/emitters.ts:242-243` | `?.` via `?? null` / `is null` → `null` | test `is_nullish`, yield `UNDEF` |
| | `twig-adapter.ts:931` | passed fallback `is not null` | `not bf.is_undefined` |
| | `twig-adapter.ts:1036`, `:1059` | `is defined and is not null` | `not bf.is_nullish(v)` |
| | `twig-adapter.ts:1222` | `[k] ?? ''` | `bf.is_nullish` |
| | member `o.f` (`expr/emitters.ts:335`) | native attribute (missing → `null`) | `bf.index(o, 'f')` when the field is optional or unknown |
| Blade | `expr/emitters.ts:407`, `:714` | `(l ?? r)` | `($bf->is_nullish($t = l) ? r : $t)` |
| | `expr/emitters.ts:255` | `?.` via `?? null` | as Twig |
| | `blade-adapter.ts:1051`, `:1164`, `:1185` | `isset($v)`, `!== null` | `!$bf->is_nullish` / `!is_undefined` |
| | `blade-adapter.ts:894-899` | loop source `?? []` | `$bf->iterable(x)` (`UNDEF` would be iterated as an object) |
| | `blade-adapter.ts:1346` | `[k] ?? ''` | `is_nullish` |
| | `blade-adapter.ts:874` | `$t = $x ?? null` | OK (keeps `UNDEF`) |
| Pebble | `expr/emitters.ts:252` | `?.` via `is null` | `bf.is_nullish`, yield `UNDEF` |
| | `expr/emitters.ts:688-689` | arithmetic nil coercion `is null ? NaN` | goes away (the helper reads `UNDEF`) |
| | `pebble-adapter.ts:1011` | passed fallback `is not null` | `not bf.is_undefined` |
| | `expr/emitters.ts:335` | member `o.f` (Pebble attribute, `Map.get`) | `bf.get(o, 'f')` for an optional or unknown field |
| | native `if` / `or` on a non-boolean | throw (prior probe) | already `bf.truthy` (P). Keep it so |
| ERB | `expr/emitters.ts:416`, `:774`; `erb-adapter.ts:628`, `:1085`, `:1193`, `:1211` | `.nil?` | OK with the `nil?` override |
| | `expr/emitters.ts:215` | `?.` yields `nil` | yield `UNDEF` |
| | `expr/emitters.ts:358`, `:627` | `o&.[](:k)` | `bf.get_opt(o, :k)`: Ruby `nil&.[]` gives `nil`, JS gives `undefined` |
| | `expr/emitters.ts:359` | member `o[:k]` (missing → `nil`) | `bf.get(o, :k)` for an optional or unknown field |
| Go | `attr/element-attrs.ts:169-264`, `expr/condition-expr.ts:384` | `ne .X nil`, `eq .X nil` | OK (probe) |
| | an `Opt` field read | `.X` | `.X.V` |

The member-read rows are where the static reading still pays off. A
required field (`n: number`) cannot be absent and stays a native read. Only
an optional or unknown field needs the presence-aware helper.

### JSON re-serialisation

`json` (the `JSON.stringify` helper) and the `bf-p` payload already walk
lists and maps on every runtime (#3804). The walk gains three rules:

- an object member whose value is `UNDEF` is skipped;
- an array element that is `UNDEF` is written as `null`;
- a top-level `UNDEF` returns `UNDEF`, which prints `""` in a text
  position and omits an attribute.

No runtime may hand `UNDEF` to its stock encoder. Each stock encoder is
wrong in its own way:

- Python raises;
- Perl's JSON::PP dies, and Mojo::JSON writes `""`;
- Gson writes `{}`;
- MiniJinja `tojson`, Ruby, PHP and Go keep the member as `null`.

For Go, `bf_json` sees `bf.Undefined` inside `any` values. An `Opt` field
marshalled by `encoding/json` (host-side) is dropped by `omitzero` (probe).

Hono's `bf-p` is `JSON.stringify` (`adapter-hono/src/utils.ts:48`), so the
same rules make every runtime's `bf-p` byte-equal for the four presence
states. Today Go omits an optional `nil` key from `bf-p` even when the
caller meant `null`, and the client then re-renders `'chip ' + _p.c` as
`chip undefined`.

## 5. Interaction with `js-primitive-semantics.md`

| Section | Change |
| --- | --- |
| Terms, "Nil reading" (`:29-32`) | The nil reading is about *proof*, not representation. A target that carries `undefined` needs no reading to be correct. The reading lets the plan pick a native operator or skip a presence-aware read |
| "Nil reading is a tree rewrite" (`:505-553`) | Kept for `null` and `undefined` readings. It turns a typed nil-capable operand into a non-nil one so the native operator stays usable (`n?: number` under `*` → `(n ?? NaN) * 2` stays native). The nil split for `o.id + 1` stays: it needs no runtime support. For a target that carries `undefined`, an `either` operand and a dynamic `+` take the helper (`to_string`, `to_number`, `plus`), which read `UNDEF` exactly. No refusal |
| Decision 2 (`either` string reads `undefined` + `silent` limitation) | Not built as new behaviour (§7 (4)): today's output is pinned by U0 fixtures until a target carries `undefined`. Deleted in U9 |
| Decision 3 (untyped nil reads as `null`) | Replaced by the JS rule: a missing key or out-of-range read is `undefined`, data `null` is `null` |
| Decision 8 (refuse a dynamic `+` with an `undefined` reading) | Not built (§7 (4)): today's output is pinned by U0 fixtures until a target carries `undefined`. The `plus` variant of open question 8 is not needed: the value carries the reading. Deleted in U9 |
| Decision 4 ("`x === null` style tests are unaffected because they lower as nullish checks") | Wrong once two nils exist: `null === undefined` is `false`. Decision 7 here makes them strict |
| `numeric either` → BF101 (`:520`, #3700) | Applies only while a target does not carry `undefined`. `omitted-optional-nullable-number-arithmetic` (pinned BF101 on all nine) graduates per target |
| "Nullish" (`:404-422`): "the distinction … matters only to ToNumber and ToString" | It also matters to `===`, JSON, defaults, presence, `includes` / `indexOf` and sort (§1) |
| Revisit condition (`:715`) | Resolved by this note |

Effect on existing issues and limitations:

| Item | Today | After |
| --- | --- | --- |
| #3750 (coercion skipped in some positions) | open | closed by step 4a (the rewrite runs wherever the plan runs), independent of `UNDEF` |
| #3740 (omitted prop concatenates as `""`) | open | typed `c?: string`: closed by step 4a. `either` and untyped: closed per target by U steps |
| #3700 / `omitted-optional-nullable-number-arithmetic` | BF101 on nine | graduates per target when it carries `undefined` |
| `omitted-optional-row-field-plus` | silent on nine | step 4a (rewrite plus nil split) graduates it without `UNDEF`. The U steps keep it passing through the helper path |
| `defaulted-array-prop-explicit-null` | silent on nine | graduates per target (seed, decision 6) |
| `props-spread-explicit-null-override` | silent on Go | graduates in U-Go (`Opt.Forward`, `Passed`) |
| `nullish-optional-scalar-row-field` | silent on Go | graduates in U-Go (row `Opt` fields) |

## 6. Rollout plan

The ledger pattern of `primitives-expected-failures.json` is reused.
Shrink-only: a harness fails on an unexpected failure and on a listed case
that now passes. The `step` field takes string ids (`"U3"`), or a parallel
ledger is added. `eval-vectors.json` admits no divergence today
(`vectors/README.md`). It gets a sibling `eval-expected-failures.json` with
the same rules for the life of this rollout, and the file is deleted in U9.

| Step | Content | Validation | Risk |
| --- | --- | --- | --- |
| **4a** (folded from #3824 step 4) | Builds the parts of step 4 that need no runtime support: `to_string` / `plus` helpers delegating to the evaluator; the evaluator array-ToString fix (Python known); the nil-reading rewrite for typed `null` / `undefined` readings in every position (closes #3750); the nil split. **Not** decision 2's limitation or decision 8's refusal (see U1) | `primitives/` `to_string` / `plus` ledger entries for step 4 emptied; `omitted-optional-row-field-plus` graduates on nine | High, as the spec rates step 4: every concatenation and template literal |
| **U0** | Infrastructure, output-preserving. Adds the `$undef` encoding in the three generators and seven harness decoders; adds the §2 cases, with every runtime's failures listed in the ledgers; adds a `carriesUndefined: false` entry to every target's `NativeSafeTable` (and the JSON mirror `primitives-native-safe.json`); adds fixtures for each §1 row in each position (with explicit `null` props, omitted props and forwarded `undefined`), pinned as render divergences per adapter | byte-identical emitted output; ledgers list exactly the new cases | Low |
| **U1** | Shared compiler. `planPrimitive` reads `carriesUndefined`: true → the helper for `either` / unknown / dynamic `+`; false → today's plan (today's output, plus the existing numeric-`either` BF101; §7 (4)). Adds strict `=== null` / `=== undefined` versus loose `== null` in the plan. Changes the manifest's `ssrDefaults` to omit `value` when there is no default (every runtime reads a missing `value` as nil today: Python `d.get("value")`, Rust `unwrap_or(Null)`, PHP `?? null`, Perl `$d->{value}`. So this is output-preserving) | plan test over every adapter; output unchanged while every flag is false | Medium: the plan gains one input |
| **U2** Python (Jinja) | `UNDEF` and the predicates; evaluator; helpers (`to_string`, `plus`, `get`, `at`, `find`, `json`, sort); `?.` result; seed (decision 6); harness stops the null-fill; flag → true | ledger entries for `python` emptied; Jinja pins graduate: `omitted-optional-nullable-number-arithmetic`, `defaulted-array-prop-explicit-null`, U0 fixtures | Medium: cheapest engine (native Undefined), most runtime helpers touched |
| **U3** Rust (MiniJinja) | `JsValue::Undefined` (95 `JsValue::Null` sites); `mj_to_js` / `js_to_mj`; `search_params` → `null`; `barefootjs::Opt<T>`; the rest as U2 | same, `rust` | Medium: the enum change is checked by the compiler, so a missed `match` arm fails to build |
| **U4** Ruby (ERB) | singleton (`nil?` override); `get_opt` for `&.`; optional member reads through `bf.get`; the rest as U2 | same, `ruby` | Medium: `UNDEF` is truthy natively; relies on ERB's H truthiness |
| **U5** Perl (Mojo and Xslate) | overload singleton; replaces every `//` and `defined` emitter site in the table; 258 runtime sites; JSON walk before JSON::PP / Mojo::JSON; ToBoolean must already be P (step 1) | same, `perl`, both adapters | High: `defined` is idiomatic everywhere, and a missed site silently keeps `UNDEF` |
| **U6** PHP (Twig and Blade) | `Undefined` singleton; replaces every `??` / `isset` / `is null` site in the table; Twig optional member reads through `bf.index`; Blade `iterable`; 203 sites | same, `php`, both adapters | High: PHP objects are truthy and `??` treats them as set, so a missed site picks the wrong branch without an error |
| **U7** Java (Pebble) | `Undefined.INSTANCE`; `coalesce`, `get`, member reads through `bf.get`; JSON writer | same, `java` | Medium: a missed native `if` / `or` throws, so mistakes are loud |
| **U8** Go | `bf.Opt[T]`, `bf.Undefined`, `isNullish` (64 sites); generator rules (Input, Props, row structs, `.V` reads, `bfCallerProps`); deletes the flip collectors; Go harness `buildGoPropsInit` emits `bf.Some` / `bf.Null` / omission; breaking-change changeset and migration doc | same, `go`; Go-only limitations graduate | High: public Go API break, and the largest generator diff |
| **U9** Cleanup | Removes `carriesUndefined` and the plan's collapsed branches (decisions 2 and 8, numeric-`either` BF101); deletes both ledgers; rewrites `spec/compiler.md` value domain, `spec/template-helpers.md` `:66-68`, and `js-primitive-semantics.md` decisions 2, 3, 4 and 8 | ledgers empty; no limitation cites a nil-reading reason | Low |

Order: U2 and U3 are first because their engines already have
`Undefined`, so they prove the vectors, the plan flag and the harness
change at the lowest risk. U4 to U7 follow. Within them, the targets where
a missed site fails loudly (Java) or is masked by helper-always truthiness
(Ruby) go before the targets where it fails silently (Perl, PHP). Go is
last because it is the only host API break. It can start in parallel once
U1 lands, but must not flip its flag before the generator change is
complete.

Which #3824 step 4 work to fold in, and which to wait on:

- **Fold now (4a)**:
  - `to_string`, `plus`;
  - the evaluator corrections;
  - the rewrite for typed readings;
  - the nil split.

  None of it depends on how many nils a runtime has, and all of it stays
  correct afterwards.
- **Do not build as permanent behaviour**:
  - decision 2's `silent` limitation;
  - decision 8's refusal;
  - the "untyped nil reads as `null`" registration of decision 3.

  Per §7 (4), none of them is built: the shapes keep today's output,
  pinned by the U0 fixtures, until each target carries `undefined`. Only
  the existing numeric `either` refusal (#3700) stays, as the
  `carriesUndefined: false` branch of the plan, and U9 deletes it.

## 7. Decisions on the open questions

Decided by the owner on 2026-11-01. Each entry records the question, the
choice and what it fixes for the rollout.

1. **Go host API: `bf.Opt[T]`.** Every optional or nullable prop and row
   field becomes `bf.Opt[T]`, so host nil means JS `null` on Go exactly as on
   every other runtime. The alternative (`interface{}` plus a `bf.Null`
   sentinel) was rejected: it inverts the meaning of nil on Go alone and
   keeps the flip collectors and a deep rewrite of decoded rows. U8 ships it
   as a semver-major change of the Go runtime with a migration note (wrap
   optional fields in `bf.Some(...)`).
2. **`Opt` has four states**: absent, present `undefined`, `null`, a value.
   The zero value is "absent", so hosts meet the fourth state only when they
   ask for it, and `component-spread-explicit-undefined-prop` passes on Go
   without a Go-only limitation.
3. **Host nil is strict JS `null`.** Only a missing key (or an absent `Opt`)
   reads as `undefined`. No compatibility flag. Each runtime exports its
   `UNDEF` for a host that must pass a present `undefined`, and each U step
   adds a changelog entry for hosts that passed nil meaning "unset".
4. **Interim behaviour between 4a and the U steps**: the existing numeric
   `either` refusal (#3700) stays, gated by `carriesUndefined: false`, and
   graduates per target. Decision 8's new refusal of a dynamic `+` over an
   `undefined` reading is **not built**; today's output for that shape is
   pinned by the U0 fixtures until each target carries `undefined`. Decision
   2's `silent` limitation is likewise not added as new behaviour; the U0
   fixtures pin today's output.
5. **Vector sentinel: `{"$undef": true}`**, additive and one-key like
   `{"$num": "-0"}`.

## Appendix: probes

Throwaway probes, not committed; each line names what it ran:

- `js/contract.mjs`: Node 22.22.0 plus Hono 4.13.13 (§1). Extra `node -e`
  one-liners checked `find` / `at` / `match` / `pop`, sort with
  `undefined` / `null`, `flat` / `concat`, and `includes` needles.
- `go/v1/main.go`: `Opt[T]` UnmarshalJSON / MarshalJSON / `omitzero`,
  `json.RawMessage`, `*T`, `map[string]any` presence, the typed-nil sentinel
  in `html/template`, `encoding/json` of the sentinel. Run with
  `GOTOOLCHAIN=go1.25.6`, with and without `GOEXPERIMENT=jsonv2`.
- `go/v1/tpl/main.go`: `.ID.V` method reads in templates, and struct
  truthiness.
- `go/v1/ne/main.go`: `ne .U nil` / `eq` on the sentinel.
- `go/v2/main.go`: encoding/json/v2 (`UnmarshalJSONFrom`, `omitzero`).
  Build-excluded without `GOEXPERIMENT=jsonv2`.
- `gogen/gen.ts`: the generated Go for the Chip example (§3 "Before"),
  compiled with the local checkout's `GoTemplateAdapter`.
- `rs/`: serde `Option<Option<T>>` with `default` versus `double_option`,
  `serde_json::Value` presence and the `Index` trap (offline: serde
  1.0.228, serde_json 1.0.150).
- `java/Probe.java`: Jackson 2.18.2 tree, `Map` and an `Opt` deserializer;
  Gson 2.11.0 `JsonObject.has`, `Map` and a POJO initialised to the
  sentinel; serializer output.
- `jinja_undef.py`: jinja2 3.1.6 with a `ChainableUndefined` subclass as
  the sentinel (print, `if`, `or`, `default`, row read, out-of-range read,
  chaining).
