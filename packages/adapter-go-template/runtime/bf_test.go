package bf

import (
	"html/template"
	"math"
	"strings"
	"testing"
)

func TestAdd(t *testing.T) {
	tests := []struct {
		a, b any
		want any
	}{
		{1, 2, 3},
		{10, -5, 5},
		{1.5, 2.5, 4.0},
		{1, 2.5, 3.5},
	}

	for _, tt := range tests {
		got := Add(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("Add(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestSub(t *testing.T) {
	tests := []struct {
		a, b any
		want any
	}{
		{5, 3, 2},
		{10, -5, 15},
		{5.5, 2.5, 3.0},
	}

	for _, tt := range tests {
		got := Sub(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("Sub(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestMul(t *testing.T) {
	tests := []struct {
		a, b any
		want any
	}{
		{3, 4, 12},
		{-2, 5, -10},
		{2.5, 4.0, 10.0},
	}

	for _, tt := range tests {
		got := Mul(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("Mul(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestDiv(t *testing.T) {
	tests := []struct {
		a, b any
		want any
	}{
		{10, 2, 5.0},
		{7, 2, 3.5},
		{10, 0, 0}, // Division by zero returns 0
	}

	for _, tt := range tests {
		got := Div(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("Div(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestMin(t *testing.T) {
	tests := []struct {
		a, b any
		want any
	}{
		{3, 4, 3},         // both int-like → int result
		{4, 3, 3},         // order independent
		{100, 12.5, 12.5}, // mixed operands → float64 result
		{-2, 5, -2},       // negatives
	}
	for _, tt := range tests {
		if got := Min(tt.a, tt.b); got != tt.want {
			t.Errorf("Min(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestMax(t *testing.T) {
	tests := []struct {
		a, b any
		want any
	}{
		{3, 4, 4},
		{4, 3, 4},
		{2.5, 1, 2.5}, // mixed operands → float64 result
		{-5, -2, -2},
	}
	for _, tt := range tests {
		if got := Max(tt.a, tt.b); got != tt.want {
			t.Errorf("Max(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestMod(t *testing.T) {
	tests := []struct {
		a, b any
		want int
	}{
		{10, 3, 1},
		{10, 5, 0},
		{10, 0, 0}, // Mod by zero returns 0
	}

	for _, tt := range tests {
		got := Mod(tt.a, tt.b)
		if got != tt.want {
			t.Errorf("Mod(%v, %v) = %v, want %v", tt.a, tt.b, got, tt.want)
		}
	}
}

func TestNeg(t *testing.T) {
	tests := []struct {
		a    any
		want any
	}{
		{5, -5},
		{-3, 3},
		{2.5, -2.5},
	}

	for _, tt := range tests {
		got := Neg(tt.a)
		if got != tt.want {
			t.Errorf("Neg(%v) = %v, want %v", tt.a, got, tt.want)
		}
	}
}

func TestLower(t *testing.T) {
	if got := Lower("HELLO"); got != "hello" {
		t.Errorf("Lower(HELLO) = %v, want hello", got)
	}
}

func TestUpper(t *testing.T) {
	if got := Upper("hello"); got != "HELLO" {
		t.Errorf("Upper(hello) = %v, want HELLO", got)
	}
}

func TestTrim(t *testing.T) {
	if got := Trim("  hello  "); got != "hello" {
		t.Errorf("Trim(  hello  ) = %v, want hello", got)
	}
}

func TestContains(t *testing.T) {
	if !Contains("hello world", "world") {
		t.Error("Contains(hello world, world) should be true")
	}
	if Contains("hello world", "foo") {
		t.Error("Contains(hello world, foo) should be false")
	}
}

func TestJoin(t *testing.T) {
	items := []string{"a", "b", "c"}
	if got := Join(items, ", "); got != "a, b, c" {
		t.Errorf("Join(%v, ', ') = %v, want 'a, b, c'", items, got)
	}
}

func TestSplit(t *testing.T) {
	// Round-trips with Join so the slice is observable.
	if got := Join(Split("a,b,c", ","), "|"); got != "a|b|c" {
		t.Errorf(`Split("a,b,c", ",") joined = %v, want a|b|c`, got)
	}
	// JS keeps trailing empty fields (Perl's bare split drops them —
	// the `bf->split` helper passes -1 to match this).
	if got := Split("a,", ","); len(got) != 2 || got[0] != "a" || got[1] != "" {
		t.Errorf(`Split("a,", ",") = %v, want ["a" ""]`, got)
	}
	// Empty separator splits into individual characters.
	if got := Join(Split("abc", ""), "-"); got != "a-b-c" {
		t.Errorf(`Split("abc", "") joined = %v, want a-b-c`, got)
	}
	// No separator match → single-element slice (the whole string).
	if got := Split("abc", ","); len(got) != 1 || got[0] != "abc" {
		t.Errorf(`Split("abc", ",") = %v, want ["abc"]`, got)
	}
	// Empty input: non-empty separator → single empty field; empty
	// separator → empty slice. Both match JS (and the `bf->split`
	// helper special-cases Perl, whose `split` diverges here).
	if got := Split("", ","); len(got) != 1 || got[0] != "" {
		t.Errorf(`Split("", ",") = %v, want [""]`, got)
	}
	if got := Split("", ""); len(got) != 0 {
		t.Errorf(`Split("", "") = %v, want []`, got)
	}
	// Optional limit caps the pieces (JS `split(sep, limit)`).
	if got := Split("a,b,c,d", ",", 2); len(got) != 2 || got[0] != "a" || got[1] != "b" {
		t.Errorf(`Split("a,b,c,d", ",", 2) = %v, want ["a" "b"]`, got)
	}
	// limit 0 → empty; limit >= len or negative → all pieces.
	if got := Split("a,b", ",", 0); len(got) != 0 {
		t.Errorf(`Split("a,b", ",", 0) = %v, want []`, got)
	}
	if got := Split("a,b", ",", 9); len(got) != 2 {
		t.Errorf(`Split("a,b", ",", 9) = %v, want 2 pieces`, got)
	}
	if got := Split("a,b", ",", -1); len(got) != 2 {
		t.Errorf(`Split("a,b", ",", -1) = %v, want 2 pieces (negative = all)`, got)
	}
}

func TestStartsWith(t *testing.T) {
	if !StartsWith("hello world", "hello") {
		t.Error(`StartsWith("hello world", "hello") should be true`)
	}
	if StartsWith("hello world", "world") {
		t.Error(`StartsWith("hello world", "world") should be false`)
	}
	if !StartsWith("anything", "") {
		t.Error(`StartsWith(_, "") should be true (empty prefix)`)
	}
	// Optional position re-anchors the test (JS `startsWith(p, pos)`).
	if !StartsWith("abc", "b", 1) {
		t.Error(`StartsWith("abc", "b", 1) should be true`)
	}
	if StartsWith("abc", "a", 1) {
		t.Error(`StartsWith("abc", "a", 1) should be false`)
	}
	// Position clamps to [0, len] — out-of-range never panics.
	if StartsWith("abc", "a", 99) {
		t.Error(`StartsWith("abc", "a", 99) should be false (clamped to len)`)
	}
	if !StartsWith("abc", "a", -5) {
		t.Error(`StartsWith("abc", "a", -5) should be true (clamped to 0)`)
	}
}

func TestEndsWith(t *testing.T) {
	if !EndsWith("hello world", "world") {
		t.Error(`EndsWith("hello world", "world") should be true`)
	}
	if EndsWith("hello world", "hello") {
		t.Error(`EndsWith("hello world", "hello") should be false`)
	}
	if !EndsWith("anything", "") {
		t.Error(`EndsWith(_, "") should be true (empty suffix)`)
	}
	// A suffix longer than the string is false (no panic).
	if EndsWith("hi", "longer-than-string") {
		t.Error(`EndsWith("hi", "longer-than-string") should be false`)
	}
	// Optional endPosition treats the string as that many bytes long
	// (JS `endsWith(s, endPos)`).
	if !EndsWith("abc", "b", 2) {
		t.Error(`EndsWith("abc", "b", 2) should be true`)
	}
	if EndsWith("abc", "c", 2) {
		t.Error(`EndsWith("abc", "c", 2) should be false`)
	}
	// endPosition clamps to [0, len] — out-of-range never panics.
	if !EndsWith("abc", "c", 99) {
		t.Error(`EndsWith("abc", "c", 99) should be true (clamped to len)`)
	}
	if EndsWith("abc", "a", -1) {
		t.Error(`EndsWith("abc", "a", -1) should be false (clamped to 0 → empty)`)
	}
}

func TestReplace(t *testing.T) {
	// Only the FIRST occurrence is replaced (JS string-pattern
	// semantics — not `.replaceAll`).
	if got := Replace("hello world", "o", "0"); got != "hell0 world" {
		t.Errorf(`Replace("hello world", "o", "0") = %q, want "hell0 world"`, got)
	}
	// No match → unchanged.
	if got := Replace("abc", "z", "Z"); got != "abc" {
		t.Errorf(`Replace("abc", "z", "Z") = %q, want "abc"`, got)
	}
	// Empty pattern inserts at the front (JS + Go parity).
	if got := Replace("abc", "", "X"); got != "Xabc" {
		t.Errorf(`Replace("abc", "", "X") = %q, want "Xabc"`, got)
	}
	// Replacement is literal — `$1` / `$&` are NOT interpreted.
	if got := Replace("ab", "a", "$&"); got != "$&b" {
		t.Errorf(`Replace("ab", "a", "$&") = %q, want "$&b" (literal)`, got)
	}
}

func TestRepeat(t *testing.T) {
	if got := Repeat("ab", 3); got != "ababab" {
		t.Errorf(`Repeat("ab", 3) = %q, want "ababab"`, got)
	}
	if got := Repeat("x", 1); got != "x" {
		t.Errorf(`Repeat("x", 1) = %q, want "x"`, got)
	}
	// Zero and negative counts → "" (negative would panic strings.Repeat).
	if got := Repeat("ab", 0); got != "" {
		t.Errorf(`Repeat("ab", 0) = %q, want ""`, got)
	}
	if got := Repeat("ab", -2); got != "" {
		t.Errorf(`Repeat("ab", -2) = %q, want "" (clamped, no panic)`, got)
	}
}

func TestPadStart(t *testing.T) {
	if got := PadStart("42", 5, "0"); got != "00042" {
		t.Errorf(`PadStart("42", 5, "0") = %q, want "00042"`, got)
	}
	// Default pad is a single space when omitted.
	if got := PadStart("42", 5); got != "   42" {
		t.Errorf(`PadStart("42", 5) = %q, want "   42"`, got)
	}
	// Multi-char pad is repeated then truncated to fill.
	if got := PadStart("x", 5, "ab"); got != "ababx" {
		t.Errorf(`PadStart("x", 5, "ab") = %q, want "ababx"`, got)
	}
	// Already >= target → unchanged. Empty pad → unchanged.
	if got := PadStart("hello", 3, "0"); got != "hello" {
		t.Errorf(`PadStart("hello", 3, "0") = %q, want "hello"`, got)
	}
	if got := PadStart("42", 5, ""); got != "42" {
		t.Errorf(`PadStart("42", 5, "") = %q, want "42"`, got)
	}
}

func TestPadEnd(t *testing.T) {
	if got := PadEnd("42", 5, "."); got != "42..." {
		t.Errorf(`PadEnd("42", 5, ".") = %q, want "42..."`, got)
	}
	if got := PadEnd("42", 5); got != "42   " {
		t.Errorf(`PadEnd("42", 5) = %q, want "42   "`, got)
	}
	if got := PadEnd("x", 5, "ab"); got != "xabab" {
		t.Errorf(`PadEnd("x", 5, "ab") = %q, want "xabab"`, got)
	}
}

func TestLen(t *testing.T) {
	tests := []struct {
		v    any
		want int
	}{
		{[]int{1, 2, 3}, 3},
		{[]string{}, 0},
		{"hello", 5},
		{nil, 0},
		{map[string]int{"a": 1, "b": 2}, 2},
	}

	for _, tt := range tests {
		got := Len(tt.v)
		if got != tt.want {
			t.Errorf("Len(%v) = %v, want %v", tt.v, got, tt.want)
		}
	}
}

func TestAt(t *testing.T) {
	items := []string{"a", "b", "c", "d"}

	tests := []struct {
		index int
		want  any
	}{
		{0, "a"},
		{1, "b"},
		{-1, "d"},  // Last element
		{-2, "c"},  // Second to last
		{10, nil},  // Out of bounds
		{-10, nil}, // Out of bounds
	}

	for _, tt := range tests {
		got := At(items, tt.index)
		if got != tt.want {
			t.Errorf("At(items, %v) = %v, want %v", tt.index, got, tt.want)
		}
	}
}

func TestIncludes(t *testing.T) {
	items := []int{1, 2, 3, 4, 5}

	if !Includes(items, 3) {
		t.Error("Includes(items, 3) should be true")
	}
	if Includes(items, 10) {
		t.Error("Includes(items, 10) should be false")
	}
}

// IndexOf / LastIndexOf — `Array.prototype.indexOf` /
// `Array.prototype.lastIndexOf` lowering (#1448 Tier A). Value-
// equality via DeepEqual; non-array receivers return -1.
func TestIndexOf(t *testing.T) {
	items := []string{"a", "b", "c", "b", "d"}
	if got := IndexOf(items, "b"); got != 1 {
		t.Errorf("IndexOf(items, b) = %d, want 1", got)
	}
	if got := IndexOf(items, "z"); got != -1 {
		t.Errorf("IndexOf(items, z) = %d, want -1", got)
	}
	if got := IndexOf([]int{1, 2, 3}, 2); got != 1 {
		t.Errorf("IndexOf([1,2,3], 2) = %d, want 1", got)
	}
	if got := IndexOf("not an array", "n"); got != -1 {
		t.Errorf("IndexOf(string, ...) = %d, want -1 (non-array)", got)
	}
}

func TestLastIndexOf(t *testing.T) {
	items := []string{"a", "b", "c", "b", "d"}
	// `LastIndexOf` must walk backward — pinning a non-final
	// last-match position so a forward-walking implementation can't
	// pass the assertion.
	if got := LastIndexOf(items, "b"); got != 3 {
		t.Errorf("LastIndexOf(items, b) = %d, want 3", got)
	}
	if got := LastIndexOf(items, "z"); got != -1 {
		t.Errorf("LastIndexOf(items, z) = %d, want -1", got)
	}
	if got := LastIndexOf([]int{}, 0); got != -1 {
		t.Errorf("LastIndexOf([], 0) = %d, want -1", got)
	}
}

// `Array.prototype.concat(other)` lowering (#1448 Tier A). Order is
// preserved (receiver first, then `other`'s elements); non-array
// operands collapse to empty.
func TestConcat(t *testing.T) {
	got := Concat([]string{"a", "b"}, []string{"c", "d"})
	if len(got) != 4 || got[0] != "a" || got[3] != "d" {
		t.Errorf("Concat([a,b], [c,d]) = %v, want [a b c d]", got)
	}

	mixed := Concat([]any{1, "two"}, []int{3, 4})
	if len(mixed) != 4 {
		t.Errorf("Concat mixed types: got length %d, want 4", len(mixed))
	}

	if got := Concat(nil, []string{"a"}); len(got) != 1 || got[0] != "a" {
		t.Errorf("Concat(nil, [a]) = %v, want [a]", got)
	}
	if got := Concat([]string{"a"}, "not an array"); len(got) != 1 || got[0] != "a" {
		t.Errorf("Concat([a], scalar) = %v, want [a]", got)
	}
	if got := Concat([]string{}, []string{}); len(got) != 0 {
		t.Errorf("Concat([], []) = %v, want []", got)
	}
}

// `Array.prototype.slice(start, end?)` lowering (#1448 Tier A). The
// helper accepts the variadic `end` arg from Go template's call
// dispatcher; an absent `end` means "to length".
func TestSlice(t *testing.T) {
	items := []string{"a", "b", "c", "d", "e"}

	// 2-arg form.
	got := Slice(items, 1, 3).([]any)
	if len(got) != 2 || got[0] != "b" || got[1] != "c" {
		t.Errorf("Slice(items, 1, 3) = %v, want [b c]", got)
	}

	// 1-arg form (`end` absent = length).
	got = Slice(items, 2).([]any)
	if len(got) != 3 || got[0] != "c" || got[2] != "e" {
		t.Errorf("Slice(items, 2) = %v, want [c d e]", got)
	}

	// Negative-index normalisation.
	got = Slice(items, -2).([]any)
	if len(got) != 2 || got[0] != "d" || got[1] != "e" {
		t.Errorf("Slice(items, -2) = %v, want [d e]", got)
	}
	got = Slice(items, 0, -1).([]any)
	if len(got) != 4 || got[3] != "d" {
		t.Errorf("Slice(items, 0, -1) = %v, want [a b c d]", got)
	}

	// Clamping (out-of-bounds + start >= end).
	got = Slice(items, 100).([]any)
	if len(got) != 0 {
		t.Errorf("Slice(items, 100) = %v, want []", got)
	}
	got = Slice(items, 3, 1).([]any)
	if len(got) != 0 {
		t.Errorf("Slice(items, 3, 1) = %v, want []", got)
	}

	// Non-array, non-string receiver: empty-array fallback.
	if got := Slice(42, 0, 2).([]any); len(got) != 0 {
		t.Errorf("Slice(42, 0, 2) = %v, want []", got)
	}
}

// `String.prototype.slice(start, end?)` lowering — the `string-slice`
// divergence (a string receiver used to fall into the array branch
// and return an empty `[]any`). Mirrors `TestSlice` shape-for-shape
// with a string receiver instead of a slice.
func TestSlice_String(t *testing.T) {
	word := "barefootjs"

	if got := Slice(word, 0, 4); got != "bare" {
		t.Errorf("Slice(%q, 0, 4) = %v, want %q", word, got, "bare")
	}
	// Negative start.
	if got := Slice(word, -4); got != "otjs" {
		t.Errorf("Slice(%q, -4) = %v, want %q", word, got, "otjs")
	}
	// Zero-arg-end (`end` absent = length).
	if got := Slice(word, 4); got != "footjs" {
		t.Errorf("Slice(%q, 4) = %v, want %q", word, got, "footjs")
	}
	// Clamping (start >= end).
	if got := Slice(word, 5, 2); got != "" {
		t.Errorf("Slice(%q, 5, 2) = %v, want empty string", word, got)
	}
	// Multi-byte runes: index by code point, not byte offset.
	if got := Slice("héllo", 0, 2); got != "hé" {
		t.Errorf(`Slice("héllo", 0, 2) = %v, want "hé"`, got)
	}
}

// `Array.prototype.reverse()` / `toReversed()` lowering (#1448 Tier A).
// Both shapes share the runtime helper — SSR template context makes
// the JS mutate-vs-new distinction immaterial.
func TestReverse(t *testing.T) {
	got := Reverse([]string{"a", "b", "c"})
	if len(got) != 3 || got[0] != "c" || got[1] != "b" || got[2] != "a" {
		t.Errorf("Reverse([a,b,c]) = %v, want [c b a]", got)
	}

	if got := Reverse([]int{}); len(got) != 0 {
		t.Errorf("Reverse([]) = %v, want []", got)
	}

	// Single-element edge case — same input, distinct slice.
	one := []string{"only"}
	got2 := Reverse(one)
	if len(got2) != 1 || got2[0] != "only" {
		t.Errorf("Reverse([only]) = %v, want [only]", got2)
	}

	// Mutation isolation: input must survive.
	src := []string{"a", "b"}
	_ = Reverse(src)
	if src[0] != "a" || src[1] != "b" {
		t.Errorf("Reverse mutated input slice: %v", src)
	}

	// Non-array receiver.
	if got := Reverse("not an array"); len(got) != 0 {
		t.Errorf("Reverse(scalar) = %v, want []", got)
	}
}

// String receiver covers `String.prototype.includes(sub)` (#1448 Tier A).
// Both array and string `.includes` lower to the same `bf_includes` call;
// this helper dispatches on `reflect.Kind()` at evaluation time.
func TestIncludes_StringReceiver(t *testing.T) {
	cases := []struct {
		name   string
		recv   any
		needle any
		want   bool
	}{
		{"present", "hello world", "world", true},
		{"absent", "hello world", "earth", false},
		{"empty needle matches", "hello", "", true},
		{"empty receiver", "", "x", false},
		{"non-string needle stringified", "value=42", 42, true},
		{"unsupported receiver (map) returns false", map[string]int{"a": 1}, "a", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := Includes(c.recv, c.needle); got != c.want {
				t.Errorf("Includes(%v, %v) = %v, want %v", c.recv, c.needle, got, c.want)
			}
		})
	}
}

// TestIncludes_SameValueZero pins the element-search equality used by
// the slice/array branch of `Includes` to SameValueZero — the same
// algorithm the evaluator's `evalIncludes`/`evalSameValueZero` (eval.go)
// use for the serialized-callback path. Before this, the template-position
// `Includes` used `reflect.DeepEqual`, which is type-strict (never treats
// `int` and `float64` as equal, unlike JS's single "number" type) and never
// matches NaN to NaN; these cases pin the two places that diverge from JS
// `Array.prototype.includes` (and from the evaluator) under DeepEqual.
func TestIncludes_SameValueZero(t *testing.T) {
	// int 2 vs float64 2: DeepEqual says false, SameValueZero (and JS) say true.
	if !Includes([]any{2}, float64(2)) {
		t.Error(`Includes([]any{2}, float64(2)) should be true (SameValueZero: cross-numeric-type match)`)
	}
	// NaN.includes(NaN): DeepEqual on floats uses ==, which is false for
	// NaN; SameValueZero (and JS `.includes`) treat NaN as matching itself.
	nan := math.NaN()
	if !Includes([]any{nan}, nan) {
		t.Error(`Includes([]any{NaN}, NaN) should be true (SameValueZero: NaN matches NaN)`)
	}
	// [2].includes("2"): SameValueZero (and JS) never coerce across types,
	// so a string needle must not match a numeric element.
	if Includes([]any{2}, "2") {
		t.Error(`Includes([]any{2}, "2") should be false (SameValueZero: no cross-type coercion)`)
	}
}

func TestFirst(t *testing.T) {
	items := []string{"a", "b", "c"}
	if got := First(items); got != "a" {
		t.Errorf("First(items) = %v, want 'a'", got)
	}

	empty := []string{}
	if got := First(empty); got != nil {
		t.Errorf("First(empty) = %v, want nil", got)
	}
}

func TestLast(t *testing.T) {
	items := []string{"a", "b", "c"}
	if got := Last(items); got != "c" {
		t.Errorf("Last(items) = %v, want 'c'", got)
	}

	empty := []string{}
	if got := Last(empty); got != nil {
		t.Errorf("Last(empty) = %v, want nil", got)
	}
}

// =============================================================================
// Array literal + truthy filter (#1443)
// =============================================================================

func TestArr_VariadicCollectsArgs(t *testing.T) {
	got := Arr("a", "b", 3)
	if len(got) != 3 || got[0] != "a" || got[1] != "b" || got[2] != 3 {
		t.Errorf("Arr(\"a\", \"b\", 3) = %v, want [\"a\", \"b\", 3]", got)
	}
}

func TestArr_Empty(t *testing.T) {
	got := Arr()
	if len(got) != 0 {
		t.Errorf("Arr() = %v, want []", got)
	}
}

func TestFilterTruthy_DropsJSFalsyValues(t *testing.T) {
	// The full JS Boolean(x) falsy set: false, 0, "", nil. Anything
	// else (including the empty slice/map and a struct{}) is truthy.
	input := []any{"a", "", nil, false, 0, "b", true, 3.14}
	got := FilterTruthy(input)
	want := []any{"a", "b", true, 3.14}
	if len(got) != len(want) {
		t.Fatalf("FilterTruthy: got %v (len %d), want %v (len %d)", got, len(got), want, len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("FilterTruthy[%d] = %v, want %v", i, got[i], want[i])
		}
	}
}

func TestFilterTruthy_NaNIsFalsy(t *testing.T) {
	// `Boolean(NaN)` is false in JS — mirror that explicitly so JSON
	// round-trips through `bf_number` don't sneak NaN through as a
	// truthy float.
	nan := math.NaN()
	got := FilterTruthy([]any{1.0, nan, 2.0})
	if len(got) != 2 {
		t.Errorf("FilterTruthy([1, NaN, 2]) = %v, want [1, 2]", got)
	}
}

func TestFilterTruthy_Float32NaNIsFalsy(t *testing.T) {
	// JS `Boolean(NaN)` is false regardless of float width. Pre-fix
	// the float32 arm didn't check IsNaN and treated NaN as truthy
	// (Copilot review on #1445).
	var nan32 float32 = float32(math.NaN())
	got := FilterTruthy([]any{float32(1.0), nan32, float32(2.0)})
	if len(got) != 2 {
		t.Errorf("FilterTruthy([f32 1, f32 NaN, f32 2]) = %v, want [1, 2]", got)
	}
}

func TestJoin_AcceptsFixedArray(t *testing.T) {
	// JS `Array.prototype.join` doesn't distinguish slice / array;
	// `bf_join` should accept fixed-size Go arrays too (Copilot
	// review on #1445). Pre-fix this returned "" for any non-slice.
	arr := [3]string{"a", "b", "c"}
	if got := Join(arr, ","); got != "a,b,c" {
		t.Errorf("Join(fixed array, ',') = %q, want 'a,b,c'", got)
	}
}

func TestFilterTruthy_NilSliceReturnsNil(t *testing.T) {
	if got := FilterTruthy(nil); got != nil {
		t.Errorf("FilterTruthy(nil) = %v, want nil", got)
	}
}

// End-to-end shape that the #1443 registry-Slot fix relies on: the
// chain `[className, childClass].filter(Boolean).join(' ')` lowers to
// `(bf_join (bf_filter_truthy (bf_arr .ClassName .ChildClass)) " ")`.
// Pin the composed behaviour so regressions in any one helper surface
// here, not just at adapter-conformance time.
func TestArrFilterTruthyJoin_RegistrySlotShape(t *testing.T) {
	got := Join(FilterTruthy(Arr("btn", "", "btn-primary", nil)), " ")
	want := "btn btn-primary"
	if got != want {
		t.Errorf("composed chain = %q, want %q", got, want)
	}
}

// =============================================================================
// Find / FindIndex Tests
// =============================================================================

type findItem struct {
	Id   int
	Name string
	Done bool
}

func TestFind_ByBooleanField(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A", Done: false},
		{Id: 2, Name: "B", Done: true},
		{Id: 3, Name: "C", Done: false},
	}

	got := Find(items, "done", true)
	if got == nil {
		t.Fatal("Find by bool: got nil, want item B")
	}
	if got.(findItem).Name != "B" {
		t.Errorf("Find by bool: got %v, want B", got.(findItem).Name)
	}
}

func TestFind_ByIntField(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A"},
		{Id: 2, Name: "B"},
		{Id: 3, Name: "C"},
	}

	got := Find(items, "id", 2)
	if got == nil {
		t.Fatal("Find by int: got nil, want item B")
	}
	if got.(findItem).Name != "B" {
		t.Errorf("Find by int: got %v, want B", got.(findItem).Name)
	}
}

func TestFind_NotFound(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A"},
	}

	got := Find(items, "id", 99)
	if got != nil {
		t.Errorf("Find not found: got %v, want nil", got)
	}
}

func TestFind_EmptySlice(t *testing.T) {
	var items []findItem
	got := Find(items, "id", 1)
	if got != nil {
		t.Errorf("Find empty: got %v, want nil", got)
	}
}

func TestFindIndex_Found(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A", Done: false},
		{Id: 2, Name: "B", Done: true},
		{Id: 3, Name: "C", Done: false},
	}

	got := FindIndex(items, "done", true)
	if got != 1 {
		t.Errorf("FindIndex found: got %d, want 1", got)
	}
}

func TestFindIndex_NotFound(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A"},
	}

	got := FindIndex(items, "id", 99)
	if got != -1 {
		t.Errorf("FindIndex not found: got %d, want -1", got)
	}
}

// =============================================================================
// FindLast / FindLastIndex Tests
// =============================================================================

func TestFindLast_ByBooleanField(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A", Done: true},
		{Id: 2, Name: "B", Done: false},
		{Id: 3, Name: "C", Done: true},
	}

	got := FindLast(items, "done", true)
	if got == nil {
		t.Fatal("FindLast by bool: got nil, want item C")
	}
	if got.(findItem).Name != "C" {
		t.Errorf("FindLast by bool: got %v, want C", got.(findItem).Name)
	}
}

func TestFindLast_ByIntField(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A"},
		{Id: 2, Name: "B"},
		{Id: 2, Name: "C"},
	}

	got := FindLast(items, "id", 2)
	if got == nil {
		t.Fatal("FindLast by int: got nil, want item C")
	}
	if got.(findItem).Name != "C" {
		t.Errorf("FindLast by int: got %v, want C", got.(findItem).Name)
	}
}

func TestFindLast_NotFound(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A"},
	}

	got := FindLast(items, "id", 99)
	if got != nil {
		t.Errorf("FindLast not found: got %v, want nil", got)
	}
}

func TestFindLast_EmptySlice(t *testing.T) {
	var items []findItem
	got := FindLast(items, "id", 1)
	if got != nil {
		t.Errorf("FindLast empty: got %v, want nil", got)
	}
}

func TestFindLastIndex_Found(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A", Done: true},
		{Id: 2, Name: "B", Done: false},
		{Id: 3, Name: "C", Done: true},
	}

	got := FindLastIndex(items, "done", true)
	if got != 2 {
		t.Errorf("FindLastIndex found: got %d, want 2", got)
	}
}

func TestFindLastIndex_NotFound(t *testing.T) {
	items := []findItem{
		{Id: 1, Name: "A"},
	}

	got := FindLastIndex(items, "id", 99)
	if got != -1 {
		t.Errorf("FindLastIndex not found: got %d, want -1", got)
	}
}

func TestComment(t *testing.T) {
	got := Comment("cond-start:slot_0")
	want := "<!--bf-cond-start:slot_0-->"
	if string(got) != want {
		t.Errorf("Comment(cond-start:slot_0) = %v, want %v", got, want)
	}
}

func TestTextMarkers(t *testing.T) {
	gotStart := TextStart("s0")
	wantStart := "<!--bf:s0-->"
	if string(gotStart) != wantStart {
		t.Errorf("TextStart(s0) = %v, want %v", gotStart, wantStart)
	}

	gotEnd := TextEnd()
	wantEnd := "<!--/-->"
	if string(gotEnd) != wantEnd {
		t.Errorf("TextEnd() = %v, want %v", gotEnd, wantEnd)
	}
}

func TestFuncMap(t *testing.T) {
	fm := FuncMap()

	// Check that all expected functions are present
	expectedFuncs := []string{
		"bf_add", "bf_sub", "bf_mul", "bf_div", "bf_mod", "bf_neg",
		"bf_lower", "bf_upper", "bf_trim", "bf_contains", "bf_join",
		"bf_len", "bf_at", "bf_includes", "bf_first", "bf_last",
		"bf_arr", "bf_filter_truthy", "bf_ternary", "bf_truthy",
		"bf_every", "bf_some", "bf_filter", "bf_find", "bf_find_index", "bf_sort",
		"bf_sort_eval", "bf_reduce_eval", "bf_env",
		"bf_filter_eval", "bf_every_eval", "bf_some_eval",
		"bf_find_eval", "bf_find_index_eval", "bf_flat_map_eval",
		"bfComment", "bfTextStart", "bfTextEnd", "bfPortalHTML",
	}

	for _, name := range expectedFuncs {
		if _, ok := fm[name]; !ok {
			t.Errorf("FuncMap missing function: %s", name)
		}
	}
}

func TestEnv(t *testing.T) {
	env := Env("factor", 2, "label", "x")
	if env["factor"] != 2 || env["label"] != "x" {
		t.Fatalf("Env built wrong map: %v", env)
	}
	if got := Env(); len(got) != 0 {
		t.Fatalf("Env() with no pairs should be empty, got %v", got)
	}
	if got := Env("k"); len(got) != 0 {
		t.Fatalf("Env with a dangling key should drop it, got %v", got)
	}
	// A non-string key (only reachable by a malformed template call) is
	// skipped, not collapsed into an `env[""]` slot.
	if got := Env(42, "v", "real", 7); len(got) != 1 || got["real"] != 7 {
		t.Fatalf("Env should skip a non-string key, got %v", got)
	}
}

// End-to-end wiring of the #2018 evaluator-driven folds through the template
// FuncMap, driven by the exact JSON `serializeParsedExpr` emits for the callback
// body — proves the P1 path from template call (`bf_sort_eval` / `bf_reduce_eval`
// / `bf_env`) to result, including a captured free var in base_env.
func TestEvalTemplateFuncs(t *testing.T) {
	fm := FuncMap()
	items := []any{
		map[string]any{"price": 3.0},
		map[string]any{"price": 1.0},
		map[string]any{"price": 2.0},
	}

	// sort: a.price - b.price → ascending by price, no captures.
	cmp := mustJSON(t, nbin("-", nmem(nid("a"), "price"), nmem(nid("b"), "price")))
	sortTmpl := template.Must(template.New("s").Funcs(fm).Parse(
		`{{range bf_sort_eval .Items .Cmp "a" "b" bf_env}}{{.price}} {{end}}`))
	var sb strings.Builder
	if err := sortTmpl.Execute(&sb, map[string]any{"Items": items, "Cmp": cmp}); err != nil {
		t.Fatalf("sort tmpl: %v", err)
	}
	if got := sb.String(); got != "1 2 3 " {
		t.Fatalf("bf_sort_eval = %q, want %q", got, "1 2 3 ")
	}

	// reduce: acc + item.price, init 0 → sum 6.
	body := mustJSON(t, nbin("+", nid("acc"), nmem(nid("item"), "price")))
	redTmpl := template.Must(template.New("r").Funcs(fm).Parse(
		`{{bf_reduce_eval .Items .Body "acc" "item" 0.0 "left" bf_env}}`))
	sb.Reset()
	if err := redTmpl.Execute(&sb, map[string]any{"Items": items, "Body": body}); err != nil {
		t.Fatalf("reduce tmpl: %v", err)
	}
	if got := sb.String(); got != "6" {
		t.Fatalf("bf_reduce_eval = %q, want %q", got, "6")
	}

	// captured free var: comparator reads `factor` from base_env (bf_env).
	cmp2 := mustJSON(t, nbin("-",
		nbin("*", nmem(nid("a"), "price"), nid("factor")),
		nbin("*", nmem(nid("b"), "price"), nid("factor"))))
	capTmpl := template.Must(template.New("c").Funcs(fm).Parse(
		`{{range bf_sort_eval .Items .Cmp "a" "b" (bf_env "factor" .Factor)}}{{.price}} {{end}}`))
	sb.Reset()
	if err := capTmpl.Execute(&sb, map[string]any{"Items": items, "Cmp": cmp2, "Factor": 2.0}); err != nil {
		t.Fatalf("capture tmpl: %v", err)
	}
	if got := sb.String(); got != "1 2 3 " {
		t.Fatalf("bf_sort_eval w/ base_env = %q, want %q", got, "1 2 3 ")
	}
}

// SSR data is Go structs with capitalised fields, but a serialized callback
// body carries the JS field name (`x.id`). Verify the evaluator's field reader
// resolves it case-variantly against the struct field (ID) for both fold and
// sort — the path the real template render uses.
func TestEvalFoldSortOverStruct(t *testing.T) {
	type item struct{ ID int }
	items := []item{{ID: 10}, {ID: 5}, {ID: 7}}

	// reduce: acc + x.id, seed 0 → 22
	body := mustJSON(t, nbin("+", nid("acc"), nmem(nid("x"), "id")))
	if got := evalToNumber(FoldEval(items, body, "acc", "x", 0.0, "left", nil)); got != 22 {
		t.Fatalf("FoldEval over struct = %v, want 22", got)
	}

	// sort: a.id - b.id → ascending by ID
	cmp := mustJSON(t, nbin("-", nmem(nid("a"), "id"), nmem(nid("b"), "id")))
	sorted := SortEval(items, cmp, "a", "b", nil)
	got := make([]int, len(sorted))
	for i, s := range sorted {
		got[i] = s.(item).ID
	}
	if got[0] != 5 || got[1] != 7 || got[2] != 10 {
		t.Fatalf("SortEval over struct = %v, want [5 7 10]", got)
	}
}

// TestEvalFoldSortOverPascalKeyedMap reproduces the conformance render shape:
// an inline anonymous prop (`items: { duration: number }[]`) has no named Go
// struct, so the test harness emits `[]any{map[string]any{"Duration": 95}, …}`
// with PascalCase keys (test-render.ts goArrayLiteralFromArray, capitalizeKeys).
// The callback body carries the raw JS property (`t.duration`), so the map read
// must resolve `duration` → `Duration` case-insensitively — otherwise the field
// reads as null and the fold collapses to its seed (#2030 reduce-sum-field).
func TestEvalFoldSortOverPascalKeyedMap(t *testing.T) {
	items := []any{
		map[string]any{"Duration": 95.0},
		map[string]any{"Duration": 213.0},
		map[string]any{"Duration": 185.0},
	}

	// reduce: sum + t.duration, seed 0 → 493
	body := mustJSON(t, nbin("+", nid("sum"), nmem(nid("t"), "duration")))
	if got := evalToNumber(FoldEval(items, body, "sum", "t", 0.0, "left", nil)); got != 493 {
		t.Fatalf("FoldEval over PascalCase-keyed map = %v, want 493", got)
	}

	// sort: a.duration - b.duration → ascending
	cmp := mustJSON(t, nbin("-", nmem(nid("a"), "duration"), nmem(nid("b"), "duration")))
	sorted := SortEval(items, cmp, "a", "b", nil)
	got := make([]float64, len(sorted))
	for i, s := range sorted {
		got[i] = s.(map[string]any)["Duration"].(float64)
	}
	if got[0] != 95 || got[1] != 185 || got[2] != 213 {
		t.Fatalf("SortEval over PascalCase-keyed map = %v, want [95 185 213]", got)
	}
}

// =============================================================================
// Portal HTML Rendering Tests
// =============================================================================

func TestPortalHTML_Static(t *testing.T) {
	result := PortalHTML(nil, "<div>Hello</div>")
	expected := template.HTML("<div>Hello</div>")
	if result != expected {
		t.Errorf("PortalHTML static = %q, want %q", result, expected)
	}
}

func TestPortalHTML_Dynamic(t *testing.T) {
	data := struct {
		Name string
	}{Name: "World"}

	result := PortalHTML(data, "<div>Hello {{.Name}}</div>")
	expected := template.HTML("<div>Hello World</div>")
	if result != expected {
		t.Errorf("PortalHTML dynamic = %q, want %q", result, expected)
	}
}

func TestPortalHTML_Conditional(t *testing.T) {
	data := struct {
		Open bool
	}{Open: true}

	result := PortalHTML(data, `<div data-state="{{if .Open}}open{{else}}closed{{end}}"></div>`)
	expected := template.HTML(`<div data-state="open"></div>`)
	if result != expected {
		t.Errorf("PortalHTML conditional = %q, want %q", result, expected)
	}

	// Test with Open = false
	data.Open = false
	result = PortalHTML(data, `<div data-state="{{if .Open}}open{{else}}closed{{end}}"></div>`)
	expected = template.HTML(`<div data-state="closed"></div>`)
	if result != expected {
		t.Errorf("PortalHTML conditional (false) = %q, want %q", result, expected)
	}
}

func TestPortalHTML_InvalidTemplate(t *testing.T) {
	result := PortalHTML(nil, "{{.Unclosed")
	// Should return error comment instead of panicking
	if !contains(string(result), "bfPortalHTML error") {
		t.Errorf("PortalHTML invalid template should return error comment, got %q", result)
	}
}

// =============================================================================
// Portal Collection Tests
// =============================================================================

func TestNewPortalCollector(t *testing.T) {
	pc := NewPortalCollector()
	if pc == nil {
		t.Error("NewPortalCollector() returned nil")
	}
	if len(pc.portals) != 0 {
		t.Errorf("NewPortalCollector() should have empty portals, got %d", len(pc.portals))
	}
	if pc.counter != 0 {
		t.Errorf("NewPortalCollector() counter should be 0, got %d", pc.counter)
	}
}

func TestPortalCollector_Add(t *testing.T) {
	pc := NewPortalCollector()

	// Add first portal
	result := pc.Add("scope-1", "<div>Content 1</div>")
	if result != "" {
		t.Errorf("Add() should return empty string, got %q", result)
	}
	if len(pc.portals) != 1 {
		t.Errorf("After first Add(), portals count should be 1, got %d", len(pc.portals))
	}
	if pc.portals[0].ID != "bf-portal-1" {
		t.Errorf("First portal ID should be 'bf-portal-1', got %q", pc.portals[0].ID)
	}
	if pc.portals[0].OwnerID != "scope-1" {
		t.Errorf("First portal OwnerID should be 'scope-1', got %q", pc.portals[0].OwnerID)
	}

	// Add second portal
	pc.Add("scope-2", "<div>Content 2</div>")
	if len(pc.portals) != 2 {
		t.Errorf("After second Add(), portals count should be 2, got %d", len(pc.portals))
	}
	if pc.portals[1].ID != "bf-portal-2" {
		t.Errorf("Second portal ID should be 'bf-portal-2', got %q", pc.portals[1].ID)
	}
}

func TestPortalCollector_Render_Empty(t *testing.T) {
	pc := NewPortalCollector()
	result := pc.Render()
	if result != "" {
		t.Errorf("Render() on empty collector should return empty string, got %q", result)
	}
}

func TestPortalCollector_Render_Nil(t *testing.T) {
	var pc *PortalCollector
	result := pc.Render()
	if result != "" {
		t.Errorf("Render() on nil collector should return empty string, got %q", result)
	}
}

func TestPortalCollector_Render_Single(t *testing.T) {
	pc := NewPortalCollector()
	pc.Add("scope-abc", "<div>Portal Content</div>")

	result := string(pc.Render())
	expected := `<div bf-pi="bf-portal-1" bf-po="scope-abc"><div>Portal Content</div></div>` + "\n"
	if result != expected {
		t.Errorf("Render() = %q, want %q", result, expected)
	}
}

func TestPortalCollector_Render_Multiple(t *testing.T) {
	pc := NewPortalCollector()
	pc.Add("scope-1", "<div>Content 1</div>")
	pc.Add("scope-2", "<span>Content 2</span>")

	result := string(pc.Render())

	// Check that both portals are rendered
	if !contains(result, `bf-pi="bf-portal-1"`) {
		t.Error("Render() should contain first portal ID")
	}
	if !contains(result, `bf-pi="bf-portal-2"`) {
		t.Error("Render() should contain second portal ID")
	}
	if !contains(result, `bf-po="scope-1"`) {
		t.Error("Render() should contain first portal owner")
	}
	if !contains(result, `bf-po="scope-2"`) {
		t.Error("Render() should contain second portal owner")
	}
	if !contains(result, "<div>Content 1</div>") {
		t.Error("Render() should contain first portal content")
	}
	if !contains(result, "<span>Content 2</span>") {
		t.Error("Render() should contain second portal content")
	}
}

// helper function for string contains check
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

// =============================================================================
// Sort Tests
// =============================================================================

type sortItem struct {
	Name     string
	Priority int
	Price    float64
}

func TestSort_AscendingByInt(t *testing.T) {
	items := []sortItem{
		{Name: "C", Priority: 3},
		{Name: "A", Priority: 1},
		{Name: "B", Priority: 2},
	}

	result := Sort(items, "field", "Priority", "numeric", "asc")

	if len(result) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(result))
	}
	if result[0].(sortItem).Name != "A" {
		t.Errorf("Sort asc: first item = %v, want A", result[0].(sortItem).Name)
	}
	if result[1].(sortItem).Name != "B" {
		t.Errorf("Sort asc: second item = %v, want B", result[1].(sortItem).Name)
	}
	if result[2].(sortItem).Name != "C" {
		t.Errorf("Sort asc: third item = %v, want C", result[2].(sortItem).Name)
	}
}

func TestSort_DescendingByInt(t *testing.T) {
	items := []sortItem{
		{Name: "A", Priority: 1},
		{Name: "C", Priority: 3},
		{Name: "B", Priority: 2},
	}

	result := Sort(items, "field", "Priority", "numeric", "desc")

	if len(result) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(result))
	}
	if result[0].(sortItem).Name != "C" {
		t.Errorf("Sort desc: first item = %v, want C", result[0].(sortItem).Name)
	}
	if result[2].(sortItem).Name != "A" {
		t.Errorf("Sort desc: last item = %v, want A", result[2].(sortItem).Name)
	}
}

func TestSort_ByFloat(t *testing.T) {
	items := []sortItem{
		{Name: "Expensive", Price: 99.99},
		{Name: "Cheap", Price: 9.99},
		{Name: "Mid", Price: 49.99},
	}

	result := Sort(items, "field", "Price", "numeric", "asc")

	if len(result) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(result))
	}
	if result[0].(sortItem).Name != "Cheap" {
		t.Errorf("Sort by float asc: first = %v, want Cheap", result[0].(sortItem).Name)
	}
	if result[2].(sortItem).Name != "Expensive" {
		t.Errorf("Sort by float asc: last = %v, want Expensive", result[2].(sortItem).Name)
	}
}

func TestSort_EmptySlice(t *testing.T) {
	var items []sortItem
	result := Sort(items, "field", "Priority", "numeric", "asc")

	if result == nil {
		t.Error("Sort of empty slice should return empty slice, not nil")
	}
	if len(result) != 0 {
		t.Errorf("Sort of empty slice returned %d items, want 0", len(result))
	}
}

func TestSort_NilSlice(t *testing.T) {
	result := Sort(nil, "field", "Priority", "numeric", "asc")

	if result != nil {
		t.Errorf("Sort of nil should return nil, got %v", result)
	}
}

func TestSort_NonMutating(t *testing.T) {
	items := []sortItem{
		{Name: "C", Priority: 3},
		{Name: "A", Priority: 1},
		{Name: "B", Priority: 2},
	}

	Sort(items, "field", "Priority", "numeric", "asc")

	// Original slice should be unchanged
	if items[0].Name != "C" {
		t.Errorf("Sort mutated original: first = %v, want C", items[0].Name)
	}
}

// `(a, b) => a - b` on a primitive number array — the `keyKind=self`
// case introduced by #1448 Tier B. Pre-Tier-B `bf_sort` only handled
// struct-field comparisons.
func TestSort_PrimitiveNumeric(t *testing.T) {
	got := Sort([]int{3, 1, 2}, "self", "", "numeric", "asc")
	if len(got) != 3 || got[0] != 3-2 || got[1] != 2 || got[2] != 3 {
		// `got[0] != 3-2` is the literal 1; spelled as expression to
		// make the desc test below easy to read by symmetry.
		t.Errorf("Sort primitive numeric asc = %v, want [1 2 3]", got)
	}

	got = Sort([]int{1, 3, 2}, "self", "", "numeric", "desc")
	if len(got) != 3 || got[0] != 3 || got[1] != 2 || got[2] != 1 {
		t.Errorf("Sort primitive numeric desc = %v, want [3 2 1]", got)
	}
}

// `(a, b) => a.localeCompare(b)` (`compareType=string`).
func TestSort_PrimitiveString(t *testing.T) {
	got := Sort([]string{"charlie", "alice", "bob"}, "self", "", "string", "asc")
	if len(got) != 3 || got[0] != "alice" || got[1] != "bob" || got[2] != "charlie" {
		t.Errorf("Sort primitive string asc = %v, want [alice bob charlie]", got)
	}

	got = Sort([]string{"alice", "charlie", "bob"}, "self", "", "string", "desc")
	if len(got) != 3 || got[0] != "charlie" || got[1] != "bob" || got[2] != "alice" {
		t.Errorf("Sort primitive string desc = %v, want [charlie bob alice]", got)
	}
}

// `a.field.localeCompare(b.field)` — string compare on a struct field.
func TestSort_FieldString(t *testing.T) {
	items := []struct{ Name string }{{Name: "c"}, {Name: "a"}, {Name: "b"}}
	got := Sort(items, "field", "Name", "string", "asc")
	if len(got) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(got))
	}
	// `getFieldValue` extracts the `Name` field; cmp orders them.
	first := got[0].(struct{ Name string }).Name
	last := got[2].(struct{ Name string }).Name
	if first != "a" || last != "c" {
		t.Errorf("Sort field string asc = %v, want first=a last=c", got)
	}
}

