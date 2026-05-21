// Package bf provides runtime helper functions for BarefootJS Go templates.
// These functions mirror JavaScript behavior for consistent SSR output.
package bf

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"math"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

// FuncMap returns a template.FuncMap with all BarefootJS helper functions.
// Usage:
//
//	tmpl := template.New("").Funcs(bf.FuncMap())
func FuncMap() template.FuncMap {
	return template.FuncMap{
		// Arithmetic
		"bf_add": Add,
		"bf_sub": Sub,
		"bf_mul": Mul,
		"bf_div": Div,
		"bf_mod": Mod,
		"bf_neg": Neg,

		// String
		"bf_lower":    Lower,
		"bf_upper":    Upper,
		"bf_trim":     Trim,
		"bf_contains": Contains,
		"bf_join":     Join,
		"bf_string":   String,

		// JSON / numeric primitives — JS-compat callees registered on
		// the Go adapter's `templatePrimitives` map (#1188).
		"bf_json":   JSON,
		"bf_number": Number,
		"bf_floor":  Floor,
		"bf_ceil":   Ceil,
		"bf_round":  Round,

		// Array/Slice
		"bf_len":            Len,
		"bf_at":             At,
		"bf_includes":       Includes,
		"bf_index_of":       IndexOf,
		"bf_last_index_of":  LastIndexOf,
		"bf_first":          First,
		"bf_last":           Last,
		"bf_arr":            Arr,
		"bf_filter_truthy":  FilterTruthy,

		// Higher-order Array Methods
		"bf_every":      Every,
		"bf_some":       Some,
		"bf_filter":     Filter,
		"bf_find":       Find,
		"bf_find_index": FindIndex,
		"bf_sort":       Sort,

		// Comment marker (for hydration)
		"bfComment":    Comment,
		"bfTextStart":  TextStart,
		"bfTextEnd":    TextEnd,

		// Script collection
		"bfScripts": BfScripts,

		// Scope attribute value (#1249: bare scope id, no `~` prefix)
		"bfScopeAttr": ScopeAttr,

		// Slot-identity markers (#1249): bf-h, bf-m, bf-r
		"bfHydrationAttrs": HydrationAttrs,

		// Child component marker (kept for backward compatibility)
		"bfIsChild": IsChild,

		// Props attribute for hydration
		"bfPropsAttr": BfPropsAttr,

		// Portal HTML rendering (parses and executes template string)
		"bfPortalHTML": PortalHTML,

		// Scope comment for fragment roots
		"bfScopeComment": ScopeComment,

		// JSX intrinsic-element spread lowering (#1407)
		"bf_spread_attrs": SpreadAttrs,
	}
}

// ScopeAttr returns the bare bf-s scope id (#1249).
func ScopeAttr(props interface{}) string {
	return getStringField(props, "ScopeID")
}

// HydrationAttrs emits `bf-h="<host>" bf-m="<slot>" bf-r=""` conditionally.
// See spec/compiler.md "Slot identity".
func HydrationAttrs(props interface{}) template.HTMLAttr {
	parts := []string{}
	if host := getStringField(props, "BfParent"); host != "" {
		parts = append(parts, fmt.Sprintf(`bf-h="%s"`, template.HTMLEscapeString(host)))
	}
	if mount := getStringField(props, "BfMount"); mount != "" {
		parts = append(parts, fmt.Sprintf(`bf-m="%s"`, template.HTMLEscapeString(mount)))
	}
	if !getBoolField(props, "BfIsChild") {
		parts = append(parts, `bf-r=""`)
	}
	if len(parts) == 0 {
		return ""
	}
	return template.HTMLAttr(strings.Join(parts, " "))
}

// IsChild is a deprecated no-op stub. Child status is signalled by bf-h
// presence (#1249); use HydrationAttrs instead.
func IsChild(props interface{}) template.HTMLAttr {
	return ""
}

// svgCamelCaseAttrs mirrors SVG_CAMEL_CASE_ATTRS from
// packages/client/src/runtime/spread-attrs.ts. SVG XML attribute
// names are case-sensitive; the default camelCase → kebab-case
// rewrite must NOT apply to these or the SVG stops rendering
// (#1407). Coordinates with the compile-time SVG_CAMEL_TO_KEBAB
// table in packages/jsx/src/ir-to-client-js/utils.ts: presentation
// attrs (clipPath, strokeWidth, …) live there and must NOT appear
// here, or the same JSX prop would lower to clip-path via the
// explicit-attr path and stay clipPath via the spread path.
var svgCamelCaseAttrs = map[string]struct{}{
	"allowReorder": {}, "attributeName": {}, "attributeType": {}, "autoReverse": {},
	"baseFrequency": {}, "baseProfile": {}, "calcMode": {}, "clipPathUnits": {},
	"contentScriptType": {}, "contentStyleType": {}, "diffuseConstant": {}, "edgeMode": {},
	"externalResourcesRequired": {}, "filterRes": {}, "filterUnits": {}, "glyphRef": {},
	"gradientTransform": {}, "gradientUnits": {}, "kernelMatrix": {}, "kernelUnitLength": {},
	"keyPoints": {}, "keySplines": {}, "keyTimes": {}, "lengthAdjust": {}, "limitingConeAngle": {},
	"markerHeight": {}, "markerUnits": {}, "markerWidth": {}, "maskContentUnits": {},
	"maskUnits": {}, "numOctaves": {}, "pathLength": {}, "patternContentUnits": {},
	"patternTransform": {}, "patternUnits": {}, "pointsAtX": {}, "pointsAtY": {}, "pointsAtZ": {},
	"preserveAlpha": {}, "preserveAspectRatio": {}, "primitiveUnits": {}, "refX": {}, "refY": {},
	"repeatCount": {}, "repeatDur": {}, "requiredExtensions": {}, "requiredFeatures": {},
	"specularConstant": {}, "specularExponent": {}, "spreadMethod": {}, "startOffset": {},
	"stdDeviation": {}, "stitchTiles": {}, "surfaceScale": {}, "systemLanguage": {},
	"tableValues": {}, "targetX": {}, "targetY": {}, "textLength": {}, "viewBox": {}, "viewTarget": {},
	"xChannelSelector": {}, "yChannelSelector": {}, "zoomAndPan": {},
}

