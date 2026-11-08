package bf

import (
	"encoding/json"
	"fmt"
	"reflect"
)

// =============================================================================
// JS `undefined` and `null` as two values (spec/js-undefined-value.md, U8)
// =============================================================================
//
// Host nil is JS `null`. JS `undefined` is the singleton Undefined, created
// only at reads: a missing key, an index out of range, an `at` / `find`
// miss, `?.` over a nullish receiver, the `undefined` identifier, an omitted
// prop and an absent Opt. Decoded data is never walked, so a JSON `null`
// stays a Go nil.

// undefinedT is the type of Undefined; nothing else has it.
type undefinedT struct{}

// String prints Undefined as the empty string, which is what a JSX text
// child or an attribute renders for JS `undefined`.
func (*undefinedT) String() string { return "" }

// MarshalJSON writes Undefined as `null`, the spelling `JSON.stringify`
// gives an `undefined` array element. JSON drops an object member holding
// it before it reaches the encoder (see JSON).
func (*undefinedT) MarshalJSON() ([]byte, error) { return []byte("null"), nil }

// Undefined is JS `undefined`. It is a typed nil pointer, so text/template's
// `if` reads it as false and its `eq` / `ne` read it as nil, while Go's own
// `v == nil` does not: test it with IsUndefined / IsNullish.
var Undefined any = (*undefinedT)(nil)

// IsUndefined reports whether v is JS `undefined`.
func IsUndefined(v any) bool { return isUndefined(v) }

// IsNull reports whether v is JS `null`: a host nil (an untyped nil, or a
// typed nil pointer, slice, map, interface, func or channel) that is not
// Undefined.
func IsNull(v any) bool { return isNull(v) }

// IsNullish reports whether v is JS `null` or `undefined` (`v == null`).
func IsNullish(v any) bool { return isNullish(v) }

func isUndefined(v any) bool {
	_, ok := v.(*undefinedT)
	return ok
}

func isNull(v any) bool { return !isUndefined(v) && isNilValue(v) }

func isNullish(v any) bool { return isNilValue(v) }

// optState is the presence of an Opt.
type optState uint8

const (
	optAbsent optState = iota // zero value: the key is not passed
	optUndef                  // passed, value undefined (a forwarded `c={props.c}`)
	optNull
	optSet
)

// Opt is an optional or nullable prop (or loop-row field) of a generated
// Input struct: the four states JS has for a key, absent, present
// `undefined`, `null` and a value. The zero value is absent, so a host that
// leaves the field out passes nothing, as a JS caller omitting the prop.
//
//	in := ChipInput{Label: "x", C: bf.Some("primary")} // a value
//	in := ChipInput{Label: "x", C: bf.Null[string]()}  // null
//	in := ChipInput{Label: "x"}                        // omitted: undefined
//
// encoding/json decodes `{"c":null}` to Null and a missing key to absent, and
// the `omitzero` tag drops an absent or undefined field when it encodes.
type Opt[T any] struct {
	v T
	s optState
}

// Some is the Opt holding v.
func Some[T any](v T) Opt[T] { return Opt[T]{v: v, s: optSet} }

// Null is the Opt holding JS `null`.
func Null[T any]() Opt[T] { return Opt[T]{s: optNull} }

// Undef is the Opt holding a present JS `undefined` (`'k' in props` is true).
func Undef[T any]() Opt[T] { return Opt[T]{s: optUndef} }

// Passed reports whether the key is present: JS `'k' in props`.
func (o Opt[T]) Passed() bool { return o.s != optAbsent }

// IsZero reports whether the value is JS `undefined` (absent or present), so
// an `omitzero` member is dropped as `JSON.stringify` drops it.
func (o Opt[T]) IsZero() bool { return o.s <= optUndef }

// IsUndefined reports whether the value is JS `undefined` (absent or
// present): the case a destructure default applies to.
func (o Opt[T]) IsUndefined() bool { return o.s <= optUndef }

// IsSet reports whether the Opt holds a value (neither `undefined` nor
// `null`).
func (o Opt[T]) IsSet() bool { return o.s == optSet }

// Value is the held value, or T's zero value when the Opt holds none.
func (o Opt[T]) Value() T { return o.v }

// V is the JS value: Undefined, nil (null) or the value. Templates read an
// Opt field through it (`{{.Label.V}}`): text/template reads a struct as
// always true.
func (o Opt[T]) V() any {
	switch o.s {
	case optAbsent, optUndef:
		return Undefined
	case optNull:
		return nil
	}
	return o.v
}

// String prints the JS value as a text sink does (`String`): an Opt read
// without `.V` still renders its value.
func (o Opt[T]) String() string { return String(o.V()) }

// Forward is what a parent passes for `c={expr}`: the key is present even
// when the value is undefined.
func (o Opt[T]) Forward() Opt[T] {
	if o.s == optAbsent {
		o.s = optUndef
	}
	return o
}

// UnmarshalJSON decodes JSON `null` to Null and any other value to Some. A
// key the JSON object does not hold never reaches it, so it stays absent.
func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	if string(b) == "null" {
		*o = Null[T]()
		return nil
	}
	o.s = optSet
	return json.Unmarshal(b, &o.v)
}

