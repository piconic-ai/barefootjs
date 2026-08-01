// Per-row child props reconstruction (#2448).
//
// `bf_with_props` (#2445) overrides fields on a child's already-constructed
// shared instance by reflection. That is correct for a plain passthrough prop
// and WRONG for anything the child's constructor DERIVES from it: a
// `createMemo` body and a `createSignal` initial value are both baked into the
// struct once by `New<Child>Props`, and reflection cannot re-run that.
//
// This file is the fix. Instead of patching fields, the parent asks the child
// to REBUILD its props: reconstruct the constructor Input from the base
// instance, apply the row's overrides, re-run the real constructor. Every
// derived field recomputes because the real Go code runs again.
//
// The constructor cannot be called from a template directly — `html/template`
// has no expression language and can only call FuncMap entries. So the
// compiler emits, per component, a closure that does the rebuild in generated
// Go (typed field assignments, no reflection), and registers it here from the
// generated package's `init()`. `FuncMap()` gains exactly ONE fixed entry,
// `bf_reprops`, so `t.Funcs(bf.FuncMap())` keeps working unchanged.
//
// The registry is consulted at template EXECUTE time, never at `Funcs()` time.
// That is load-bearing, not incidental: Go initializes a package's variables
// BEFORE its `init()` functions, so an app that builds its template set in a
// package-level var —
//
//	var tmpl = template.Must(template.New("").Funcs(bf.FuncMap()).ParseGlob(...))
//
// — calls `FuncMap()` while the registry is still empty. Merging the
// constructors into `FuncMap()`'s return value would fail that app at parse
// time with `function "bf_new_Badge" not defined`. Looking them up behind one
// fixed entry, at execute time, makes the ordering irrelevant.
package bf

import (
	"fmt"
	"reflect"
	"sync"
)

// RepropsFunc rebuilds a child component's props from a base instance plus a
// flat name/value override list (`"Text", .Label, "N", .N, …`), by re-running
// the component's generated constructor.
//
// Names in `kv` are the Go FIELD names the PARENT computed from the JSX
// attribute (`n=` → `"N"`). A generated implementation maps those onto its own
// constructor Input, which is what makes an aliased destructure
// (`{ n: count }`, whose field is `Count`) land correctly — the mapping lives
// in generated code that knows both sides.
//
// Identity fields (ScopeID / BfParent / BfMount) MUST be carried over from the
// base rather than re-derived: `New<Child>Props` mints a random ScopeID when
// given an empty one, so a naive re-run would give every row its own scope and
// break hydration. Fields that live only on Props and never on Input (Scripts,
// BfIsChild, BfDataKey) must be carried over for the same reason.
type RepropsFunc func(base interface{}, kv ...interface{}) (interface{}, error)

var (
	repropsMu       sync.RWMutex
	repropsRegistry = map[string]RepropsFunc{}
)

// RegisterReprops registers a component's props rebuilder under its component
// name. Called from the generated package's `init()`; re-registering the same
// name replaces the previous entry, so a rebuilt components file in a
// long-lived dev process wins.
func RegisterReprops(name string, fn RepropsFunc) {
	repropsMu.Lock()
	defer repropsMu.Unlock()
	repropsRegistry[name] = fn
}

// Reprops is the `bf_reprops` FuncMap entry: rebuild `base` with the row's
// overrides applied, by re-running the named component's constructor.
//
//	{{template "Badge" (bf_reprops "Badge" $.BadgeSlot0 "Text" .Label "N" .N)}}
//
// An unregistered name is an error rather than a silent passthrough: the
// compiler only emits this call for a component whose rebuilder it also
// emitted, so a missing entry means the generated package was not linked in,
// and falling back to the stale shared instance would reintroduce exactly the
// silently-wrong output this exists to prevent.
func Reprops(name string, base interface{}, kv ...interface{}) (interface{}, error) {
	if len(kv)%2 != 0 {
		return nil, fmt.Errorf("bf_reprops: odd number of key/value arguments (%d) for %q", len(kv), name)
	}
	repropsMu.RLock()
	fn, ok := repropsRegistry[name]
	repropsMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf(
			"bf_reprops: no props rebuilder registered for %q — is the generated components package linked into this binary?",
			name,
		)
	}
	return fn(base, kv...)
}

// RepropsTypeError is the error a generated rebuilder returns when handed a
// value that is not its own props struct. Kept here so the generated code
// stays a fixed shape instead of formatting its own message.
func RepropsTypeError(name string, base interface{}) error {
	return fmt.Errorf("bf_reprops: the %s rebuilder got %T, not its own props struct", name, base)
}

// RepropsAssign writes `val` into `*target`, which a generated rebuilder passes
// as a pointer to one field of its constructor Input (`&in.N`).
//
// This is the one place the rebuild uses reflection, and it does so on purpose:
// it delegates to the SAME `setStructFieldValue` that `bf_with_props` uses, so
// a prop that already assigned correctly under the old helper assigns
// identically under this one. Re-deriving the conversion rules per Go type in
// the generator would be more code and would drift from that behaviour.
//
// `field` names the field for the error message; `component` names the owner.
func RepropsAssign(component, field string, target interface{}, val interface{}) error {
	p := reflect.ValueOf(target)
	if p.Kind() != reflect.Ptr || p.IsNil() {
		return fmt.Errorf("bf_reprops: %s.%s: target must be a non-nil pointer, got %T", component, field, target)
	}
	if err := setStructFieldValue(p.Elem(), val); err != nil {
		return fmt.Errorf("bf_reprops: %s.%s: %w", component, field, err)
	}
	return nil
}

// RepropsRegistered reports whether a rebuilder is registered for `name`.
// For tests and diagnostics.
func RepropsRegistered(name string) bool {
	repropsMu.RLock()
	defer repropsMu.RUnlock()
	_, ok := repropsRegistry[name]
	return ok
}