// toAttrName mirrors the JSX→HTML attribute-name rewrite from
// packages/client/src/runtime/spread-attrs.ts. className → class,
// htmlFor → for, SVG camelCase attrs preserved, other camelCase
// keys lowered to kebab-case.
func toAttrName(key string) string {
	if key == "className" {
		return "class"
	}
	if key == "htmlFor" {
		return "for"
	}
	if _, ok := svgCamelCaseAttrs[key]; ok {
		return key
	}
	// camelCase → kebab-case: mirror the JS reference exactly
	// (`key.replace(/([A-Z])/g, '-$1').toLowerCase()`). The JS shape
	// produces a leading `-` for an initial uppercase letter
	// (`XData` → `-x-data`); both this Go path and the matching JS
	// runtime are wrong-by-construction for that case (the resulting
	// HTML attribute name is invalid), but keeping them byte-equal
	// avoids silent SSR/CSR divergence (#1411 review).
	var b strings.Builder
	for _, r := range key {
		if r >= 'A' && r <= 'Z' {
			b.WriteByte('-')
			b.WriteRune(r + 32)
		} else {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// StyleToCss mirrors styleToCss from
// packages/client/src/runtime/style.ts. Accepts a string passthrough,
// or a map (JSON-deserialized object) whose camelCase keys are
// lowered to kebab-case and joined with `;`. Returns ("", false) for
// nullish/empty input so callers can omit the attribute entirely.
func StyleToCss(v any) (string, bool) {
	if v == nil {
		return "", false
	}
	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Interface || rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return "", false
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Map {
		// Non-object: stringify and return as-is, matching the JS
		// `typeof value !== 'object'` branch.
		s := fmt.Sprint(v)
		if s == "" {
			return "", false
		}
		return s, true
	}
	keys := rv.MapKeys()
	sorted := make([]string, 0, len(keys))
	for _, k := range keys {
		if k.Kind() == reflect.String {
			sorted = append(sorted, k.String())
		}
	}
	sort.Strings(sorted)
	parts := make([]string, 0, len(sorted))
	for _, k := range sorted {
		val := rv.MapIndex(reflect.ValueOf(k))
		// Skip nil entries (matches the JS `if (v == null) continue`).
		if !val.IsValid() {
			continue
		}
		if val.Kind() == reflect.Interface || val.Kind() == reflect.Pointer {
			if val.IsNil() {
				continue
			}
			val = val.Elem()
		}
		prop := toAttrName(k)
		parts = append(parts, fmt.Sprintf("%s:%v", prop, val.Interface()))
	}
	if len(parts) == 0 {
		return "", false
	}
	return strings.Join(parts, ";"), true
}

// SpreadAttrs lowers a JSX intrinsic-element spread bag (#1407) to
// an HTML attribute string. Mirrors spreadAttrs from
// packages/client/src/runtime/spread-attrs.ts so SSR output matches
// what CSR's `applyRestAttrs` writes at hydration.
//
// Skip rules: nil/false values, event handlers (`on[A-Z]*`),
// `children`, `ref`.
//
// Key remap: className → class, htmlFor → for, SVG camelCase
// preserved, other camelCase → kebab-case.
//
// `style` is routed through StyleToCss so object literals serialize
// to a real CSS string instead of Go's default `map[k:v]` form.
//
// Booleans: true → bare attribute name, false → omitted.
// Other scalar values are HTML-escaped via template.HTMLEscapeString.
// Returns a `template.HTMLAttr` so html/template emits the result
// verbatim (the function does its own escaping).
//
// Keys are sorted alphabetically before emission for deterministic
// output. SSR/CSR attribute-order divergence is acceptable per the
// rest-destructure-object-spread-in-map fixture's documented policy
// — browsers honor the LAST value when a key is duplicated, so
// pairing with static attrs (`<div class="x" {...rest}>`) is
// last-wins regardless of order.
func SpreadAttrs(bag any) template.HTMLAttr {
	if bag == nil {
		return ""
	}
	rv := reflect.ValueOf(bag)
	for rv.Kind() == reflect.Interface || rv.Kind() == reflect.Pointer {
		if rv.IsNil() {
			return ""
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Map {
		return ""
	}
	keys := rv.MapKeys()
	sortedKeys := make([]string, 0, len(keys))
	for _, k := range keys {
		if k.Kind() == reflect.String {
			sortedKeys = append(sortedKeys, k.String())
		}
	}
	sort.Strings(sortedKeys)
	parts := make([]string, 0, len(sortedKeys))
	for _, key := range sortedKeys {
		// Event handlers — skip at SSR the same way
		// packages/client/src/runtime/spread-attrs.ts does at
		// hydration. The JS predicate is
		// `key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()`,
		// which is true for any character whose uppercase form is
		// itself: ASCII A-Z, digits, underscore, and non-letter
		// symbols. Mirror that here by skipping when key[2] is NOT
		// a lowercase ASCII letter — so `onClick`, `on_custom`, and
		// `on0` all match (#1411 review).
		if len(key) > 2 && key[0] == 'o' && key[1] == 'n' && !(key[2] >= 'a' && key[2] <= 'z') {
			continue
		}
		// `children` is a JSX construct rendered inside the element,
		// never a DOM attribute. `ref` is intentionally NOT filtered
		// here so output stays byte-equal with the JS reference
		// `spreadAttrs` in packages/client/src/runtime/spread-attrs.ts
		// (which only filters null/false, event handlers, and
		// children) — aligning Go's filter set diverges from JS in
		// the opposite direction. Filtering `ref` consistently across
		// both SSR runtimes is a separate concern tracked alongside
		// the JS `applyRestAttrs` vs `spreadAttrs` mismatch (#1411
		// review).
		if key == "children" {
			continue
		}
		val := rv.MapIndex(reflect.ValueOf(key))
		if !val.IsValid() {
			continue
		}
		// Unwrap interface wrappers (json.Unmarshal produces
		// interface{}-wrapped values for map[string]any).
		v := val
		for v.Kind() == reflect.Interface || v.Kind() == reflect.Pointer {
			if v.IsNil() {
				// Skip null entries.
				v = reflect.Value{}
				break
			}
			v = v.Elem()
		}
		if !v.IsValid() {
			continue
		}
		// Boolean values: true → bare attribute, false → omitted.
		if v.Kind() == reflect.Bool {
			if !v.Bool() {
				continue
			}
			parts = append(parts, toAttrName(key))
			continue
		}
		// `style` routes through StyleToCss so object literals get a
		// real CSS string. The JS side does the same.
		if key == "style" {
			css, ok := StyleToCss(v.Interface())
			if !ok {
				continue
			}
			parts = append(parts, fmt.Sprintf(`style="%s"`, template.HTMLEscapeString(css)))
			continue
		}
		// Stringify and escape. fmt.Sprint handles numbers, bools-as-
		// strings, and arbitrary stringer types the same way the JS
		// `String(value)` coercion does for the analogous cases.
		s := fmt.Sprint(v.Interface())
		parts = append(parts, fmt.Sprintf(`%s="%s"`, toAttrName(key), template.HTMLEscapeString(s)))
	}
	if len(parts) == 0 {
		return ""
	}
	return template.HTMLAttr(strings.Join(parts, " "))
}

// BfPropsAttr returns the bf-p attribute with the JSON-serialized
// props in flat format. Output format: `bf-p='{"propName":value,...}'`.
// Only emits the attribute for root components (BfIsRoot == true);
// child components receive props from their parent via initChild().
//
// Returns the marshal error so a `template.Execute` call fails
// loudly on cycles / unsupported props rather than silently
// dropping the bf-p attribute and breaking client-side hydration.
// Same loud-failure policy as `JSON` — user data going through
// `encoding/json` shouldn't fail invisibly.
func BfPropsAttr(props interface{}) (template.HTMLAttr, error) {
	// Only root components should emit bf-p
	if !getBoolField(props, "BfIsRoot") {
		return "", nil
	}

	propsJSON, err := json.Marshal(props)
	if err != nil {
		return "", err
	}

	escaped := template.HTMLEscapeString(string(propsJSON))
	return template.HTMLAttr(`bf-p="` + escaped + `"`), nil
}

// =============================================================================
// Arithmetic Operations
// =============================================================================

// Add returns a + b. Supports int and float64.
func Add(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	result := av + bv
	// Return int if both inputs were int-like
	if isIntLike(a) && isIntLike(b) && result == float64(int(result)) {
		return int(result)
	}
	return result
}

// Sub returns a - b. Supports int and float64.
func Sub(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	result := av - bv
	if isIntLike(a) && isIntLike(b) && result == float64(int(result)) {
		return int(result)
	}
	return result
}

// Mul returns a * b. Supports int and float64.
func Mul(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	result := av * bv
	if isIntLike(a) && isIntLike(b) && result == float64(int(result)) {
		return int(result)
	}
	return result
}

// Div returns a / b. Returns float64 to match JavaScript behavior.
// Returns 0 if b is 0 (instead of panicking).
func Div(a, b any) any {
	av, bv := toFloat64(a), toFloat64(b)
	if bv == 0 {
		return 0
	}
	return av / bv
}

// Mod returns a % b (modulo). Supports int only.
func Mod(a, b any) int {
	av, bv := toInt(a), toInt(b)
	if bv == 0 {
		return 0
	}
	return av % bv
}

// Neg returns -a (negation).
func Neg(a any) any {
	if v, ok := a.(int); ok {
		return -v
	}
	return -toFloat64(a)
}

// =============================================================================
// String Operations
// =============================================================================

// Lower returns the lowercase version of s.
func Lower(s string) string {
	return strings.ToLower(s)
}

// Upper returns the uppercase version of s.
func Upper(s string) string {
	return strings.ToUpper(s)
}

// Trim returns s with leading and trailing whitespace removed.
func Trim(s string) string {
	return strings.TrimSpace(s)
}

// Contains returns true if s contains substr.
func Contains(s, substr string) bool {
	return strings.Contains(s, substr)
}

// Join concatenates elements of a slice with sep. Accepts both
// reflect.Slice (the common case — `bf_arr` and `bf_filter_truthy`
// both return `[]any`) AND reflect.Array (fixed-size Go arrays like
// `[3]string{...}`), mirroring JS `Array.prototype.join` which
// doesn't distinguish between the two. Pre-fix this returned "" for
// fixed-size arrays passed through template data (Copilot review on
// #1445).
func Join(items any, sep string) string {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return ""
	}

	parts := make([]string, v.Len())
	for i := 0; i < v.Len(); i++ {
		parts[i] = toString(v.Index(i).Interface())
	}
	return strings.Join(parts, sep)
}

// String returns the string form of v. Mirrors JS `String(v)` for
// non-nil values via `fmt.Sprintf("%v", ...)`. Diverges from JS on
// nil: JS `String(null)` is "null", but the template path renders
// `nil` as the empty string here so an unset prop doesn't surface
// as a literal "null"/"undefined" in user-facing HTML. Document the
// divergence explicitly so callers don't rely on JS-exact parity.
func String(v any) string {
	if v == nil {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

// JSON returns the JSON encoding of v as a string. Mirrors
// JS `JSON.stringify(v)` for the V1 single-arg shape (no `replacer`
// or `space`). Object key order is determined by Go's `encoding/json`
// (alphabetical for maps, declaration order for structs) — the
// #1187 contract requires value-compat, not order-compat.
//
// Top-level NaN / ±Inf are pre-handled to match JS — JS's
// `JSON.stringify(NaN)` and `JSON.stringify(Infinity)` both produce
// `"null"`, but Go's `encoding/json` rejects them with
// `UnsupportedValueError`. Without this carve-out the common
// composition `JSON.stringify(Number("garbage"))` would error
// instead of emitting `"null"` like JS does. Nested NaN/Inf inside
// a struct/map still surfaces an error — covering that needs a
// custom marshaller; out of V1 scope.
//
// Returns the marshal error so a `template.Execute` call fails
// loudly on cycles / unsupported values rather than silently
// producing `""` and reintroducing the SSR data-loss class
// #1187 was filed against. Go's text/template treats a non-nil
// error return from a func as an execution failure.
func JSON(v any) (string, error) {
	if f, ok := v.(float64); ok && (math.IsNaN(f) || math.IsInf(f, 0)) {
		return "null", nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Number coerces v to a float64. Mirrors JS `Number(v)` semantics:
// numeric / boolean inputs convert as expected; non-numeric strings
// and other unsupported shapes return `NaN` (matching JS rather
// than silently substituting 0, which would mis-shape downstream
// arithmetic and template-side comparisons). Templates that need
// a deterministic fallback should compose with the user-side
// default (e.g. `Number(props.x ?? 0)` in JSX).
func Number(v any) float64 {
	if v == nil {
		return math.NaN()
	}
	switch x := v.(type) {
	case float64:
		return x
	case float32:
		return float64(x)
	case int:
		return float64(x)
	case int32:
		return float64(x)
	case int64:
		return float64(x)
	case bool:
		if x {
			return 1
		}
		return 0
	case string:
		f, err := strconv.ParseFloat(x, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	}
	return math.NaN()
}

// Floor returns the largest integer ≤ v as a float64. Mirrors JS
// `Math.floor`. The return type stays float64 so chained primitives
// (`bf_floor` then `bf_string`) line up with JS's number type.
func Floor(v any) float64 {
	return math.Floor(Number(v))
}

// Ceil returns the smallest integer ≥ v as a float64. Mirrors JS
// `Math.ceil`.
func Ceil(v any) float64 {
	return math.Ceil(Number(v))
}

// Round returns v rounded to the nearest integer as a float64.
// Mirrors JS `Math.round` — half-away-from-zero (Go's `math.Round`
// matches; JS rounds half toward +Infinity which differs at .5
// negatives; we accept that minor divergence since the conformance
// contract is value-compat for the common positive case).
func Round(v any) float64 {
	return math.Round(Number(v))
}

// =============================================================================
// Array/Slice Operations
// =============================================================================

// Len returns the length of a slice, array, map, string, or channel.
// Returns 0 for nil or unsupported types.
func Len(v any) int {
	if v == nil {
		return 0
	}
	rv := reflect.ValueOf(v)
	switch rv.Kind() {
	case reflect.Slice, reflect.Array, reflect.Map, reflect.String, reflect.Chan:
		return rv.Len()
	default:
		return 0
	}
}

// At returns the element at index i from a slice.
// Supports negative indices (e.g., -1 for last element).
// Returns nil if index is out of bounds.
func At(items any, index int) any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	length := v.Len()
	if length == 0 {
		return nil
	}

	// Handle negative indices
	if index < 0 {
		index = length + index
	}

	if index < 0 || index >= length {
		return nil
	}

	return v.Index(index).Interface()
}

// Includes returns true if items contains elem. Lowers both
// `Array.prototype.includes` and `String.prototype.includes` —
// the adapter can't disambiguate the receiver at compile time,
// so this helper dispatches at runtime on `reflect.Kind()`:
//
//   - slice/array receiver:  DeepEqual element search
//   - string receiver:       strings.Contains substring search
//
// Anything else returns false (matches the JS semantic where
// `.includes` is only defined on Array / TypedArray / String).
func Includes(recv any, elem any) bool {
	v := reflect.ValueOf(recv)
	if v.Kind() == reflect.String {
		// JS `String.prototype.includes` accepts only string args;
		// non-string `elem` would TypeError in real JS but our
		// callers have lowered through `convertExpressionToGo`
		// where the arg type is whatever the template binds. Stringify
		// via fmt to keep the helper total.
		needle, ok := elem.(string)
		if !ok {
			needle = fmt.Sprintf("%v", elem)
		}
		return strings.Contains(v.String(), needle)
	}
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}
	for i := 0; i < v.Len(); i++ {
		if reflect.DeepEqual(v.Index(i).Interface(), elem) {
			return true
		}
	}
	return false
}

// IndexOf returns the 0-based position of the first item that
// DeepEquals `elem`, or -1 if not found. Lowers
// `Array.prototype.indexOf(x)` (#1448 Tier A). The existing
// `FindIndex` helper does struct-field equality (used by the
// higher-order `.find` lowering); this one does value equality
// against scalar / struct items so callers don't have to compose
// a synthetic predicate.
//
// Non-array / non-slice receivers return -1 (matches the JS
// semantic that `.indexOf` is only defined on Array / TypedArray).
func IndexOf(items any, elem any) int {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return -1
	}
	for i := 0; i < v.Len(); i++ {
		if reflect.DeepEqual(v.Index(i).Interface(), elem) {
			return i
		}
	}
	return -1
}

// LastIndexOf returns the 0-based position of the last item that
// DeepEquals `elem`, or -1 if not found. Mirrors
// `Array.prototype.lastIndexOf(x)`. The reverse traversal is the
// only behavioural difference vs `IndexOf` — disambiguating a
// duplicated value's first vs last position is the canonical
// reason a JS author reaches for `lastIndexOf`.
func LastIndexOf(items any, elem any) int {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return -1
	}
	for i := v.Len() - 1; i >= 0; i-- {
		if reflect.DeepEqual(v.Index(i).Interface(), elem) {
			return i
		}
	}
	return -1
}

// First returns the first element of a slice, or nil if empty.
func First(items any) any {
	return At(items, 0)
}

// Last returns the last element of a slice, or nil if empty.
func Last(items any) any {
	return At(items, -1)
}

// Arr builds an []any from variadic args. Used to lower JS array
// literals like `[a, b]` for the registry Slot's
// `[className, childClass].filter(Boolean).join(' ')` shape (#1443) —
// Go templates have no array-literal syntax, so the codegen routes
// array-literal IR nodes through this helper.
func Arr(items ...any) []any {
	return items
}

// FilterTruthy returns a new slice containing only truthy items.
// Mirrors `arr.filter(Boolean)` semantics: drop nil, false, 0, "" — the
// same falsy set JavaScript's `Boolean(x)` recognises. Used to lower
// the registry Slot's class-merge pattern (#1443); generalising to
// arbitrary callable predicates would need the callee-resolution path
// blocked by #1389, so this stays Boolean-specific.
func FilterTruthy(items any) []any {
	v := reflect.ValueOf(items)
	if !v.IsValid() || (v.Kind() != reflect.Slice && v.Kind() != reflect.Array) {
		return nil
	}
	result := make([]any, 0, v.Len())
	for i := 0; i < v.Len(); i++ {
		raw := v.Index(i).Interface()
		if isTruthy(raw) {
			result = append(result, raw)
		}
	}
	return result
}

// isTruthy mirrors JavaScript's `Boolean(x)` for the value shapes the
// template path actually receives — nil / false / 0 / "" are falsy.
// Other shapes (non-empty maps, slices, structs, true) are truthy, in
// line with JS's "objects are truthy" rule.
func isTruthy(v any) bool {
	if v == nil {
		return false
	}
	switch x := v.(type) {
	case bool:
		return x
	case string:
		return x != ""
	case int:
		return x != 0
	case int8, int16, int32, int64:
		return reflect.ValueOf(v).Int() != 0
	case uint, uint8, uint16, uint32, uint64:
		return reflect.ValueOf(v).Uint() != 0
	case float32:
		// JS `Boolean(NaN)` is false regardless of float width — the
		// float64 arm below was the only one checking IsNaN, which
		// diverged from JS for `float32` NaN inputs (Copilot review on
		// #1445). Widening to float64 for the IsNaN check keeps the
		// two branches in lock-step.
		return x != 0 && !math.IsNaN(float64(x))
	case float64:
		return x != 0 && !math.IsNaN(x)
	}
	return true
}

// =============================================================================
// Higher-order Array Methods
// =============================================================================

// Every returns true if all items have the specified field set to true.
// Mirrors JavaScript's Array.prototype.every(item => item.field).
func Every(items any, field string) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			return false
		}
		if fieldVal.Kind() == reflect.Bool && !fieldVal.Bool() {
			return false
		}
	}
	return true
}

// Some returns true if at least one item has the specified field set to true.
// Mirrors JavaScript's Array.prototype.some(item => item.field).
func Some(items any, field string) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if fieldVal.IsValid() && fieldVal.Kind() == reflect.Bool && fieldVal.Bool() {
			return true
		}
	}
	return false
}

