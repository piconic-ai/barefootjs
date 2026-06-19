// Package bf provides runtime helper functions for BarefootJS Go templates.
// These functions mirror JavaScript behavior for consistent SSR output.
package bf

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"math"
	"math/rand"
	"net/url"
	"os"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
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
		"bf_trim":        Trim,
		"bf_contains":    Contains,
		"bf_join":        Join,
		"bf_split":       Split,
		"bf_starts_with": StartsWith,
		"bf_ends_with":   EndsWith,
		"bf_replace":     Replace,
		"bf_repeat":      Repeat,
		"bf_pad_start":   PadStart,
		"bf_pad_end":     PadEnd,
		"bf_string":      String,

		// URL query builder (#1897 PostList href helpers): conditional
		// (include, key, value) triples → "base?k=v&…", mirroring a
		// URLSearchParams builder with guarded `.set()` calls.
		"bf_query": Query,

		// JSON / numeric primitives — JS-compat callees registered on
		// the Go adapter's `templatePrimitives` map (#1188).
		"bf_json":   JSON,
		"bf_number": Number,
		"bf_floor":    Floor,
		"bf_ceil":     Ceil,
		"bf_round":    Round,
		"bf_to_fixed": ToFixed,

		// Array/Slice
		"bf_len":            Len,
		"bf_at":             At,
		"bf_includes":       Includes,
		"bf_index_of":       IndexOf,
		"bf_last_index_of":  LastIndexOf,
		"bf_concat":         Concat,
		"bf_slice":          Slice,
		"bf_reverse":        Reverse,
		"bf_flat":           Flat,
		"bf_flat_map":       FlatMap,
		"bf_flat_map_tuple": FlatMapTuple,
		"bf_first":          First,
		"bf_last":           Last,
		"bf_arr":            Arr,
		"bf_filter_truthy":  FilterTruthy,

		// Higher-order Array Methods
		"bf_every":      Every,
		"bf_some":       Some,
		"bf_filter":     Filter,
		"bf_find":            Find,
		"bf_find_index":      FindIndex,
		"bf_find_last":       FindLast,
		"bf_find_last_index": FindLastIndex,
		"bf_sort":       Sort,
		"bf_reduce":     Reduce,

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

		// JSX children passed to an imported child component (#1896):
		// the parent renders the children fragment via a companion
		// define (executed through bf_tmpl from TemplateFuncMap) and
		// injects the result into the child's Children field.
		"bf_with_children": WithChildren,

		// Scope comment for fragment roots
		"bfScopeComment": ScopeComment,

		// JSX intrinsic-element spread lowering (#1407)
		"bf_spread_attrs": SpreadAttrs,
	}
}

