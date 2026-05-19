package bf

import (
	"html/template"
	"math"
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
		"bf_every", "bf_some", "bf_filter", "bf_find", "bf_find_index", "bf_sort",
		"bfComment", "bfTextStart", "bfTextEnd", "bfPortalHTML",
	}

	for _, name := range expectedFuncs {
		if _, ok := fm[name]; !ok {
			t.Errorf("FuncMap missing function: %s", name)
		}
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

	result := Sort(items, "priority", "asc")

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

	result := Sort(items, "priority", "desc")

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

	result := Sort(items, "price", "asc")

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
	result := Sort(items, "priority", "asc")

	if result == nil {
		t.Error("Sort of empty slice should return empty slice, not nil")
	}
	if len(result) != 0 {
		t.Errorf("Sort of empty slice returned %d items, want 0", len(result))
	}
}

func TestSort_NilSlice(t *testing.T) {
	result := Sort(nil, "priority", "asc")

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

	Sort(items, "priority", "asc")

	// Original slice should be unchanged
	if items[0].Name != "C" {
		t.Errorf("Sort mutated original: first = %v, want C", items[0].Name)
	}
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
			name: "ref skipped",
			bag:  map[string]any{"ref": "x", "id": "a"},
			want: `id="a"`,
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