// Filter returns items where item.field == value.
// Mirrors JavaScript's Array.prototype.filter(item => item.field === value).
// Returns []any to allow chaining with other bf_* functions.
func Filter(items any, field string, value any) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	capitalizedField := capitalize(field)
	var result []any

	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			continue
		}

		// Compare field value with target value
		if reflect.DeepEqual(fieldVal.Interface(), value) {
			result = append(result, v.Index(i).Interface())
		}
	}
	return result
}

// Find returns the first item where item.field == value, or nil if not found.
// Mirrors JavaScript's Array.prototype.find(item => item.field === value).
func Find(items any, field string, value any) any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			continue
		}

		if reflect.DeepEqual(fieldVal.Interface(), value) {
			return v.Index(i).Interface()
		}
	}
	return nil
}

// FindIndex returns the index of the first item where item.field == value, or -1.
// Mirrors JavaScript's Array.prototype.findIndex(item => item.field === value).
func FindIndex(items any, field string, value any) int {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return -1
	}

	capitalizedField := capitalize(field)
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Interface {
			item = item.Elem()
		}
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() != reflect.Struct {
			continue
		}

		fieldVal := item.FieldByName(capitalizedField)
		if !fieldVal.IsValid() {
			continue
		}

		if reflect.DeepEqual(fieldVal.Interface(), value) {
			return i
		}
	}
	return -1
}