// Query builds a URL from a base path plus a query string assembled from
// (include, key, value) triples, in order. A pair is appended only when its
// `include` flag is true — mirroring a JS URLSearchParams builder whose
// `.set(key, value)` calls are each guarded by an `if`. The compiler lowers
// each guard to the `include` bool (so empty-but-included values, and
// non-empty-but-excluded values, both match the source semantics). Keys and
// values are query-escaped (spaces → "+", like URLSearchParams). An empty
// query yields the bare base.
//
// Trailing args that don't complete a triple are ignored.
func Query(base string, triples ...any) string {
	var b strings.Builder
	for i := 0; i+2 < len(triples); i += 3 {
		include, _ := triples[i].(bool)
		if !include {
			continue
		}
		if b.Len() == 0 {
			b.WriteByte('?')
		} else {
			b.WriteByte('&')
		}
		b.WriteString(url.QueryEscape(String(triples[i+1])))
		b.WriteByte('=')
		b.WriteString(url.QueryEscape(String(triples[i+2])))
	}
	return base + b.String()
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

// Split lowers `String.prototype.split(sep, limit?)` (#1448 Tier B). It
// wraps `strings.Split` and normalises the result to `[]any` so the
// slice composes with the array-method surface downstream (`bf_join`,
// range loops, `bf_len`, …) the same way `bf_slice` / `bf_reverse`
// results do. Like JS, an empty separator splits into individual UTF-8
// characters and trailing empty fields are preserved (`"a,".split(",")`
// → `["a", ""]`). An optional `limit` caps the number of returned
// pieces (`"a,b,c".split(",", 2)` → `["a", "b"]`); a negative limit is
// ignored (JS would also return every piece — its ToUint32 wrap makes
// the limit effectively unbounded). The no-separator form is handled by
// the adapter (it emits `bf_arr` for the whole-string single element).
func Split(s, sep string, limit ...int) []any {
	parts := strings.Split(s, sep)
	if len(limit) > 0 && limit[0] >= 0 && limit[0] < len(parts) {
		parts = parts[:limit[0]]
	}
	out := make([]any, len(parts))
	for i, p := range parts {
		out[i] = p
	}
	return out
}

// StartsWith lowers `String.prototype.startsWith(prefix, position?)`
// (#1448 Tier B). Wraps `strings.HasPrefix`; an empty prefix is always
// true (JS parity). The optional `position` re-anchors the test to start
// at that index (clamped to `[0, len]` so it never panics), matching JS
// `"abc".startsWith("b", 1) === true`.
func StartsWith(s, prefix string, position ...int) bool {
	if len(position) > 0 {
		p := position[0]
		if p < 0 {
			p = 0
		}
		if p > len(s) {
			p = len(s)
		}
		s = s[p:]
	}
	return strings.HasPrefix(s, prefix)
}

// EndsWith lowers `String.prototype.endsWith(suffix, endPosition?)`
// (#1448 Tier B). Wraps `strings.HasSuffix`; an empty suffix is always
// true (JS parity). The optional `endPosition` treats the string as if
// it were only that many bytes long (clamped to `[0, len]`), matching JS
// `"abc".endsWith("b", 2) === true`.
func EndsWith(s, suffix string, endPosition ...int) bool {
	if len(endPosition) > 0 {
		e := endPosition[0]
		if e < 0 {
			e = 0
		}
		if e > len(s) {
			e = len(s)
		}
		s = s[:e]
	}
	return strings.HasSuffix(s, suffix)
}

// Replace lowers the string-pattern form of `String.prototype.replace`
// (#1448 Tier B). JS replaces only the FIRST occurrence for a string
// pattern, so the count is 1 (`strings.Replace` with n=1; n<0 would
// replace all — that's `.replaceAll`, still refused). The replacement
// is treated literally: unlike JS, special replacement patterns like
// `$&` / `$1` are NOT interpreted (Go and Perl agree on literal
// replacement, keeping the two template adapters byte-equal; this
// diverges from the Hono/CSR JS path only for replacement strings that
// contain `$`-patterns, which are rare in template position).
func Replace(s, old, new string) string {
	return strings.Replace(s, old, new, 1)
}

// Repeat lowers `String.prototype.repeat(n)` (#1448 Tier B): the
// receiver concatenated n times. JS throws RangeError for a negative
// count and `strings.Repeat` panics, so a negative count clamps to the
// empty string — SSR templates degrade rather than crash the render.
// A zero count is the empty string (JS parity).
func Repeat(s string, n int) string {
	if n <= 0 {
		return ""
	}
	return strings.Repeat(s, n)
}

// padTo lowers the shared body of `String.prototype.padStart` /
// `padEnd` (#1448 Tier B): pad `s` to `target` code points using `pad`
// repeated and truncated to fill, prepended (atStart) or appended.
// Length is measured in runes (not bytes) so the result matches the
// Perl `bf->pad_*` helpers — this diverges from JS's UTF-16-unit length
// only for astral-plane input. An empty pad, or a receiver already at
// least `target` long, returns `s` unchanged (JS parity).
func padTo(s string, target int, pad string, atStart bool) string {
	if pad == "" {
		return s
	}
	sLen := utf8.RuneCountInString(s)
	if sLen >= target {
		return s
	}
	need := target - sLen
	padRunes := []rune(pad)
	fill := make([]rune, 0, need)
	for len(fill) < need {
		for _, r := range padRunes {
			if len(fill) >= need {
				break
			}
			fill = append(fill, r)
		}
	}
	if atStart {
		return string(fill) + s
	}
	return s + string(fill)
}

// PadStart lowers `String.prototype.padStart(target, pad?)` (#1448 Tier
// B). The pad string defaults to a single space when omitted.
func PadStart(s string, target int, pad ...string) string {
	p := " "
	if len(pad) > 0 {
		p = pad[0]
	}
	return padTo(s, target, p, true)
}

// PadEnd lowers `String.prototype.padEnd(target, pad?)` (#1448 Tier B).
func PadEnd(s string, target int, pad ...string) string {
	p := " "
	if len(pad) > 0 {
		p = pad[0]
	}
	return padTo(s, target, p, false)
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

// ToFixed formats v with exactly `digits` decimal places, mirroring JS
// `Number.prototype.toFixed` (zero-padding + half-toward-+Infinity
// rounding). JS rounds the scaled integer half up (`(2.5).toFixed(0)`
// is "3"); bare `fmt.Sprintf("%.*f")` rounds half-to-even ("2"), so we
// scale, round with `Floor(x + 0.5)` (matching `Round`), then format
// the exact multiple. #1897.
func ToFixed(v any, digits int) string {
	if digits < 0 {
		digits = 0
	}
	n := Number(v)
	// JS toFixed returns the strings "NaN" / "Infinity" / "-Infinity" for
	// non-finite inputs; fmt would render "NaN"/"+Inf"/"-Inf".
	if math.IsNaN(n) {
		return "NaN"
	}
	if math.IsInf(n, 1) {
		return "Infinity"
	}
	if math.IsInf(n, -1) {
		return "-Infinity"
	}
	factor := math.Pow(10, float64(digits))
	rounded := math.Floor(n*factor + 0.5)
	return fmt.Sprintf("%.*f", digits, rounded/factor)
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

// Concat merges two arrays (or slices) into a single `[]any`,
// preserving order: receiver elements first, then `other`'s.
// Lowers `Array.prototype.concat(other)` (#1448 Tier A). Non-array
// operands collapse to an empty source — matches the JS semantic
// where `.concat` on a non-Array reads it as a single element only
// if its `Symbol.isConcatSpreadable` is true; the template-language
// path doesn't have user objects with that flag, so treating
// non-arrays as empty is the conservative lowering. Variadic
// `.concat(a, b, c)` is out of scope here (parser gates to a single
// arg); the helper itself stays binary so a future variadic IR can
// fold via repeated calls without changing this signature.
func Concat(a, b any) []any {
	flatten := func(v reflect.Value) []any {
		if !v.IsValid() {
			return nil
		}
		if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
			return nil
		}
		out := make([]any, v.Len())
		for i := 0; i < v.Len(); i++ {
			out[i] = v.Index(i).Interface()
		}
		return out
	}
	left := flatten(reflect.ValueOf(a))
	right := flatten(reflect.ValueOf(b))
	return append(left, right...)
}

// Slice carves out a sub-range from `items`. Lowers
// `Array.prototype.slice(start, end?)` (#1448 Tier A). The variadic
// `end` arg lets Go template's call dispatcher pass either 2 or 3
// arguments; an absent end means "to length".
//
// JS-compat clamping:
//   - start < 0          → length + start  (e.g. -1 = last index)
//   - end < 0            → length + end
//   - start < 0 after clamp → 0
//   - end > length       → length
//   - start >= end       → empty slice (no panic)
//
// Non-array receivers return an empty `[]any`.
func Slice(items any, start int, end ...int) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return []any{}
	}
	length := v.Len()

	// Normalise start (negative = from end).
	if start < 0 {
		start = length + start
	}
	if start < 0 {
		start = 0
	}
	if start > length {
		start = length
	}

	// Normalise end (optional; absent = length).
	stop := length
	if len(end) > 0 {
		stop = end[0]
		if stop < 0 {
			stop = length + stop
		}
		if stop < 0 {
			stop = 0
		}
		if stop > length {
			stop = length
		}
	}

	if start >= stop {
		return []any{}
	}

	out := make([]any, 0, stop-start)
	for i := start; i < stop; i++ {
		out = append(out, v.Index(i).Interface())
	}
	return out
}

