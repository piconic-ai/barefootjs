package bf

import (
	"html/template"
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

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