// Sort returns a new slice sorted by the specified field in the given direction.
// Direction must be "asc" or "desc". Uses stable sort to preserve relative order
// of equal elements.
// Mirrors JavaScript's Array.prototype.toSorted((a, b) => a.field - b.field).
func Sort(items any, field string, direction string) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	length := v.Len()
	if length == 0 {
		return []any{}
	}

	// Copy items into a new slice (non-mutating, like toSorted)
	result := make([]any, length)
	for i := 0; i < length; i++ {
		result[i] = v.Index(i).Interface()
	}

	capitalizedField := capitalize(field)

	sort.SliceStable(result, func(i, j int) bool {
		vi := getFieldValue(result[i], capitalizedField)
		vj := getFieldValue(result[j], capitalizedField)

		if direction == "desc" {
			return toFloat64(vi) > toFloat64(vj)
		}
		return toFloat64(vi) < toFloat64(vj)
	})

	return result
}

// getFieldValue extracts a struct field value using reflection.
func getFieldValue(item any, field string) any {
	v := reflect.ValueOf(item)
	if v.Kind() == reflect.Interface {
		v = v.Elem()
	}
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return nil
	}

	fieldVal := v.FieldByName(field)
	if !fieldVal.IsValid() {
		return nil
	}
	return fieldVal.Interface()
}