// MarshalJSON encodes the value, or `null` when the Opt holds none (an
// `omitzero` member holding `undefined` never reaches it).
func (o Opt[T]) MarshalJSON() ([]byte, error) {
	if o.s != optSet {
		return []byte("null"), nil
	}
	return json.Marshal(o.v)
}

// OptOf is the Opt for a JS value v: Undefined is a present `undefined`, a
// host nil is `null`, and anything else is the value, converted to T when it
// is a number or a value of the same kind under another named type. The
// generated constructors pass a computed child prop through it. It panics
// on a value T cannot hold, which a type-checked component never produces.
func OptOf[T any](v any) Opt[T] {
	if isUndefined(v) {
		return Undef[T]()
	}
	if t, ok := v.(T); ok {
		if isNilValue(v) {
			return Null[T]()
		}
		return Some(t)
	}
	if isNilValue(v) {
		return Null[T]()
	}
	target := reflect.TypeOf((*T)(nil)).Elem()
	rv := reflect.ValueOf(v)
	if convertible(rv, target) {
		return Some(rv.Convert(target).Interface().(T))
	}
	if t, ok := reshape[T](v); ok {
		return Some(t)
	}
	panic(fmt.Sprintf("bf.OptOf: a %T cannot be a %s", v, target))
}

// reshape is v, a slice, map or struct, as a T of another such type with the
// same JS shape (a row type of one component read as another's, or a
// decoded `[]any` as a typed slice), through its JSON form. False for a
// scalar on either side, or a v whose JSON doesn't decode as a T.
func reshape[T any](v any) (T, bool) {
	var out T
	if !isCompositeKind(reflect.TypeOf(v).Kind()) || !isCompositeKind(reflect.TypeOf((*T)(nil)).Elem().Kind()) {
		return out, false
	}
	data, err := json.Marshal(v)
	if err != nil || json.Unmarshal(data, &out) != nil {
		return out, false
	}
	return out, true
}

func isCompositeKind(k reflect.Kind) bool {
	return k == reflect.Slice || k == reflect.Array || k == reflect.Map || k == reflect.Struct || k == reflect.Pointer
}

// convertible reports whether OptOf converts rv to target: between two
// numeric kinds, or between two types of the same kind (a named string type
// and string). Never a number to a string, which reflect would read as a
// code point.
func convertible(rv reflect.Value, target reflect.Type) bool {
	if !rv.Type().ConvertibleTo(target) {
		return false
	}
	return rv.Kind() == target.Kind() || (isNumericKind(rv.Kind()) && isNumericKind(target.Kind()))
}

func isNumericKind(k reflect.Kind) bool {
	switch k {
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
		reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64, reflect.Uintptr,
		reflect.Float32, reflect.Float64:
		return true
	}
	return false
}

// optCarrier is an Opt (of any T) seen through `any`, with its state.
type optCarrier interface{ optParts() (optState, any) }

func (o Opt[T]) optParts() (optState, any) { return o.s, o.v }

// jsAssigner is a *Opt (of any T): Coerce and the reflection setters
// (bf_reprops) assign a JS value into one through it.
type jsAssigner interface{ assignJS(v any) }

func (o *Opt[T]) assignJS(v any) { *o = optFrom[T](v) }

// optFrom is OptOf, except that an Opt source keeps its state: an absent one
// stays absent, as a `{...props}` spread carries no key the caller left out.
func optFrom[T any](v any) Opt[T] {
	c, ok := v.(optCarrier)
	if !ok {
		return OptOf[T](v)
	}
	switch s, val := c.optParts(); s {
	case optAbsent:
		return Opt[T]{}
	case optUndef:
		return Undef[T]()
	case optNull:
		return Null[T]()
	default:
		return OptOf[T](val)
	}
}

// Coerce is v as a value of the type F of zero, which the generated code
// spells as the field it assigns, `ChildInput{}.Label`, so a parent passes a
// child prop without knowing whether the child declares the field as a
// `bf.Opt[T]` or as a plain type:
//
//   - into an Opt: OptOf, except that an Opt v keeps its state (an absent
//     one stays absent);
//   - into a plain type: v itself, its JS value for an Opt v, F's zero value
//     for a nullish v, or v converted as OptOf converts (a slice, map or
//     struct of the same JS shape included, `reshape`).
//
// It panics on a value F cannot hold, which a type-checked component never
// produces.
func Coerce[F any](zero F, v any) F {
	var out F
	if a, ok := any(&out).(jsAssigner); ok {
		a.assignJS(v)
		return out
	}
	v = jsValue(v)
	if t, ok := v.(F); ok {
		return t
	}
	if isNullish(v) {
		return out
	}
	target := reflect.TypeOf((*F)(nil)).Elem()
	if rv := reflect.ValueOf(v); convertible(rv, target) {
		return rv.Convert(target).Interface().(F)
	}
	if t, ok := reshape[F](v); ok {
		return t
	}
	panic(fmt.Sprintf("bf.Coerce: a %T cannot be a %s", v, target))
}

// jsValuer is an Opt (of any T) seen through `any`.
type jsValuer interface{ V() any }

// jsValue unwraps an Opt read off a struct to its JS value; any other value
// is itself.
func jsValue(v any) any {
	if o, ok := v.(jsValuer); ok {
		return o.V()
	}
	return v
}