// Multi-key (`||`-chain): a tie on the primary key falls through to
// the next. `(a,b) => a.Priority - b.Priority || a.Name.localeCompare(b.Name)`
// → two 4-string groups.
func TestSort_MultiKey_TieBreak(t *testing.T) {
	items := []sortItem{
		{Name: "b", Priority: 1},
		{Name: "a", Priority: 1},
		{Name: "c", Priority: 0},
	}
	got := Sort(items, "field", "Priority", "numeric", "asc", "field", "Name", "string", "asc")
	names := []string{got[0].(sortItem).Name, got[1].(sortItem).Name, got[2].(sortItem).Name}
	want := []string{"c", "a", "b"} // Priority 0 first; Priority-1 tie broken by Name asc
	for i := range want {
		if names[i] != want[i] {
			t.Errorf("multi-key sort = %v, want %v", names, want)
			break
		}
	}
}

// Multi-key with a descending secondary key: all primaries tie, so the
// secondary `Price desc` orders the result.
func TestSort_MultiKey_DescSecondary(t *testing.T) {
	items := []sortItem{
		{Name: "a", Priority: 1, Price: 10},
		{Name: "a", Priority: 1, Price: 30},
		{Name: "a", Priority: 1, Price: 20},
	}
	got := Sort(items, "field", "Name", "string", "asc", "field", "Price", "numeric", "desc")
	prices := []float64{got[0].(sortItem).Price, got[1].(sortItem).Price, got[2].(sortItem).Price}
	if prices[0] != 30 || prices[1] != 20 || prices[2] != 10 {
		t.Errorf("multi-key desc secondary = %v, want [30 20 10]", prices)
	}
}