// capitalize uppercases the first character of a string.
func capitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// =============================================================================
// HTML/Template Helpers
// =============================================================================

// Comment returns an HTML comment string for hydration markers.
// The "bf-" prefix is automatically added.
func Comment(content string) template.HTML {
	return template.HTML("<!--bf-" + content + "-->")
}

// TextStart returns an HTML comment start marker for reactive text expressions.
// Format: <!--bf:slotId-->
func TextStart(slotId string) template.HTML {
	return template.HTML("<!--bf:" + slotId + "-->")
}

// TextEnd returns an HTML comment end marker for reactive text expressions.
// Format: <!--/-->
func TextEnd() template.HTML {
	return "<!--/-->"
}

// ScopeComment emits a fragment-rooted scope marker. See spec/compiler.md
// "Slot identity" for the wire format. Loud-fails on marshal errors
// (same policy as JSON / BfPropsAttr).
func ScopeComment(props interface{}) (template.HTML, error) {
	scopeID := getStringField(props, "ScopeID")
	hostSegment := ""
	if host := getStringField(props, "BfParent"); host != "" {
		mount := getStringField(props, "BfMount")
		hostSegment = "|h=" + host + "|m=" + mount
	}
	propsJSON := ""
	if getBoolField(props, "BfIsRoot") {
		pJSON, err := json.Marshal(props)
		if err != nil {
			return "", err
		}
		propsJSON = "|" + string(pJSON)
	}
	return template.HTML("<!--bf-scope:" + scopeID + hostSegment + propsJSON + "-->"), nil
}