// Reverse returns a new slice with `items`'s elements in reverse
// order. Lowers both `Array.prototype.reverse()` and
// `Array.prototype.toReversed()` (#1448 Tier A) — SSR templates
// render a snapshot, so JS's mutate-receiver vs return-new-array
// distinction has no template-level meaning, and the safer
// non-mutating shape is used uniformly.
//
// Non-array receivers return an empty `[]any`.
func Reverse(items any) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return []any{}
	}
	length := v.Len()
	out := make([]any, length)
	for i := 0; i < length; i++ {
		out[length-1-i] = v.Index(i).Interface()
	}
	return out
}

// Flat flattens nested slices/arrays `depth` levels deep. Lowers
// `Array.prototype.flat(depth?)` (#1448 Tier C). A `depth` of `-1` is the
// `Infinity` sentinel (flatten fully); `0` (or negative-from-JS, already
// normalised to 0 at compile time) returns a shallow copy. Non-array
// elements are kept as-is (JS only flattens nested arrays). A non-array
// receiver returns an empty `[]any`.
func Flat(items any, depth int) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return []any{}
	}
	out := make([]any, 0, v.Len())
	for i := 0; i < v.Len(); i++ {
		el := v.Index(i).Interface()
		ev := reflect.ValueOf(el)
		if depth != 0 && (ev.Kind() == reflect.Slice || ev.Kind() == reflect.Array) {
			// `-1` (Infinity) recurses unbounded; a finite depth spends one level.
			next := depth
			if depth > 0 {
				next = depth - 1
			}
			out = append(out, Flat(el, next)...)
		} else {
			out = append(out, el)
		}
	}
	return out
}

