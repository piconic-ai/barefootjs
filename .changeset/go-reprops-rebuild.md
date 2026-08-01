---
"@barefootjs/go-template": minor
---

Rebuild a loop-row child's props per row instead of refusing (#2448)

#2456 made the Go adapter refuse with `BF101` when a per-row prop override
would leave a child's constructor-derived field stale. This replaces the
refusal with a fix: the child rebuilds itself per row.

`bf_with_props` (#2445) patches fields on the child's already-constructed
shared instance. It cannot re-run `New<Child>Props`, which is where a
`createMemo` body and a `createSignal` initial value are both baked — so
overriding `n` left `Dbl` at the one-shot value on every row. The blocker was
that `html/template` has no expression language and can only call FuncMap
entries, and `New<Child>Props` is not one.

The compiler now emits a props **rebuilder** per affected component and
registers it from the generated package's `init()`:

```go
func init() {
	bf.RegisterReprops("Badge", func(base interface{}, kv ...interface{}) (interface{}, error) {
		b := base.(BadgeProps)
		in := BadgeInput{ScopeID: b.ScopeID, BfParent: b.BfParent, BfMount: b.BfMount,
			Text: b.Text, N: b.N}
		// … apply the row's overrides …
		p := NewBadgeProps(in)   // every derived field recomputes
		p.Scripts = b.Scripts
		return p, nil
	})
}
```

and the row calls it through one new fixed FuncMap entry:

```gotemplate
{{template "Badge" (bf_reprops "Badge" $.BadgeSlot0 "Text" .Label "N" .N)}}
```

**No setup change.** `t.Funcs(bf.FuncMap())` is unchanged; `bf_reprops` is a
fixed entry that looks the rebuilder up at template EXECUTE time. That
deferral is load-bearing: Go initializes a package's variables before its
`init()` functions, so an app that builds its template set in a package-level
var calls `FuncMap()` while the registry is still empty. Merging the
constructors into `FuncMap()`'s return value would fail such an app at parse
time with `function "bf_new_Badge" not defined`; one fixed entry resolved at
execute time cannot. Pinned by `TestRepropsResolvesAtExecuteTimeNotFuncsTime`.

Identity is carried from the base instance, never re-derived — `New<Child>Props`
mints a random `ScopeID` when handed an empty one, and a per-row scope would
break hydration. `bf_with_children` still composes on the outside, so per-row
children are applied to the rebuilt value.

Blast radius is deliberately zero for everything else: only a child with a
constructor-derived field gets a rebuilder, and only an override that actually
feeds one of those fields switches helpers. A plain passthrough override stays
on `bf_with_props`, byte-identical.

`BF101` remains for shapes the rebuilder declines — a `...rest` bag, a spread
slot, context consumers, or nested child Inputs add Input fields with no Props
counterpart, so the Input can't be reconstructed. Refusing still beats emitting
silently-stale output.

`bf_with_props` stays exported and registered: templates generated before this
call it, and it remains the cheaper path when nothing is derived. Measured at
100 rows, the two are within noise of each other (`bf_reprops` is ~3–5% slower
per execution and allocates slightly less).

Aliased destructures are handled correctly on the rebuild path. The generated
override switch is keyed by the name the PARENT writes (`"N"`) and assigns to
the child's own Input field (`in.Count`), which is where those two naming sides
are reconciled. The `bf_with_props` path still has that mismatch when nothing
is derived — tracked as #2457.