// `compareType=auto` (relational-ternary lowering) on a numeric array:
// both keys parse as numbers → numeric compare.
func TestSort_Auto_Numeric(t *testing.T) {
	got := Sort([]int{3, 1, 2}, "self", "", "auto", "asc")
	if len(got) != 3 || got[0] != 1 || got[1] != 2 || got[2] != 3 {
		t.Errorf("auto numeric asc = %v, want [1 2 3]", got)
	}
}

// `auto` on non-numeric strings → lexical compare.
func TestSort_Auto_StringFallback(t *testing.T) {
	got := Sort([]string{"charlie", "alice", "bob"}, "self", "", "auto", "asc")
	if len(got) != 3 || got[0] != "alice" || got[1] != "bob" || got[2] != "charlie" {
		t.Errorf("auto string asc = %v, want [alice bob charlie]", got)
	}
}

// `auto` treats numeric strings as numbers (Go/Perl parity via
// `looks_like_number`): "10" sorts after "9", not lexically before it.
// Documented divergence from JS `<`/`>`, which compares these lexically.
func TestSort_Auto_NumericStringsCompareNumerically(t *testing.T) {
	got := Sort([]string{"10", "9", "100"}, "self", "", "auto", "asc")
	if len(got) != 3 || got[0] != "9" || got[1] != "10" || got[2] != "100" {
		t.Errorf("auto numeric-string asc = %v, want [9 10 100]", got)
	}
}