// PortalHTML parses and executes a template string with the provided data.
// Used for rendering dynamic portal content where the template string
// contains Go template expressions (e.g., {{if .Open}}open{{end}}).
//
// The template string is parsed fresh each time to support dynamic content.
// Standard Go template functions (if, range, eq, etc.) are available.
func PortalHTML(data interface{}, tmplStr string) template.HTML {
	// Create a new template with the FuncMap for custom functions
	t, err := template.New("portal").Funcs(FuncMap()).Parse(tmplStr)
	if err != nil {
		// Return error message as HTML comment for debugging
		return template.HTML("<!-- bfPortalHTML error: " + err.Error() + " -->")
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return template.HTML("<!-- bfPortalHTML exec error: " + err.Error() + " -->")
	}

	return template.HTML(buf.String())
}

// =============================================================================
// Portal Collection
// =============================================================================

// PortalContent represents a single portal's content to be rendered at body end.
type PortalContent struct {
	ID      string        // Unique portal ID for hydration matching
	OwnerID string        // Owner scope ID for find() support
	Content template.HTML // Portal HTML content
}

// PortalCollector collects portal content during template rendering.
// Portal content is rendered at </body> to avoid z-index issues.
type PortalCollector struct {
	portals []PortalContent
	counter int
}

// NewPortalCollector creates a new PortalCollector.
func NewPortalCollector() *PortalCollector {
	return &PortalCollector{
		portals: []PortalContent{},
		counter: 0,
	}
}

// Add registers portal content to be rendered at body end.
func (pc *PortalCollector) Add(ownerID string, content template.HTML) string {
	pc.counter++
	id := "bf-portal-" + strconv.Itoa(pc.counter)
	pc.portals = append(pc.portals, PortalContent{
		ID:      id,
		OwnerID: ownerID,
		Content: content,
	})
	return "" // Return empty string for template use
}

// Render outputs all collected portals as HTML.
// Each portal is wrapped in a div with bf-pi (portal ID) and bf-po (portal owner).
func (pc *PortalCollector) Render() template.HTML {
	if pc == nil || len(pc.portals) == 0 {
		return ""
	}
	var buf strings.Builder
	for _, p := range pc.portals {
		buf.WriteString(`<div bf-pi="`)
		buf.WriteString(p.ID)
		buf.WriteString(`" bf-po="`)
		buf.WriteString(p.OwnerID)
		buf.WriteString(`">`)
		buf.WriteString(string(p.Content))
		buf.WriteString("</div>\n")
	}
	return template.HTML(buf.String())
}

// =============================================================================
// Script Collection
// =============================================================================

// ScriptCollector collects client scripts with deduplication.
// It preserves insertion order for deterministic output.
type ScriptCollector struct {
	scripts map[string]bool
	order   []string
}

// NewScriptCollector creates a new ScriptCollector.
func NewScriptCollector() *ScriptCollector {
	return &ScriptCollector{
		scripts: make(map[string]bool),
		order:   []string{},
	}
}

// Register adds a script source to the collection.
// Duplicate scripts are ignored (only first registration counts).
func (sc *ScriptCollector) Register(src string) string {
	if sc.scripts[src] {
		return "" // Already registered
	}
	sc.scripts[src] = true
	sc.order = append(sc.order, src)
	return "" // Return empty string for template use
}

// Scripts returns all registered scripts in insertion order.
func (sc *ScriptCollector) Scripts() []string {
	return sc.order
}

// BfScripts generates script tags for all registered scripts.
// Returns HTML safe for embedding in templates.
func BfScripts(collector *ScriptCollector) template.HTML {
	if collector == nil {
		return ""
	}
	var result strings.Builder
	for _, src := range collector.Scripts() {
		result.WriteString(`<script type="module" src="`)
		result.WriteString(src)
		result.WriteString(`"></script>`)
		result.WriteString("\n")
	}
	return template.HTML(result.String())
}

// =============================================================================
// Component Renderer
// =============================================================================

// RenderContext contains all data needed to render a component page.
// The layout function receives this context to build the final HTML.
type RenderContext struct {
	// ComponentName is the template name being rendered
	ComponentName string

	// Props is the component props (for layout to access if needed)
	Props interface{}

	// ComponentHTML is the rendered component template output
	ComponentHTML template.HTML

	// Portals contains collected portal content to render at body end
	Portals template.HTML

	// Scripts contains the collected JS script tags
	Scripts template.HTML

	// Title is the page title (defaults to "{ComponentName} - BarefootJS")
	Title string

	// Heading is the page heading. Empty string means no heading.
	Heading string

	// Extra holds additional user-defined data for the layout
	Extra map[string]interface{}
}

// LayoutFunc renders the final HTML page given the render context.
type LayoutFunc func(ctx *RenderContext) string

// Renderer renders BarefootJS components with a customizable layout.
type Renderer struct {
	templates *template.Template
	layout    LayoutFunc
}

