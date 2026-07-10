---
"@barefootjs/go-template": patch
---

Fix an object-valued signal with an explicit type argument (`createSignal<User>({ name: 'Ada', role: 'admin' })`) failing to `go run` on the Go template adapter.

The named Go struct (`type User struct { Name string; Role string }`) and the member-access lowering (`user().role` → `.User.Role`, correctly case-matched to the struct's own field names) were already both correct — this shape doesn't need the loop-only object-array struct-synthesis mechanism (`synthesizeStructFromSignal`) the divergence's own description pointed at. The actual gap was narrower: `convertInitialValue` (`value/value-lowering.ts`), which lowers a signal's initial value to its Go SSR literal, never recognized a struct-backed `interface`-kind `TypeInfo` as bakeable — it fell straight through to the `nil` fallback. For a `map[string]interface{}` field `nil` is a legal zero value (silently dropping the data), but for a plain (non-pointer) named-struct field it's not: `cannot use nil as User value in struct literal`, a Go compile error.

`convertInitialValue`'s `interface`-kind branch now also tries `jsLiteralToGo` (→ `parsedLiteralToGo`'s object-literal case, which already bakes an object literal against a named local struct correctly — proven by an existing passing test for a typed array-of-objects signal) whenever the type has an actual struct backing (`ctx.state.localStructFields.has(typeInfo.raw)`), mirroring the array branch just above it.

`signal-object-field` graduates from a render divergence to a passing render.

**Known residual limitation** (unrelated to this fixture, out of scope): a fully UNTYPED object-valued signal (`createSignal({...})` with no type argument, which lowers to `map[string]interface{}`) still falls to `nil` — a nil map is a legal zero value so this doesn't crash, but it does silently drop the initial data. No fixture exercises this shape today.