// (#1487) `bf_sort` is called with a PascalCase key name (the IR
// emits `bf_sort .Items "field" "Price" ...`), but user data flows
// in as a `map[string]any` whose keys may be either lowercase
// (JS-style — JSON.parse output, test-renderer top-level objects)
// or PascalCase (Go-side data, test-renderer nested-in-array
// objects). `getFieldValue`'s map fallback resolves both via a
// case-variant lookup.
func TestSort_FieldOnMapReceiver_PascalCaseKeys(t *testing.T) {
	items := []any{
		map[string]any{"Name": "c", "Price": 30},
		map[string]any{"Name": "a", "Price": 10},
		map[string]any{"Name": "b", "Price": 20},
	}
	got := Sort(items, "field", "Price", "numeric", "asc")
	if len(got) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(got))
	}
	firstPrice := got[0].(map[string]any)["Price"]
	lastPrice := got[2].(map[string]any)["Price"]
	if firstPrice != 10 || lastPrice != 30 {
		t.Errorf("Sort PascalCase map asc = %v, want first.Price=10 last.Price=30", got)
	}
}

func TestSort_FieldOnMapReceiver_LowercaseKeys(t *testing.T) {
	items := []any{
		map[string]any{"name": "c", "price": 30},
		map[string]any{"name": "a", "price": 10},
		map[string]any{"name": "b", "price": 20},
	}
	got := Sort(items, "field", "Price", "numeric", "asc")
	if len(got) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(got))
	}
	firstPrice := got[0].(map[string]any)["price"]
	lastPrice := got[2].(map[string]any)["price"]
	if firstPrice != 10 || lastPrice != 30 {
		t.Errorf("Sort lowercase map asc = %v, want first.price=10 last.price=30", got)
	}
}