// NewRenderer creates a Renderer with the given templates and layout function.
//
// Example usage:
//
//	renderer := bf.NewRenderer(templates, func(ctx *bf.RenderContext) string {
//	    return fmt.Sprintf(`<!DOCTYPE html>
//	<html>
//	<head><title>%s</title></head>
//	<body>%s%s</body>
//	</html>`, ctx.Title, ctx.ComponentHTML, ctx.Scripts)
//	})
func NewRenderer(tmpl *template.Template, layout LayoutFunc) *Renderer {
	return &Renderer{
		templates: tmpl,
		layout:    layout,
	}
}

// RenderOptions configures a single render call.
type RenderOptions struct {
	// ComponentName is the template name to render (required)
	ComponentName string

	// Props is the component props (must be a pointer to struct with Scripts field)
	Props interface{}

	// Title is the page title. If empty, defaults to "{ComponentName} - BarefootJS"
	Title string

	// Heading is the page heading. If empty, no heading is shown.
	Heading string

	// Extra holds additional data to pass to the layout
	Extra map[string]interface{}
}

// Render renders a component to a full HTML page using the configured layout.
// Child component props are automatically detected (any slice field with ScopeID/Scripts).
// renderTemplateErrorPanel formats a Go template execution error into a
// fragment of HTML that's visible in the browser. The panel is
// HTML-escaped so a faulty template name (anything from `template:
// "..."`) can't smuggle markup back into the page. Keep the styling
// inline so the panel surfaces even when the project's CSS hasn't
// loaded yet (e.g. the failure aborted before the stylesheet links
// emitted).
//
// Surfaced for the #1442 echo repro: a template referencing
// `.Todo.Done` (instead of the range dot's `.Done`) used to fail
// silently — Go's html/template aborted mid-stream, the partial body
// flushed as a 200, and the user saw a truncated list with no console
// signal. With this panel they get the template name, the error
// message, and a "what to look at" hint inline.
func renderTemplateErrorPanel(componentName string, err error) string {
	return `<div style="margin:1em 0;padding:1em;border:2px solid #d33;background:#fff5f5;color:#900;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;line-height:1.5"><strong style="display:block;margin-bottom:.5em">Template error in <code>` +
		template.HTMLEscapeString(componentName) +
		`</code></strong><pre style="margin:0;white-space:pre-wrap;word-break:break-word">` +
		template.HTMLEscapeString(err.Error()) +
		`</pre><div style="margin-top:.75em;font-size:12px;opacity:.7">Common cause: a JSX expression referenced a name the adapter could not resolve to a struct field. Open the matching <code>dist/templates/*.tmpl</code> for the unresolved reference, then fix the source component.</div></div>`
}

func (r *Renderer) Render(opts RenderOptions) string {
	// Create script collector and inject into props
	scriptCollector := NewScriptCollector()
	setScriptsField(opts.Props, scriptCollector)

	// Create portal collector and inject into props
	portalCollector := NewPortalCollector()
	setPortalsField(opts.Props, portalCollector)

	// Auto-detect and process child component props (slices)
	childSlices := findChildComponentSlices(opts.Props)
	for _, slice := range childSlices {
		setScriptsOnSlice(slice, scriptCollector)
		setPortalsOnSlice(slice, portalCollector)
		setBoolOnSlice(slice, "BfIsChild", true)
	}

	// Auto-detect and process single child component props
	singleChildren := findSingleChildComponents(opts.Props)
	for _, child := range singleChildren {
		setScriptsOnSingle(child, scriptCollector)
		setPortalsOnSingle(child, portalCollector)
		setBoolField(child, "BfIsChild", true)
	}

	// Mark the root component so BfPropsAttr emits bf-p only for it
	setBoolField(opts.Props, "BfIsRoot", true)

	// Render the component template.
	//
	// Errors here are NOT silently dropped. The original implementation
	// ignored the return value of `ExecuteTemplate`, which masked a real
	// onboarding failure mode: a template referencing a non-existent
	// field (`.Todo.Done` instead of the range dot's `.Done`) caused
	// html/template to abort mid-stream, the partial output got
	// returned, and the HTTP server happily flushed a 200 with a
	// truncated body. No error log, no signal — the user just saw a
	// blank list (#1442 echo TodoApp repro).
	//
	// Now we capture the error and replace the partial output with a
	// visible inline panel (dev mode) or a fenced error comment
	// (production), so the cause is on-screen and grep-able in logs.
	// Either way the renderer also writes to stderr so structured log
	// aggregators see it.
	var componentBuf strings.Builder
	if err := r.templates.ExecuteTemplate(&componentBuf, opts.ComponentName, opts.Props); err != nil {
		fmt.Fprintf(os.Stderr, "barefoot: template %q failed to render: %v\n", opts.ComponentName, err)
		// Preserve whatever the template did manage to emit before
		// failing (Go's text/template flushes incrementally), but
		// follow it with a clearly-marked error block so the user
		// notices something is wrong instead of seeing a silent
		// truncation.
		componentBuf.WriteString(renderTemplateErrorPanel(opts.ComponentName, err))
	}

	// Determine title (default: "{ComponentName} - BarefootJS")
	title := opts.Title
	if title == "" {
		title = opts.ComponentName + " - BarefootJS"
	}

	// Heading (empty means no heading)
	heading := opts.Heading

	// Build render context
	ctx := &RenderContext{
		ComponentName: opts.ComponentName,
		Props:         opts.Props,
		ComponentHTML: template.HTML(componentBuf.String()),
		Portals:       portalCollector.Render(),
		Scripts:       BfScripts(scriptCollector),
		Title:         title,
		Heading:       heading,
		Extra:         opts.Extra,
	}

	return r.layout(ctx)
}

// setScriptsField sets the Scripts field on a struct using reflection.
func setScriptsField(v interface{}, collector *ScriptCollector) {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return
	}
	field := val.FieldByName("Scripts")
	if field.IsValid() && field.CanSet() {
		field.Set(reflect.ValueOf(collector))
	}
}