// FlatMap projects each element through a `self` / `field` projection and
// flattens the result one level. Lowers value-returning
// `Array.prototype.flatMap(fn)` for the field-projection catalogue
// (#1448 Tier C): `items.flatMap(i => i)` (self) and
// `items.flatMap(i => i.field)` (field). A projected non-array value is
// kept as-is (flatMap = map + flat(1)). Non-array receiver → empty.
func FlatMap(items any, keyKind, keyName string) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return []any{}
	}
	projected := make([]any, 0, v.Len())
	for i := 0; i < v.Len(); i++ {
		el := v.Index(i).Interface()
		if keyKind == "field" {
			projected = append(projected, getFieldValue(el, keyName))
		} else {
			projected = append(projected, el)
		}
	}
	return Flat(projected, 1)
}

// FlatMapTuple lowers an array-literal flatMap projection
// `items.flatMap(i => [i.a, i.b])` (#1448 Tier C). `specs` is a flat list
// of (kind, name) pairs, one per array-literal leaf: ("self", "") for the
// item itself, ("field", "<Name>") for a struct field. For each item it
// appends every leaf's value in order. Unlike the scalar `FlatMap`, the
// per-item array is flattened only one level (flat(1) removes the literal
// wrapper), so an array-valued leaf is appended verbatim rather than
// spread — which is exactly "append each leaf". Non-array receiver → empty.
func FlatMapTuple(items any, specs ...string) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return []any{}
	}
	out := make([]any, 0, v.Len())
	for i := 0; i < v.Len(); i++ {
		el := v.Index(i).Interface()
		for j := 0; j+1 < len(specs); j += 2 {
			if specs[j] == "field" {
				out = append(out, getFieldValue(el, specs[j+1]))
			} else {
				out = append(out, el)
			}
		}
	}
	return out
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

// Truthy is the exported form of isTruthy — JavaScript's `Boolean(x)`
// semantics — for generated `NewXxxProps` code lowering a conditional
// inline-object spread condition on an `interface{}` prop (whose runtime
// value may be a string, number, bool, …). Keeps the spread bag's
// inclusion test faithful to JS rather than string-biased (#1752).
func Truthy(v any) bool { return isTruthy(v) }

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

// fieldValue projects item.field for the higher-order predicate
// helpers. The field name arrives in JS casing; structs resolve via
// the capitalized Go convention (FieldByName inside getFieldValue),
// maps via getFieldValue's case-variant lookup — the same dual
// support Sort/Reduce gained in #1487, extended here so JSON-decoded
// data (map items) participates instead of being silently skipped.
// nil-safe: missing fields and nil items project to nil.
func fieldValue(item any, field string) any {
	return getFieldValue(item, capitalize(field))
}

// Every returns true if every item's field is truthy under JS
// `Boolean(item.field)` semantics. Mirrors JavaScript's
// Array.prototype.every(item => item.field) — including being
// vacuously true for an empty receiver.
func Every(items any, field string) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}
	for i := 0; i < v.Len(); i++ {
		if !isTruthy(fieldValue(v.Index(i).Interface(), field)) {
			return false
		}
	}
	return true
}

// Some returns true if at least one item's field is truthy. Mirrors
// JavaScript's Array.prototype.some(item => item.field).
func Some(items any, field string) bool {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return false
	}
	for i := 0; i < v.Len(); i++ {
		if isTruthy(fieldValue(v.Index(i).Interface(), field)) {
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
	var result []any
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i).Interface()
		if reflect.DeepEqual(fieldValue(item, field), value) {
			result = append(result, item)
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
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i).Interface()
		if reflect.DeepEqual(fieldValue(item, field), value) {
			return item
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
	for i := 0; i < v.Len(); i++ {
		if reflect.DeepEqual(fieldValue(v.Index(i).Interface(), field), value) {
			return i
		}
	}
	return -1
}

// FindLast returns the last item where item.field == value, or nil if not found.
// Mirrors JavaScript's Array.prototype.findLast(item => item.field === value).
func FindLast(items any, field string, value any) any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}
	for i := v.Len() - 1; i >= 0; i-- {
		item := v.Index(i).Interface()
		if reflect.DeepEqual(fieldValue(item, field), value) {
			return item
		}
	}
	return nil
}

// FindLastIndex returns the index of the last item where item.field == value, or -1.
// Mirrors JavaScript's Array.prototype.findLastIndex(item => item.field === value).
func FindLastIndex(items any, field string, value any) int {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return -1
	}
	for i := v.Len() - 1; i >= 0; i-- {
		if reflect.DeepEqual(fieldValue(v.Index(i).Interface(), field), value) {
			return i
		}
	}
	return -1
}