// (#1489 review) `MapIndex(reflect.ValueOf(string))` panics on a
// `map[NamedString]V` because the dynamic key type doesn't match
// `string`. `getFieldValue` converts the lookup to the map's
// declared key type so JSON-decoded data with `type Key string`
// keys still resolves.
func TestSort_FieldOnMapReceiver_NamedStringKey(t *testing.T) {
	type Key string
	items := []any{
		map[Key]any{"price": 30, "name": "c"},
		map[Key]any{"price": 10, "name": "a"},
		map[Key]any{"price": 20, "name": "b"},
	}
	got := Sort(items, "field", "Price", "numeric", "asc")
	if len(got) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(got))
	}
	firstPrice := got[0].(map[Key]any)["price"]
	if firstPrice != 10 {
		t.Errorf("Sort named-key map asc first.price = %v, want 10", firstPrice)
	}
}

// (#1489 review) Nil interface entries inside `[]any` must not panic
// — `getFieldValue`'s IsNil guards keep a single bad row from taking
// the whole sort down.
func TestSort_FieldOnMapReceiver_TolerantToNilEntries(t *testing.T) {
	items := []any{
		map[string]any{"price": 30},
		nil,
		map[string]any{"price": 10},
	}
	got := Sort(items, "field", "Price", "numeric", "asc")
	if len(got) != 3 {
		t.Fatalf("Sort returned %d items, want 3", len(got))
	}
	// nil projects to 0 (toFloat64(nil)) and sorts to the front
	// alongside any other zero-keyed entries — the assertion here
	// is that we didn't panic, and the result length is preserved.
}