// setPortalsField sets the Portals field on a struct using reflection.
func setPortalsField(v interface{}, collector *PortalCollector) {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return
	}
	field := val.FieldByName("Portals")
	if field.IsValid() && field.CanSet() {
		field.Set(reflect.ValueOf(collector))
	}
}

// getStringField extracts a string field from a struct using reflection.
func setBoolField(v interface{}, fieldName string, val bool) {
	rv := reflect.ValueOf(v)
	if rv.Kind() == reflect.Ptr {
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return
	}
	field := rv.FieldByName(fieldName)
	if field.IsValid() && field.CanSet() && field.Kind() == reflect.Bool {
		field.SetBool(val)
	}
}

func getBoolField(v interface{}, fieldName string) bool {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return false
	}
	field := val.FieldByName(fieldName)
	if !field.IsValid() || field.Kind() != reflect.Bool {
		return false
	}
	return field.Bool()
}

func getStringField(v interface{}, fieldName string) string {
	val := reflect.ValueOf(v)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return ""
	}
	field := val.FieldByName(fieldName)
	if !field.IsValid() || field.Kind() != reflect.String {
		return ""
	}
	return field.String()
}

// findChildComponentSlices finds slice fields containing child component props.
// Child props are identified by having ScopeID and Scripts fields.
func findChildComponentSlices(props interface{}) []interface{} {
	var result []interface{}

	val := reflect.ValueOf(props)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return result
	}

	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)
		if field.Kind() != reflect.Slice || field.Len() == 0 {
			continue
		}

		elem := field.Index(0)
		if elem.Kind() == reflect.Ptr {
			elem = elem.Elem()
		}
		if elem.Kind() != reflect.Struct {
			continue
		}

		hasScopeID := elem.FieldByName("ScopeID").IsValid()
		hasScripts := elem.FieldByName("Scripts").IsValid()

		if hasScopeID && hasScripts {
			result = append(result, field.Interface())
		}
	}

	return result
}

// setScriptsOnSlice sets Scripts on all items in a slice.
func setScriptsOnSlice(slice interface{}, collector *ScriptCollector) {
	val := reflect.ValueOf(slice)
	if val.Kind() != reflect.Slice {
		return
	}
	for i := 0; i < val.Len(); i++ {
		item := val.Index(i)
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			field := item.FieldByName("Scripts")
			if field.IsValid() && field.CanSet() {
				field.Set(reflect.ValueOf(collector))
			}
		}
	}
}

// setBoolOnSlice sets a bool field on all items in a slice.
func setBoolOnSlice(slice interface{}, fieldName string, val bool) {
	v := reflect.ValueOf(slice)
	if v.Kind() != reflect.Slice {
		return
	}
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			field := item.FieldByName(fieldName)
			if field.IsValid() && field.CanSet() && field.Kind() == reflect.Bool {
				field.SetBool(val)
			}
		}
	}
}

// setPortalsOnSlice sets Portals on all items in a slice.
func setPortalsOnSlice(slice interface{}, collector *PortalCollector) {
	val := reflect.ValueOf(slice)
	if val.Kind() != reflect.Slice {
		return
	}
	for i := 0; i < val.Len(); i++ {
		item := val.Index(i)
		if item.Kind() == reflect.Ptr {
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			field := item.FieldByName("Portals")
			if field.IsValid() && field.CanSet() {
				field.Set(reflect.ValueOf(collector))
			}
		}
	}
}


// findSingleChildComponents finds single struct fields containing child component props.
// Child props are identified by having ScopeID and Scripts fields.
func findSingleChildComponents(props interface{}) []interface{} {
	var result []interface{}

	val := reflect.ValueOf(props)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() != reflect.Struct {
		return result
	}

	for i := 0; i < val.NumField(); i++ {
		field := val.Field(i)

		// Handle pointer to struct
		if field.Kind() == reflect.Ptr {
			if field.IsNil() {
				continue
			}
			field = field.Elem()
		}

		// Skip non-struct fields (slices handled by findChildComponentSlices)
		if field.Kind() != reflect.Struct {
			continue
		}

		hasScopeID := field.FieldByName("ScopeID").IsValid()
		hasScripts := field.FieldByName("Scripts").IsValid()

		if hasScopeID && hasScripts {
			result = append(result, field.Addr().Interface())
		}
	}

	return result
}

// setScriptsOnSingle sets Scripts on a single struct child component.
func setScriptsOnSingle(child interface{}, collector *ScriptCollector) {
	val := reflect.ValueOf(child)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() == reflect.Struct {
		field := val.FieldByName("Scripts")
		if field.IsValid() && field.CanSet() {
			field.Set(reflect.ValueOf(collector))
		}
	}
}

// setPortalsOnSingle sets Portals on a single struct child component.
func setPortalsOnSingle(child interface{}, collector *PortalCollector) {
	val := reflect.ValueOf(child)
	if val.Kind() == reflect.Ptr {
		val = val.Elem()
	}
	if val.Kind() == reflect.Struct {
		field := val.FieldByName("Portals")
		if field.IsValid() && field.CanSet() {
			field.Set(reflect.ValueOf(collector))
		}
	}
}


// =============================================================================
// Internal Helpers
// =============================================================================

func toFloat64(v any) float64 {
	switch n := v.(type) {
	case int:
		return float64(n)
	case int8:
		return float64(n)
	case int16:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	case uint:
		return float64(n)
	case uint8:
		return float64(n)
	case uint16:
		return float64(n)
	case uint32:
		return float64(n)
	case uint64:
		return float64(n)
	case float32:
		return float64(n)
	case float64:
		return n
	default:
		return 0
	}
}

func toInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case uint:
		return int(n)
	case uint8:
		return int(n)
	case uint16:
		return int(n)
	case uint32:
		return int(n)
	case uint64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}

func isIntLike(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64:
		return true
	default:
		return false
	}
}

func toString(v any) string {
	switch s := v.(type) {
	case string:
		return s
	case int:
		return strconv.Itoa(s)
	case int64:
		return strconv.FormatInt(s, 10)
	case float64:
		return strconv.FormatFloat(s, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(s)
	default:
		return ""
	}
}