// sortKeySpec is one parsed comparison key. A simple comparator has
// one; a `||`-chained multi-key comparator has several, applied in
// order as tie-breakers.
type sortKeySpec struct {
	kind        string // "self" | "field"
	name        string // capitalised field name, or "" for "self"
	compareType string // "numeric" | "string" | "auto"
	direction   string // "asc" | "desc"
}

// Sort returns a new stable-sorted slice. Lowers
// `Array.prototype.sort` / `Array.prototype.toSorted` (#1448 Tier B).
// Non-mutating — JS's mutate-vs-new distinction is moot in SSR
// template context (templates render a snapshot).
//
// Call shape (the compiler emits one 4-string group per key):
//
//	bf_sort <items> (<keyKind> <keyName> <compareType> <direction>)+
//
//	keyKind:      "self" | "field"
//	keyName:      "" when keyKind == "self"; capitalised struct field
//	              name (e.g. "Price") otherwise
//	compareType:  "numeric" | "string" | "auto"
//	direction:    "asc" | "desc"
//
// The groups cover the accepted comparator catalogue: `a.f - b.f`,
// `a - b`, `a[.f].localeCompare(b[.f])`, and relational-ternary keys
// (`a.f > b.f ? 1 : -1` → "auto"), each `||`-chainable for multi-key
// tie-breaks. Anything outside refuses at compile time (BF101 from the
// JSX compiler) and never reaches this helper.
//
// "auto" compares numerically when both projected keys parse as
// numbers, else lexically — mirroring the Perl `bf->sort` helper's
// `looks_like_number` rule so the two template adapters stay
// byte-equal. This diverges from JS `<`/`>` only for numeric strings.
//
// A future `nulls` knob can extend the per-key group without rewriting
// existing call sites — each key already projects before comparing.
func Sort(items any, spec ...string) []any {
	v := reflect.ValueOf(items)
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
		return nil
	}

	length := v.Len()
	if length == 0 {
		return []any{}
	}

	// Copy into a fresh []any so the sort is non-mutating regardless
	// of whether the receiver is `[]T` or `[]any`.
	result := make([]any, length)
	for i := 0; i < length; i++ {
		result[i] = v.Index(i).Interface()
	}

	keys := parseSortSpec(spec)
	sort.SliceStable(result, func(i, j int) bool {
		for _, k := range keys {
			ki := projectSortKey(result[i], k.kind, k.name)
			kj := projectSortKey(result[j], k.kind, k.name)
			c := compareSortKey(ki, kj, k.compareType)
			if c == 0 {
				continue // tie on this key — fall through to the next
			}
			if k.direction == "desc" {
				return c > 0
			}
			return c < 0
		}
		return false
	})

	return result
}

// parseSortSpec chunks the variadic operand list into 4-string key
// groups. A trailing partial group (malformed emit) is ignored rather
// than panicking — defensive, mirroring the helper's nil-safe stance.
func parseSortSpec(spec []string) []sortKeySpec {
	var keys []sortKeySpec
	for i := 0; i+3 < len(spec); i += 4 {
		keys = append(keys, sortKeySpec{
			kind:        spec[i],
			name:        spec[i+1],
			compareType: spec[i+2],
			direction:   spec[i+3],
		})
	}
	return keys
}

// compareSortKey returns -1 / 0 / 1 for two projected keys under the
// given compare type (ascending orientation; the caller flips for
// "desc"). "string" stringifies both (nil → "", matching the
// documented `bf->string(undef) === ""` divergence). "auto" compares
// numerically when both parse as numbers, else lexically.
func compareSortKey(ki, kj any, compareType string) int {
	switch compareType {
	case "string":
		return strings.Compare(toString(ki), toString(kj))
	case "auto":
		ni, okI := toFloat64WithOK(ki)
		nj, okJ := toFloat64WithOK(kj)
		if okI && okJ {
			return cmpFloat(ni, nj)
		}
		return strings.Compare(toString(ki), toString(kj))
	default: // numeric
		return cmpFloat(toFloat64(ki), toFloat64(kj))
	}
}

func cmpFloat(a, b float64) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}

// toFloat64WithOK reports a value's numeric float and whether it is
// number-like. Genuine numeric kinds always qualify; strings qualify
// when they parse as a float (so the "auto" compare path matches the
// Perl `looks_like_number` rule). Everything else is non-numeric.
func toFloat64WithOK(v any) (float64, bool) {
	switch n := v.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return toFloat64(v), true
	case string:
		f, err := strconv.ParseFloat(strings.TrimSpace(n), 64)
		if err != nil {
			return 0, false
		}
		return f, true
	default:
		return 0, false
	}
}