// =============================================================================
// JS-compat callees (#1188): bf_json / bf_string / bf_number /
// bf_floor / bf_ceil / bf_round / bf_replace.
// =============================================================================

func TestJSON(t *testing.T) {
	cases := []struct {
		name string
		in   any
		want string
	}{
		{"map", map[string]any{"a": 1}, `{"a":1}`},
		{"slice", []any{1, 2, 3}, `[1,2,3]`},
		{"string", "hi", `"hi"`},
		{"nil", nil, "null"},
		// JS-parity carve-out: top-level NaN / ±Inf → "null".
		{"NaN", math.NaN(), "null"},
		{"+Inf", math.Inf(1), "null"},
		{"-Inf", math.Inf(-1), "null"},
	}
	for _, c := range cases {
		got, err := JSON(c.in)
		if err != nil {
			t.Errorf("JSON(%s) unexpected err: %v", c.name, err)
		}
		if got != c.want {
			t.Errorf("JSON(%s) = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestJSONPropagatesError(t *testing.T) {
	// Cyclic / unsupported values must surface as a real error so
	// `template.Execute` aborts loudly. Channels aren't marshallable.
	_, err := JSON(make(chan int))
	if err == nil {
		t.Errorf("JSON(chan) expected error, got nil")
	}
}

// Same loud-failure policy as `JSON`: any helper that serialises
// user-supplied data through `encoding/json` must propagate
// marshal errors so `template.Execute` aborts loudly instead of
// silently dropping content. Pre-fix, both helpers returned an
// empty value on error (the same #1187 silent-data-loss class
// `JSON` was changed to avoid).

func TestBfPropsAttrPropagatesError(t *testing.T) {
	// Use a struct whose root field is a chan to defeat marshalling
	// while still satisfying `getBoolField(props, "BfIsRoot")`.
	type bad struct {
		BfIsRoot bool
		Ch       chan int
	}
	_, err := BfPropsAttr(bad{BfIsRoot: true, Ch: make(chan int)})
	if err == nil {
		t.Errorf("BfPropsAttr(bad props) expected error, got nil")
	}
	// Non-root components must still succeed (bf-p is suppressed by design).
	got, err := BfPropsAttr(bad{BfIsRoot: false})
	if err != nil {
		t.Errorf("BfPropsAttr(non-root) unexpected err: %v", err)
	}
	if got != "" {
		t.Errorf("BfPropsAttr(non-root) = %q, want empty", got)
	}
}

func TestScopeCommentPropagatesError(t *testing.T) {
	type bad struct {
		BfIsRoot bool
		ScopeID  string
		Ch       chan int
	}
	_, err := ScopeComment(bad{BfIsRoot: true, ScopeID: "x", Ch: make(chan int)})
	if err == nil {
		t.Errorf("ScopeComment(bad props) expected error, got nil")
	}
	// Non-root case: no JSON marshal happens, so no error.
	if _, err := ScopeComment(bad{BfIsRoot: false, ScopeID: "x"}); err != nil {
		t.Errorf("ScopeComment(non-root) unexpected err: %v", err)
	}
}

// #2289: a fragment root has no wrapping element to bound the client's
// scope query, so the begin marker alone lets the range leak onto later
// siblings. ScopeCommentEnd must carry the SAME scope id ScopeComment used,
// with no `|h=`/`|m=`/props segment, so the client's exact-match boundary
// check (getCommentScopeBoundary) can close the range.
func TestScopeCommentEndMatchesBeginScopeID(t *testing.T) {
	type props struct {
		BfIsRoot bool
		ScopeID  string
	}
	p := props{BfIsRoot: true, ScopeID: "Wrapper_abc123"}

	begin, err := ScopeComment(p)
	if err != nil {
		t.Fatalf("ScopeComment: unexpected err: %v", err)
	}
	end := ScopeCommentEnd(p)

	wantEnd := template.HTML("<!--bf-/scope:Wrapper_abc123-->")
	if end != wantEnd {
		t.Errorf("ScopeCommentEnd = %q, want %q", end, wantEnd)
	}
	if !strings.HasPrefix(string(begin), "<!--bf-scope:Wrapper_abc123") {
		t.Errorf("ScopeComment = %q, want prefix bf-scope:Wrapper_abc123", begin)
	}
}

func TestScopeCommentEndChildComponent(t *testing.T) {
	// A child (non-root) fragment carries |h=/|m= on the BEGIN marker only
	// — ScopeCommentEnd never emits that segment, matching the Hono
	// wrapWithScopeComment reference (`bf-/scope:<scopeId>`, no host/mount).
	type props struct {
		BfIsRoot bool
		ScopeID  string
		BfParent string
		BfMount  string
	}
	p := props{BfIsRoot: false, ScopeID: "child_s1", BfParent: "Wrapper_abc123", BfMount: "s1"}

	end := ScopeCommentEnd(p)
	want := template.HTML("<!--bf-/scope:child_s1-->")
	if end != want {
		t.Errorf("ScopeCommentEnd = %q, want %q", end, want)
	}
}

func TestString(t *testing.T) {
	if got := String(42); got != "42" {
		t.Errorf("String(42) = %v, want 42", got)
	}
	if got := String("hi"); got != "hi" {
		t.Errorf("String(hi) = %v, want hi", got)
	}
	if got := String(true); got != "true" {
		t.Errorf("String(true) = %v, want true", got)
	}
	if got := String(nil); got != "" {
		t.Errorf("String(nil) = %q, want empty", got)
	}
}

func TestNumber(t *testing.T) {
	if got := Number("3.14"); got != 3.14 {
		t.Errorf("Number(3.14 string) = %v, want 3.14", got)
	}
	if got := Number(42); got != 42.0 {
		t.Errorf("Number(int 42) = %v, want 42", got)
	}
	if got := Number(true); got != 1.0 {
		t.Errorf("Number(true) = %v, want 1", got)
	}
	if got := Number(false); got != 0.0 {
		t.Errorf("Number(false) = %v, want 0", got)
	}
	// JS `Number("garbage")` and `Number(null)` both return NaN —
	// match that so chained primitives (e.g. `Math.floor`) stay
	// JS-compat.
	if got := Number("not a number"); !math.IsNaN(got) {
		t.Errorf("Number(garbage) = %v, want NaN", got)
	}
	if got := Number(nil); !math.IsNaN(got) {
		t.Errorf("Number(nil) = %v, want NaN", got)
	}
}

func TestFloor(t *testing.T) {
	if got := Floor(3.7); got != 3.0 {
		t.Errorf("Floor(3.7) = %v, want 3", got)
	}
	if got := Floor(-3.2); got != -4.0 {
		t.Errorf("Floor(-3.2) = %v, want -4", got)
	}
	if got := Floor("4.9"); got != 4.0 {
		t.Errorf("Floor(\"4.9\") = %v, want 4", got)
	}
}

func TestCeil(t *testing.T) {
	if got := Ceil(3.1); got != 4.0 {
		t.Errorf("Ceil(3.1) = %v, want 4", got)
	}
	if got := Ceil(-3.7); got != -3.0 {
		t.Errorf("Ceil(-3.7) = %v, want -3", got)
	}
}

func TestRound(t *testing.T) {
	if got := Round(3.5); got != 4.0 {
		t.Errorf("Round(3.5) = %v, want 4", got)
	}
	if got := Round(3.4); got != 3.0 {
		t.Errorf("Round(3.4) = %v, want 3", got)
	}
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func TestSpreadAttrs(t *testing.T) {
	tests := []struct {
		name string
		bag  any
		want template.HTMLAttr
	}{
		{"nil", nil, ""},
		{"empty", map[string]any{}, ""},
		{"non-map", "x", ""},
		{
			name: "single string",
			bag:  map[string]any{"id": "a"},
			want: `id="a"`,
		},
		{
			name: "alphabetic order",
			bag:  map[string]any{"id": "a", "class": "on"},
			want: `class="on" id="a"`,
		},
		{
			name: "className → class remap",
			bag:  map[string]any{"className": "foo"},
			want: `class="foo"`,
		},
		{
			name: "htmlFor → for remap",
			bag:  map[string]any{"htmlFor": "x"},
			want: `for="x"`,
		},
		{
			name: "camelCase → kebab-case",
			bag:  map[string]any{"dataPriority": "high"},
			want: `data-priority="high"`,
		},
		{
			name: "SVG viewBox preserved",
			bag:  map[string]any{"viewBox": "0 0 10 10"},
			want: `viewBox="0 0 10 10"`,
		},
		{
			name: "event handler skipped",
			bag:  map[string]any{"onClick": "fn", "id": "a"},
			want: `id="a"`,
		},
		{
			name: "children skipped",
			bag:  map[string]any{"children": "x", "id": "a"},
			want: `id="a"`,
		},
		{
			// Parity with JS `spreadAttrs` — it doesn't filter `ref`,
			// so neither do we (#1411 review).
			name: "ref passes through (parity with JS spreadAttrs)",
			bag:  map[string]any{"ref": "x", "id": "a"},
			want: `id="a" ref="x"`,
		},
		{
			name: "nil value skipped",
			bag:  map[string]any{"a": nil, "b": "x"},
			want: `b="x"`,
		},
		{
			name: "false skipped",
			bag:  map[string]any{"hidden": false, "id": "a"},
			want: `id="a"`,
		},
		{
			name: "true → bare attribute",
			bag:  map[string]any{"hidden": true, "id": "a"},
			want: `hidden id="a"`,
		},
		{
			name: "HTML escape value",
			bag:  map[string]any{"title": `<b>"x"</b>`},
			want: `title="&lt;b&gt;&#34;x&#34;&lt;/b&gt;"`,
		},
		{
			name: "number stringified",
			bag:  map[string]any{"tabindex": 0},
			want: `tabindex="0"`,
		},
		{
			name: "style object lowered to CSS",
			bag:  map[string]any{"style": map[string]any{"backgroundColor": "red", "color": "white"}},
			want: `style="background-color:red;color:white"`,
		},
		{
			name: "style string passthrough",
			bag:  map[string]any{"style": "color:red"},
			want: `style="color:red"`,
		},
		// #1411 review parity tests — mirror JS `spreadAttrs` for
		// edge keys.
		{
			name: "leading-uppercase key emits leading dash (parity with JS)",
			bag:  map[string]any{"XData": "x"},
			want: `-x-data="x"`,
		},
		{
			name: "event handler with underscore third char skipped (parity with JS)",
			bag:  map[string]any{"on_custom": "fn", "id": "a"},
			want: `id="a"`,
		},
		{
			name: "event handler with digit third char skipped (parity with JS)",
			bag:  map[string]any{"on0": "fn", "id": "a"},
			want: `id="a"`,
		},
		{
			name: "on followed by lowercase letter NOT treated as event",
			bag:  map[string]any{"oncology": "x"},
			want: `oncology="x"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := SpreadAttrs(tt.bag)
			if got != tt.want {
				t.Errorf("SpreadAttrs(%v) = %q, want %q", tt.bag, got, tt.want)
			}
		})
	}
}

func TestStyleToCss(t *testing.T) {
	tests := []struct {
		name   string
		input  any
		want   string
		wantOk bool
	}{
		{"nil", nil, "", false},
		{"empty map", map[string]any{}, "", false},
		{"string passthrough", "color:red", "color:red", true},
		{
			name:   "camelCase keys",
			input:  map[string]any{"backgroundColor": "red"},
			want:   "background-color:red",
			wantOk: true,
		},
		{
			name:   "multiple keys sorted",
			input:  map[string]any{"color": "white", "backgroundColor": "red"},
			want:   "background-color:red;color:white",
			wantOk: true,
		},
		{
			name:   "nil value skipped",
			input:  map[string]any{"color": "red", "padding": nil},
			want:   "color:red",
			wantOk: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := StyleToCss(tt.input)
			if got != tt.want || ok != tt.wantOk {
				t.Errorf("StyleToCss(%v) = (%q, %v), want (%q, %v)", tt.input, got, ok, tt.want, tt.wantOk)
			}
		})
	}
}

// Regression for #1442 echo TodoApp repro: template execution errors
// (e.g. a non-existent field reference like `.Todo.Done` on a
// `{{range $_, $todo := .Todos}}` body, the old loop-var bug) used
// to be silently swallowed. ExecuteTemplate's return value was
// dropped, the partial output flushed as HTTP 200, and the user saw a
// truncated page with no error in the logs. `Render` now always
// surfaces the failure: a visible inline panel goes into the page,
// and a single line goes to stderr.
func TestRenderer_TemplateErrorSurfaces(t *testing.T) {
	// Template references a field the props struct doesn't define.
	tmpl, err := template.New("Broken").Funcs(FuncMap()).Parse(`<p>{{.Missing.Whatever}}</p>`)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	r := &Renderer{
		templates: tmpl,
		layout: func(ctx *RenderContext) string {
			// Layout passes the component HTML through verbatim so the
			// test can assert on the rendered fragment directly.
			return string(ctx.ComponentHTML)
		},
	}
	type Props struct {
		ScopeID   string
		BfIsRoot  bool
		BfIsChild bool
	}
	out := r.Render(RenderOptions{ComponentName: "Broken", Props: &Props{}})
	if !strings.Contains(out, "Template error in") {
		t.Errorf("expected error panel in output, got:\n%s", out)
	}
	if !strings.Contains(out, "Broken") {
		t.Errorf("expected component name in error panel, got:\n%s", out)
	}
}

// --- Reduce (#1448 Tier C) ---------------------------------------------------

func TestReduce_SumField(t *testing.T) {
	items := []any{
		map[string]any{"duration": 95},
		map[string]any{"duration": 213},
		map[string]any{"duration": 185},
	}
	got := Reduce(items, "+", "field", "Duration", "numeric", "0", "left")
	if got != float64(493) {
		t.Errorf("Reduce sum field = %v, want 493", got)
	}
}

func TestReduce_SumSelf(t *testing.T) {
	got := Reduce([]any{10, 20, 30, 5}, "+", "self", "", "numeric", "0", "left")
	if got != float64(65) {
		t.Errorf("Reduce sum self = %v, want 65", got)
	}
}

func TestReduce_Product(t *testing.T) {
	items := []any{
		map[string]any{"qty": 2},
		map[string]any{"qty": 3},
		map[string]any{"qty": 4},
	}
	got := Reduce(items, "*", "field", "Qty", "numeric", "1", "left")
	if got != float64(24) {
		t.Errorf("Reduce product = %v, want 24", got)
	}
}

func TestReduce_Concat(t *testing.T) {
	items := []any{
		map[string]any{"label": "a"},
		map[string]any{"label": "b"},
		map[string]any{"label": "c"},
	}
	got := Reduce(items, "+", "field", "Label", "string", "", "left")
	if got != "abc" {
		t.Errorf("Reduce concat = %v, want abc", got)
	}
}

// Empty receiver returns the init unchanged — like JS reduce(fn, init).
func TestReduce_EmptyReturnsInit(t *testing.T) {
	if got := Reduce([]any{}, "*", "self", "", "numeric", "1", "left"); got != float64(1) {
		t.Errorf("Reduce empty product = %v, want 1", got)
	}
	if got := Reduce([]any{}, "+", "self", "", "string", "seed", "left"); got != "seed" {
		t.Errorf("Reduce empty concat = %v, want seed", got)
	}
}

// #1728 review: a Go-initialism field projects as an all-caps key
// (`id` → `ID`). JSON-decoded data is a `map[string]any` keyed by the
// lowercase JS name, so `getFieldValue` must fall back to the
// all-lowercase key to resolve it (the `decapitalize("ID")` = "iD"
// fallback alone would miss).
func TestReduce_InitialismFieldOnLowercaseMap(t *testing.T) {
	items := []any{
		map[string]any{"id": 10},
		map[string]any{"id": 20},
		map[string]any{"id": 30},
	}
	got := Reduce(items, "+", "field", "ID", "numeric", "0", "left")
	if got != float64(60) {
		t.Errorf("Reduce over initialism field on lowercase-keyed map = %v, want 60", got)
	}
}

// #1728 review: numeric-string keys ("5") must parse like Perl's
// `looks_like_number`, not coerce to 0 (plain toFloat64), so the two
// template adapters (Go + Mojo) stay byte-equal. Non-numeric strings
// fold as 0. (The JS / Hono path's `+` string-concatenates once an
// operand is a string, so numeric-string data diverges from CSR
// regardless — a documented limitation; genuine numbers agree on all
// three.)
func TestReduce_NumericStringKeysParse(t *testing.T) {
	items := []any{
		map[string]any{"n": "5"},
		map[string]any{"n": "10"},
		map[string]any{"n": 3},
	}
	if got := Reduce(items, "+", "field", "N", "numeric", "0", "left"); got != float64(18) {
		t.Errorf("Reduce over numeric-string keys = %v, want 18", got)
	}
	mixed := []any{"5", "x", 2}
	if got := Reduce(mixed, "+", "self", "", "numeric", "0", "left"); got != float64(7) {
		t.Errorf("Reduce mixed self = %v, want 7 (non-numeric → 0)", got)
	}
}

// reduceRight folds right-to-left. Only observable for string concat:
// [a,b,c] concatenated right-to-left from "" yields "cba". Numeric sums
// are commutative, so the direction doesn't change them.
func TestReduce_RightConcatReverses(t *testing.T) {
	items := []any{
		map[string]any{"label": "a"},
		map[string]any{"label": "b"},
		map[string]any{"label": "c"},
	}
	if got := Reduce(items, "+", "field", "Label", "string", "", "right"); got != "cba" {
		t.Errorf("reduceRight concat = %v, want cba", got)
	}
	// Numeric sum is identical left vs right.
	nums := []any{10, 20, 30, 5}
	if got := Reduce(nums, "+", "self", "", "numeric", "0", "right"); got != float64(65) {
		t.Errorf("reduceRight numeric sum = %v, want 65 (commutative)", got)
	}
}

// --- Auto-assigned child ScopeIDs (#absorb manual ScopeID) ------------------

// setScopeIDsOnSlice backfills an empty ScopeID on every child in a slice
// with a `<Type>_<random>` id while leaving caller-pinned ids untouched.
func TestSetScopeIDsOnSlice(t *testing.T) {
	type itemProps struct {
		ScopeID string
		Scripts *ScriptCollector
	}
	items := []itemProps{{}, {ScopeID: "keep"}, {}}
	setScopeIDsOnSlice(items)

	if !strings.HasPrefix(items[0].ScopeID, "item_") {
		t.Fatalf("item 0: expected an item_ prefix, got %q", items[0].ScopeID)
	}
	if items[1].ScopeID != "keep" {
		t.Fatalf("item 1: explicit ScopeID must be preserved, got %q", items[1].ScopeID)
	}
	if items[2].ScopeID == "" || items[2].ScopeID == items[0].ScopeID {
		t.Fatalf("item 2: expected a distinct generated ScopeID, got %q (item0=%q)", items[2].ScopeID, items[0].ScopeID)
	}
}

// setScopeIDOnSingle backfills a single child's empty ScopeID and preserves
// an explicit one.
func TestSetScopeIDOnSingle(t *testing.T) {
	type widgetProps struct {
		ScopeID string
		Scripts *ScriptCollector
	}
	w := &widgetProps{}
	setScopeIDOnSingle(w)
	if !strings.HasPrefix(w.ScopeID, "widget_") {
		t.Fatalf("expected a widget_ prefix, got %q", w.ScopeID)
	}

	w2 := &widgetProps{ScopeID: "fixed"}
	setScopeIDOnSingle(w2)
	if w2.ScopeID != "fixed" {
		t.Fatalf("explicit ScopeID must be preserved, got %q", w2.ScopeID)
	}
}

// Render backfills empty child ScopeIDs in place before executing the
// template, so application code no longer has to mint scope ids by hand.
func TestRender_AutoAssignsChildScopeIDs(t *testing.T) {
	type childProps struct {
		ScopeID   string
		Scripts   *ScriptCollector
		BfIsChild bool
		Label     string
	}
	type listProps struct {
		ScopeID  string
		Scripts  *ScriptCollector
		BfIsRoot bool
		Items    []childProps
	}

	tmpl := template.New("").Funcs(FuncMap())
	template.Must(tmpl.New("List").Parse(`{{range .Items}}<i bf-s="{{bfScopeAttr .}}">{{.Label}}</i>{{end}}`))

	r := NewRenderer(tmpl, func(ctx *RenderContext) string { return string(ctx.ComponentHTML) })
	props := &listProps{Items: []childProps{{Label: "a"}, {ScopeID: "pinned", Label: "b"}}}
	out := r.Render(RenderOptions{ComponentName: "List", Props: props})

	if !strings.Contains(out, `bf-s="child_`) {
		t.Fatalf("expected an auto-generated child_ ScopeID in output, got: %s", out)
	}
	if !strings.Contains(out, `bf-s="pinned"`) {
		t.Fatalf("expected the explicit ScopeID to be preserved, got: %s", out)
	}
	if props.Items[0].ScopeID == "" {
		t.Fatal("expected Render to backfill the empty child ScopeID in place")
	}
}

// Query (`bf_query`)'s cross-backend behaviour — control flow plus form-encoding
// parity with the browser's URLSearchParams — lives in the shared golden helper
// vectors (TestHelperVectors, fn "query"), the same vectors the Perl backend
// runs. This direct test keeps a few representative cases for always-on coverage
// (the golden file is monorepo-only), including the slice-typed value path the
// JSON golden args can only exercise as []any (a compiled template passes a
// []string field).
func TestQuery(t *testing.T) {
	tests := []struct {
		name    string
		base    string
		triples []any
		want    string
	}{
		{"one included pair", "/", []any{true, "sort", "title"}, "/?sort=title"},
		{"order + overwrite at first position", "/blog", []any{true, "sort", "title", true, "tag", "go", true, "sort", "date"}, "/blog?sort=date&tag=go"},
		// formEscape (not url.QueryEscape): `~` → %7E, `*` kept, space → `+`.
		{"form-encode ~ * space", "/s", []any{true, "t", "a~b *c"}, "/s?t=a%7Eb+*c"},
		// An included-but-empty value is dropped (helper-side non-empty check,
		// matching the client / Perl).
		{"included-but-empty value is omitted", "/", []any{true, "tag", ""}, "/"},
		// Array value ([]string, the compiled-template type) appends each
		// non-empty member; an all-empty/empty array contributes nothing.
		{"[]string value appends members", "/l", []any{true, "tag", []string{"a", "b"}}, "/l?tag=a&tag=b"},
		{"empty members in a slice are skipped", "/l", []any{true, "tag", []string{"a", "", "b"}}, "/l?tag=a&tag=b"},
		{"empty slice contributes nothing", "/l", []any{true, "sort", "name", true, "tag", []string{}}, "/l?sort=name"},
	}
	for _, tt := range tests {
		if got := Query(tt.base, tt.triples...); got != tt.want {
			t.Errorf("%s: Query(%q, %v) = %q, want %q", tt.name, tt.base, tt.triples, got, tt.want)
		}
	}
}

// AsMap normalizes any string-keyed map kind held in an interface{} prop
// field into map[string]interface{} for object-valued context bindings, and
// returns nil for every "absent" shape so the generated `?? {}` fallback
// engages (#2111 review: a bare `.(map[string]interface{})` assertion
// silently dropped a caller-supplied map[string]string).
func TestAsMap(t *testing.T) {
	// Present values normalize (or pass through) with entries intact.
	direct := map[string]interface{}{"label": "Sales"}
	if got := AsMap(direct); len(got) != 1 || got["label"] != "Sales" {
		t.Errorf("AsMap(map[string]interface{}) = %v, want pass-through", got)
	}
	typed := map[string]string{"label": "Sales"}
	if got := AsMap(typed); len(got) != 1 || got["label"] != "Sales" {
		t.Errorf("AsMap(map[string]string) = %v, want converted map with entries", got)
	}
	type key string
	named := map[key]int{"n": 1}
	if got := AsMap(named); got != nil {
		// Non-plain-string key kinds are still reflect.String — verify they convert.
		if len(got) != 1 || got["n"] != 1 {
			t.Errorf("AsMap(map[named-string]int) = %v, want converted map", got)
		}
	} else {
		t.Errorf("AsMap(map[named-string]int) = nil, want converted map")
	}
	empty := map[string]interface{}{}
	if got := AsMap(empty); got == nil || len(got) != 0 {
		t.Errorf("AsMap(empty map) = %v, want present-but-empty map (not nil)", got)
	}

	// Absent shapes return nil so `?? {}` falls back.
	if got := AsMap(nil); got != nil {
		t.Errorf("AsMap(nil) = %v, want nil", got)
	}
	var typedNil map[string]string
	if got := AsMap(typedNil); got != nil {
		t.Errorf("AsMap(typed-nil map) = %v, want nil", got)
	}
	var ifaceNil map[string]interface{}
	if got := AsMap(ifaceNil); got != nil {
		t.Errorf("AsMap(typed-nil map[string]interface{}) = %v, want nil", got)
	}
	if got := AsMap("not a map"); got != nil {
		t.Errorf("AsMap(string) = %v, want nil", got)
	}
	if got := AsMap(map[int]string{1: "x"}); got != nil {
		t.Errorf("AsMap(int-keyed map) = %v, want nil", got)
	}
	ptr := &direct
	if got := AsMap(ptr); len(got) != 1 || got["label"] != "Sales" {
		t.Errorf("AsMap(*map[string]interface{}) = %v, want dereferenced map", got)
	}
}

// #2344: FormatDate resolves canonical IANA zone names through tzdata and
// ERRORS on anything unresolvable — the loud-not-silent replacement for the
// pre-#2344 normalize-to-UTC total function. The resolvable grid lives in
// the golden vectors (vectors_test.go); this pins the error side, which is
// outside the vector domain (spec/template-helpers.md JS-throws rule).
func TestFormatDateUnresolvableTZ(t *testing.T) {
	recv := "2024-01-01T23:00:00.000Z"
	for _, tz := range []string{"garbage", "Asia/Tokyoo", "+9:00", "+25:00", "asia/tokyo", "Local", ""} {
		if _, err := FormatDate(recv, "YYYY-MM-DD", tz, nil); err == nil {
			t.Errorf("FormatDate(tz=%q) = nil error, want unresolvable-timeZone error", tz)
		}
	}
	// The receiver contract precedes tz validation: a nil/unparseable
	// receiver renders '' without inspecting tz, on every backend.
	if s, err := FormatDate(nil, "YYYY-MM-DD", "garbage", nil); err != nil || s != "" {
		t.Errorf("FormatDate(nil recv, bad tz) = (%q, %v), want (\"\", nil)", s, err)
	}
	// Named-zone happy path (redundant with the vectors, but keeps this
	// file self-sufficient outside the monorepo checkout).
	if s, err := FormatDate(recv, "YYYY-MM-DD", "Asia/Tokyo", nil); err != nil || s != "2024-01-02" {
		t.Errorf("FormatDate(Asia/Tokyo) = (%q, %v), want (\"2024-01-02\", nil)", s, err)
	}
}