// projectSortKey reduces an item to the value the comparator
// actually compares. For `keyKind == "field"` it reads the named
// struct field; for `keyKind == "self"` (primitive arrays) it
// returns the item unchanged.
func projectSortKey(item any, keyKind, keyName string) any {
	if keyKind == "field" {
		return getFieldValue(item, keyName)
	}
	return item
}

// getFieldValue extracts a struct field value using reflection. For
// map receivers it falls back to case-variant lookup so JSON-decoded
// user data (`map[string]any{"price": 30}`) and PascalCase-emitted
// test data both resolve under a single key name. (#1487)
func getFieldValue(item any, field string) any {
	v := reflect.ValueOf(item)
	// Defensive IsNil guards mirror `SpreadAttrs` — keeps the helper
	// safe against typed-nil pointer / nil-interface items inside a
	// `[]any` so a single bad row doesn't crash the whole sort.
	if v.Kind() == reflect.Interface {
		if v.IsNil() {
			return nil
		}
		v = v.Elem()
	}
	if v.Kind() == reflect.Ptr {
		if v.IsNil() {
			return nil
		}
		v = v.Elem()
	}

	if v.Kind() == reflect.Map {
		keyType := v.Type().Key()
		if keyType.Kind() != reflect.String {
			return nil
		}
		// Convert the lookup string to the map's actual key type so
		// maps keyed by a named string type (`type Key string`) don't
		// panic with `value of type string is not assignable to type X`.
		lookup := func(s string) (any, bool) {
			k := reflect.ValueOf(s).Convert(keyType)
			if mv := v.MapIndex(k); mv.IsValid() {
				return mv.Interface(), true
			}
			return nil, false
		}
		if r, ok := lookup(field); ok {
			return r
		}
		if cap := capitalize(field); cap != field {
			if r, ok := lookup(cap); ok {
				return r
			}
		}
		if low := decapitalize(field); low != field {
			if r, ok := lookup(low); ok {
				return r
			}
		}
		// All-lowercase fallback: a Go-initialism field projects as an
		// all-caps key (`id` → `ID`), and `decapitalize("ID")` only
		// lowers the first char (`iD`), so the JS-keyed map ("id") still
		// misses. Try the fully-lowered key last to resolve it.
		if lower := strings.ToLower(field); lower != field && lower != decapitalize(field) {
			if r, ok := lookup(lower); ok {
				return r
			}
		}
		return nil
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

// decapitalize lowercases the first character of a string. Used by
// `getFieldValue`'s map-receiver fallback when the projected key
// name is PascalCase but the receiver carries lowercase JS-style
// keys (the inverse of the `capitalize` lookup).
func decapitalize(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}

// Reduce folds an array into a scalar via the arithmetic-fold
// catalogue (#1448 Tier C). It lowers `Array.prototype.reduce(fn, init)`
// and `Array.prototype.reduceRight(fn, init)` for the shapes
// `(acc, x) => acc <op> x` and `(acc, x) => acc <op> x.field`:
//
//	bf_reduce <items> "<op>" "<keyKind>" "<keyName>" "<type>" "<init>" "<direction>"
//
//	direction: "left" (reduce) | "right" (reduceRight). Only changes the
//	           result for string concatenation; numeric folds commute.
//
//	op:       "+" | "*"
//	keyKind:  "self" | "field"
//	keyName:  "" when keyKind == "self"; capitalised struct field name
//	          (e.g. "Duration") otherwise
//	type:     "numeric" | "string"
//	init:     the fold's start value — the compiler emits the *decoded*
//	          seed, so numeric inits arrive as canonical decimal
//	          (`1_000`/`0x10` already normalised to `1000`/`16`) that
//	          ParseFloat accepts, and string inits arrive as escape-free
//	          contents
//
// Numeric folds accumulate as float64; each projected key is read via
// `toFloat64WithOK`, so numeric *strings* ("5" → 5) parse and
// non-numeric values fold as 0 — matching Perl's
// `looks_like_number ? $n : 0` so the two template adapters stay
// byte-equal. String folds concatenate (toString per projected key,
// matching the documented `bf->string(undef) === ""` convention). The
// init seeds the accumulator, so an empty receiver returns the init
// unchanged — exactly like JS `reduce(fn, init)`. Anything outside the
// catalogue refuses at compile time (BF101 from the JSX compiler) and
// never reaches here.
//
// Two documented divergences from the JS / Hono path, both rare and
// mirroring the `bf_sort` "auto" caveat:
//   - float64 stringification differs for sums whose binary expansion
//     isn't exact (e.g. 0.1 + 0.2);
//   - numeric-*string* keys fold numerically here, but JS `+`
//     string-concatenates once an operand is a string, so
//     numeric-string data can render differently under CSR.
// Genuine numbers — the common SSR case — agree across all three.
func Reduce(items any, op, keyKind, keyName, typ, init, direction string) any {
	v := reflect.ValueOf(items)
	isSlice := v.Kind() == reflect.Slice || v.Kind() == reflect.Array

	// `direction == "right"` (reduceRight) folds right-to-left. Only
	// observable for string concatenation — numeric sum / product are
	// commutative, so the order doesn't change the result there. Build a
	// start/stop/step triple so both folds share one loop shape.
	start, stop, step := 0, 0, 1
	if isSlice {
		stop = v.Len()
		if direction == "right" {
			start, stop, step = v.Len()-1, -1, -1
		}
	}

	if typ == "string" {
		acc := init
		if isSlice {
			for i := start; i != stop; i += step {
				key := projectSortKey(v.Index(i).Interface(), keyKind, keyName)
				acc += toString(key)
			}
		}
		return acc
	}

	// numeric fold
	acc, _ := strconv.ParseFloat(strings.TrimSpace(init), 64)
	if isSlice {
		for i := start; i != stop; i += step {
			key := projectSortKey(v.Index(i).Interface(), keyKind, keyName)
			// `toFloat64WithOK` parses numeric *strings* ("5" → 5) and
			// returns 0 for non-numeric values — mirroring Perl's
			// `looks_like_number ? $n : 0` so numeric-string data folds
			// byte-equal across adapters (the same rule `bf_sort`'s
			// "auto" compare uses). Plain `toFloat64` would zero "5".
			n, _ := toFloat64WithOK(key)
			if op == "*" {
				acc *= n
			} else {
				acc += n
			}
		}
	}
	return acc
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

// TemplateFuncMap returns the helpers that need access to the executing
// template set itself, closed over the *template.Template the component
// defines are parsed into. Register it alongside FuncMap BEFORE parsing:
//
//	t := template.New("")
//	t.Funcs(bf.FuncMap()).Funcs(bf.TemplateFuncMap(t))
//	template.Must(t.Parse(src))
//
// bf_tmpl executes a named define from the same set and returns its
// output — used for the per-call-site children defines the Go adapter
// emits when JSX children passed to an imported component contain
// template actions (nested components, dynamic text) and therefore
// cannot be baked to a static HTML string (#1896). Reentrant execution
// of an html/template set from inside a FuncMap function is safe: the
// escape analysis over every define completes before the outer
// Execute begins evaluating.
func TemplateFuncMap(t *template.Template) template.FuncMap {
	return template.FuncMap{
		"bf_tmpl": func(name string, data interface{}) (template.HTML, error) {
			var buf bytes.Buffer
			if err := t.ExecuteTemplate(&buf, name, data); err != nil {
				return "", err
			}
			return template.HTML(buf.String()), nil
		},
	}
}

// WithChildren returns a shallow copy of a component Props struct with its
// Children field replaced by the given pre-rendered fragment (#1896). The
// props value stays by-value semantics: callers' originals are untouched.
// A props type without a Children field passes through unchanged — the
// child template then simply has no children to render, matching the
// pre-#1896 behaviour.
func WithChildren(props interface{}, children template.HTML) (interface{}, error) {
	v := reflect.ValueOf(props)
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return props, nil
	}
	field := v.FieldByName("Children")
	if !field.IsValid() {
		return props, nil
	}
	copyPtr := reflect.New(v.Type())
	copyPtr.Elem().Set(v)
	target := copyPtr.Elem().FieldByName("Children")
	switch {
	case target.Kind() == reflect.Interface:
		target.Set(reflect.ValueOf(children))
	case target.Kind() == reflect.String:
		// Covers both `string` and `template.HTML`-typed fields.
		target.SetString(string(children))
	default:
		return props, fmt.Errorf("bf_with_children: unsupported Children field type %s", target.Type())
	}
	return copyPtr.Elem().Interface(), nil
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
		setScopeIDsOnSlice(slice)
		setScriptsOnSlice(slice, scriptCollector)
		setPortalsOnSlice(slice, portalCollector)
		setBoolOnSlice(slice, "BfIsChild", true)
	}

	// Auto-detect and process single child component props
	singleChildren := findSingleChildComponents(opts.Props)
	for _, child := range singleChildren {
		setScopeIDOnSingle(child)
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

// scopeIDChars is the alphabet for auto-generated ScopeID suffixes. It
// mirrors the `randomID` helper the go-template adapter emits into the
// generated New<Component>Props constructors so runtime-assigned and
// constructor-assigned ids are indistinguishable.
const scopeIDChars = "abcdefghijklmnopqrstuvwxyz0123456789"

// randomScopeSuffix returns a random lowercase-alphanumeric string of
// length n. math/rand (auto-seeded since Go 1.20) is sufficient here: the
// suffix only needs to be unique enough to keep a page's bf-s scope ids
// from colliding, not cryptographically unpredictable.
func randomScopeSuffix(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = scopeIDChars[rand.Intn(len(scopeIDChars))]
	}
	return string(b)
}

// scopeIDPrefix derives the human-readable ScopeID prefix from a child
// component's type, e.g. `TodoItemProps` → `TodoItem`. Matches the
// `"<Component>_" + randomID(6)` shape the generated constructors use.
func scopeIDPrefix(t reflect.Type) string {
	for t.Kind() == reflect.Ptr {
		t = t.Elem()
	}
	return strings.TrimSuffix(t.Name(), "Props")
}

// assignScopeID fills a child component's ScopeID with a generated id when
// the caller left it empty, so application code doesn't have to mint scope
// ids by hand (the parent's New<Component>Props constructor does the same
// for components built through it). A non-empty ScopeID is left untouched,
// so callers can still pin a stable id when they need one.
func assignScopeID(structVal reflect.Value, prefix string) {
	field := structVal.FieldByName("ScopeID")
	if !field.IsValid() || !field.CanSet() || field.Kind() != reflect.String {
		return
	}
	if field.String() != "" {
		return
	}
	id := randomScopeSuffix(6)
	if prefix != "" {
		id = prefix + "_" + id
	}
	field.SetString(id)
}

// setScopeIDsOnSlice assigns a generated ScopeID to every child in a slice
// whose ScopeID is empty.
func setScopeIDsOnSlice(slice interface{}) {
	v := reflect.ValueOf(slice)
	if v.Kind() != reflect.Slice {
		return
	}
	prefix := scopeIDPrefix(v.Type().Elem())
	for i := 0; i < v.Len(); i++ {
		item := v.Index(i)
		if item.Kind() == reflect.Ptr {
			if item.IsNil() {
				continue
			}
			item = item.Elem()
		}
		if item.Kind() == reflect.Struct {
			assignScopeID(item, prefix)
		}
	}
}

// setScopeIDOnSingle assigns a generated ScopeID to a single child
// component when its ScopeID is empty.
func setScopeIDOnSingle(child interface{}) {
	v := reflect.ValueOf(child)
	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return
	}
	assignScopeID(v, scopeIDPrefix(v.Type()))
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

// =============================================================================
// searchParams() — request-scoped environment signal (router v0.5, #1922)
// =============================================================================

// SearchParams is the SSR view of the request query string behind the
// reactive searchParams() environment signal. The route handler builds it
// from the request URL and assigns it to the component's SearchParams input
// field; the generated template reads it via `.SearchParams.Get "key"`.
//
// The zero value is an empty query (url.Values.Get tolerates a nil map), so a
// render with no request query — e.g. the adapter conformance harness, which
// issues no query string — resolves every key to "", which the template's
// `or`/`??` fallback turns into the author's default.
type SearchParams struct {
	values url.Values
}

// NewSearchParams parses a raw query string (with or without a leading "?")
// into a SearchParams. A malformed query yields an empty set rather than an
// error, mirroring the browser's URLSearchParams, which never throws on junk.
//
// Typical handler use (net/http):
//
//	in := MyComponentInput{SearchParams: bf.NewSearchParams(r.URL.RawQuery)}
func NewSearchParams(raw string) SearchParams {
	raw = strings.TrimPrefix(raw, "?")
	values, err := url.ParseQuery(raw)
	if err != nil {
		values = url.Values{}
	}
	return SearchParams{values: values}
}

// Get returns the first value associated with key, or "" when the key is
// absent. This mirrors url.Values.Get, which also returns "" for a
// present-but-empty value (`?sort=`). Safe on the zero value (nil map).
//
// This is not byte-for-byte URLSearchParams.get under the template's `??`
// lowering. JS distinguishes absent (`null`) from present-but-empty (`""`):
// `null ?? d` yields the default, but `"" ?? d` keeps the empty string. The
// Go adapter lowers `??` to the `or` builtin — Go templates have no
// null-coalescing operator — so here BOTH an absent key and a present-but-
// empty value fall back to the author's default. The conformance fixture only
// exercises the absent-key default, where the two runtimes agree; the
// empty-string divergence is the same general `?? → or` limitation that
// applies to any `x ?? default` the Go adapter lowers.
func (s SearchParams) Get(key string) string {
	return s.values.Get(key)
}
