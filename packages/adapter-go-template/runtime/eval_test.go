package bf

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

// loadEvalExprJSON returns the JSON of a committed eval-vector's `expr` tree
// (a real compiler-produced ParsedExpr), looked up by its note. This lets the
// fold tests drive the evaluator with genuine trees rather than hand-rolled
// ones.
func loadEvalExprJSON(t *testing.T, note string) string {
	t.Helper()
	data, err := os.ReadFile(evalVectorsPath)
	if os.IsNotExist(err) {
		t.Skipf("eval vectors not available outside the monorepo checkout (%s)", evalVectorsPath)
	}
	if err != nil {
		t.Fatalf("read %s: %v", evalVectorsPath, err)
	}
	var file evalVectorFile
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("parse %s: %v", evalVectorsPath, err)
	}
	for _, c := range file.Cases {
		if c.Note == note {
			return string(c.Expr)
		}
	}
	t.Fatalf("no eval-vector case with note %q", note)
	return ""
}

// mustJSON marshals a hand-built ParsedExpr tree to its JSON encoding.
func mustJSON(t *testing.T, node map[string]any) string {
	t.Helper()
	b, err := json.Marshal(node)
	if err != nil {
		t.Fatalf("marshal node: %v", err)
	}
	return string(b)
}

// Small ParsedExpr constructors for the hand-built comparator trees.
func nid(name string) map[string]any { return map[string]any{"kind": "identifier", "name": name} }
func nmem(obj map[string]any, prop string) map[string]any {
	return map[string]any{"kind": "member", "object": obj, "property": prop, "computed": false}
}
func nbin(op string, l, r map[string]any) map[string]any {
	return map[string]any{"kind": "binary", "op": op, "left": l, "right": r}
}
func ncallMath(fn string, arg map[string]any) map[string]any {
	return map[string]any{
		"kind":   "call",
		"callee": nmem(nid("Math"), fn),
		"args":   []any{arg},
	}
}

func nlit(v any, lt string) map[string]any {
	return map[string]any{"kind": "literal", "value": v, "literalType": lt}
}

// The #2018 P2 higher-order predicate helpers evaluate an arbitrary pure
// predicate body per element, generalizing bf_filter / bf_find / bf_every /
// bf_some. The rows are PascalCase-keyed maps (the Go conformance harness
// shape) with a raw-lowercase-prop predicate, exercising the case-variant
// field read the same way the reduce fixtures do.
func TestPredicateEvalHelpers(t *testing.T) {
	rows := []any{
		map[string]any{"Age": 15.0},
		map[string]any{"Age": 30.0},
		map[string]any{"Age": 18.0},
	}
	// u => u.age >= 18
	pred := mustJSON(t, nbin(">=", nmem(nid("u"), "age"), nlit(18, "number")))

	filtered := FilterEval(rows, pred, "u", nil)
	if len(filtered) != 2 {
		t.Fatalf("FilterEval kept %d, want 2", len(filtered))
	}

	if !SomeEval(rows, pred, "u", nil) {
		t.Errorf("SomeEval = false, want true")
	}
	if EveryEval(rows, pred, "u", nil) {
		t.Errorf("EveryEval = true, want false (15 < 18)")
	}

	// find forward → 30 (first >= 18); findLast → 18 (last >= 18)
	if got := FindEval(rows, pred, "u", true, nil); got.(map[string]any)["Age"] != 30.0 {
		t.Errorf("FindEval forward = %v, want Age 30", got)
	}
	if got := FindEval(rows, pred, "u", false, nil); got.(map[string]any)["Age"] != 18.0 {
		t.Errorf("FindEval backward = %v, want Age 18", got)
	}
	if got := FindIndexEval(rows, pred, "u", true, nil); got != 1 {
		t.Errorf("FindIndexEval forward = %d, want 1", got)
	}
	if got := FindIndexEval(rows, pred, "u", false, nil); got != 2 {
		t.Errorf("FindIndexEval backward = %d, want 2", got)
	}

	// Empty receiver: every → true (vacuous), some → false, find → nil/-1.
	empty := []any{}
	if !EveryEval(empty, pred, "u", nil) {
		t.Errorf("EveryEval(empty) = false, want true")
	}
	if SomeEval(empty, pred, "u", nil) {
		t.Errorf("SomeEval(empty) = true, want false")
	}
	if got := FindEval(empty, pred, "u", true, nil); got != nil {
		t.Errorf("FindEval(empty) = %v, want nil", got)
	}
	if got := FindIndexEval(empty, pred, "u", true, nil); got != -1 {
		t.Errorf("FindIndexEval(empty) = %d, want -1", got)
	}

	// Captured base_env: a predicate `u => u.age >= threshold` reads the
	// outer `threshold` from base_env, and changing it changes the result —
	// pins the capture plumbing (Copilot review #2032).
	capPred := mustJSON(t, nbin(">=", nmem(nid("u"), "age"), nid("threshold")))
	hi := FilterEval(rows, capPred, "u", map[string]any{"threshold": 18.0})
	lo := FilterEval(rows, capPred, "u", map[string]any{"threshold": 100.0})
	if len(hi) != 2 || len(lo) != 0 {
		t.Fatalf("FilterEval with captured threshold: hi=%d lo=%d, want 2/0", len(hi), len(lo))
	}
	if FindIndexEval(rows, capPred, "u", true, map[string]any{"threshold": 100.0}) != -1 {
		t.Errorf("FindIndexEval with unmet captured threshold should be -1")
	}
}

// FlatMapEval projects + flattens one level: a field projection yielding a
// slice contributes its elements; a tuple (array-literal) projection
// contributes its leaves; a scalar projection is kept as a single element.
func TestFlatMapEval(t *testing.T) {
	// Typed `[]string` fields (the real Go-template data shape, not []any) must
	// flatten too — `toAnySlice` normalizes any slice/array kind (Copilot
	// review #2036).
	rows := []any{
		map[string]any{"tags": []string{"a", "b"}},
		map[string]any{"tags": []string{"c"}},
	}
	// field: i => i.tags  → ["a","b","c"]
	field := mustJSON(t, nmem(nid("i"), "tags"))
	if got := FlatMapEval(rows, field, "i", nil); len(got) != 3 || got[0] != "a" || got[2] != "c" {
		t.Fatalf("FlatMapEval typed-slice field = %v, want [a b c]", got)
	}

	// tuple: p => [p.x, p.y]  → [1,2,3,4]
	pts := []any{
		map[string]any{"x": 1.0, "y": 2.0},
		map[string]any{"x": 3.0, "y": 4.0},
	}
	tuple := mustJSON(t, map[string]any{
		"kind":     "array-literal",
		"elements": []any{nmem(nid("p"), "x"), nmem(nid("p"), "y")},
	})
	got := FlatMapEval(pts, tuple, "p", nil)
	if len(got) != 4 || evalToNumber(got[0]) != 1 || evalToNumber(got[3]) != 4 {
		t.Fatalf("FlatMapEval tuple = %v, want [1 2 3 4]", got)
	}

	// A scalar (self) projection of non-array items keeps each as one element.
	if got := FlatMapEval([]any{1.0, 2.0}, mustJSON(t, nid("i")), "i", nil); len(got) != 2 {
		t.Fatalf("FlatMapEval self-scalar = %v, want length 2", got)
	}
}

// MapEval is the value-producing `.map(cb)` lowering (#2073): one result per
// element, NO flatten — an array-valued projection stays one element, the
// exact contract that separates it from FlatMapEval.
func TestMapEval(t *testing.T) {
	// template-literal projection: t => `#${t}` → ["#perl", "#go"]
	tmpl := mustJSON(t, map[string]any{
		"kind": "template-literal",
		"parts": []any{
			map[string]any{"type": "string", "value": "#"},
			map[string]any{"type": "expression", "expr": nid("t")},
		},
	})
	if got := MapEval([]string{"perl", "go"}, tmpl, "t", nil); len(got) != 2 || got[0] != "#perl" || got[1] != "#go" {
		t.Fatalf("MapEval template = %v, want [#perl #go]", got)
	}

	// field projection: u => u.name → ["Ada", "Grace"]
	field := mustJSON(t, nmem(nid("u"), "name"))
	users := []any{
		map[string]any{"name": "Ada"},
		map[string]any{"name": "Grace"},
	}
	if got := MapEval(users, field, "u", nil); len(got) != 2 || got[0] != "Ada" {
		t.Fatalf("MapEval field = %v, want [Ada Grace]", got)
	}

	// An array-valued projection is kept as ONE element (no flatten).
	rows := []any{map[string]any{"tags": []string{"a", "b"}}}
	if got := MapEval(rows, mustJSON(t, nmem(nid("i"), "tags")), "i", nil); len(got) != 1 {
		t.Fatalf("MapEval array-valued projection = %v, want length 1 (no flatten)", got)
	}

	// A bad body yields a non-nil empty slice (downstream range/join safe).
	if got := MapEval([]any{1.0}, "not-json", "i", nil); got == nil || len(got) != 0 {
		t.Fatalf("MapEval bad body = %v, want empty non-nil slice", got)
	}
}

// FoldEval lifts bf_reduce's op restriction and acc-canonical form: the
// reducer body `acc + item.price * item.qty` mixes `acc` with a product of two
// fields — impossible in the +/* self/field catalogue, trivial for the
// evaluator.
func TestFoldEval_LiftsReducerRestriction(t *testing.T) {
	body := loadEvalExprJSON(t, "reduce body: running total with precedence")
	items := []any{
		map[string]any{"price": 5, "qty": 3},
		map[string]any{"price": 2, "qty": 4},
	}
	got := FoldEval(items, body, "acc", "item", 0, "left", nil)
	if evalToNumber(got) != 23 { // 0 + 5*3 + 2*4
		t.Errorf("FoldEval = %v, want 23", got)
	}
}

// reduceRight is observable for string concatenation; the same evaluator body
// folds both directions.
func TestFoldEval_DirectionObservableForConcat(t *testing.T) {
	body := loadEvalExprJSON(t, "+ concatenates once an operand is a string")
	items := []any{"a", "b", "c"}
	if got := FoldEval(items, body, "acc", "item", "", "left", nil); got != "abc" {
		t.Errorf("FoldEval left = %v, want abc", got)
	}
	if got := FoldEval(items, body, "acc", "item", "", "right", nil); got != "cba" {
		t.Errorf("FoldEval right = %v, want cba", got)
	}
}

// SortEval lifts bf_sort's comparator pattern restriction: a comparator that
// calls Math.abs on each operand's field (`Math.abs(a.v) - Math.abs(b.v)`) is
// outside the subtraction / localeCompare / relational-ternary catalogue, but
// is just another pure expression to the evaluator.
func TestSortEval_LiftsComparatorRestriction(t *testing.T) {
	cmp := mustJSON(t, nbin("-",
		ncallMath("abs", nmem(nid("a"), "v")),
		ncallMath("abs", nmem(nid("b"), "v")),
	))
	items := []any{
		map[string]any{"v": -5},
		map[string]any{"v": 3},
		map[string]any{"v": -1},
	}
	got := SortEval(items, cmp, "a", "b", nil)
	want := []float64{-1, 3, -5} // by ascending |v|: 1, 3, 5
	if len(got) != len(want) {
		t.Fatalf("SortEval len = %d, want %d", len(got), len(want))
	}
	for i, w := range want {
		m := got[i].(map[string]any)
		if evalToNumber(m["v"]) != w {
			t.Errorf("SortEval[%d].v = %v, want %v", i, m["v"], w)
		}
	}
}

// evalToString pins JS's spelling of the non-finite doubles
// ("Infinity"/"-Infinity"/"NaN"), not the runtime String() helper's
// "+Inf"/"-Inf" — keeping the evaluator's ToString JS-faithful.
func TestEvalToString_NonFinite(t *testing.T) {
	cases := []struct {
		in   any
		want string
	}{
		{math.Inf(1), "Infinity"},
		{math.Inf(-1), "-Infinity"},
		{math.NaN(), "NaN"},
		{nil, "null"},
		{float64(5), "5"},
		{"hi", "hi"},
	}
	for _, c := range cases {
		if got := evalToString(c.in); got != c.want {
			t.Errorf("evalToString(%v) = %q, want %q", c.in, got, c.want)
		}
	}
}

// Math.round(-0.5) rounds half toward +Infinity to a zero. The result's sign
// (JS keeps -0) is a JS-reference-only divergence region kept at +0 so the two
// SSR backends stay equal; the realistic observable — ToString — is "0" on
// both, matching JS.
func TestEvalMathRound_Zero(t *testing.T) {
	r := evalMathRound(-0.5)
	if r != 0 {
		t.Errorf("evalMathRound(-0.5) = %v, want 0", r)
	}
	if evalToString(r) != "0" {
		t.Errorf("evalToString(Math.round(-0.5)) = %q, want \"0\"", evalToString(r))
	}
}

// FoldEval / SortEval tolerate a nil receiver like bf_reduce / bf_sort:
// FoldEval returns the init unchanged, SortEval returns nil (no panic).
func TestFoldSortEval_NilReceiver(t *testing.T) {
	body := mustJSON(t, nid("acc"))
	if got := FoldEval(nil, body, "acc", "item", 42, "left", nil); evalToNumber(got) != 42 {
		t.Errorf("FoldEval(nil) = %v, want the init 42", got)
	}
	if got := SortEval(nil, body, "a", "b", nil); got != nil {
		t.Errorf("SortEval(nil) = %v, want nil", got)
	}
}

// Descending is just a reversed comparator body — no separate direction knob.
func TestSortEval_DescendingViaReversedComparator(t *testing.T) {
	cmp := mustJSON(t, nbin("-", nmem(nid("b"), "x"), nmem(nid("a"), "x")))
	items := []any{
		map[string]any{"x": 10},
		map[string]any{"x": 30},
		map[string]any{"x": 20},
	}
	got := SortEval(items, cmp, "a", "b", nil)
	want := []float64{30, 20, 10}
	for i, w := range want {
		m := got[i].(map[string]any)
		if evalToNumber(m["x"]) != w {
			t.Errorf("SortEval desc[%d].x = %v, want %v", i, m["x"], w)
		}
	}
}

// Captured free vars flow through baseEnv: a reducer / comparator body can
// reference an outer const that is neither the accumulator/item nor a sort
// operand.
func TestFoldSortEval_CapturedFreeVars(t *testing.T) {
	// reduce: acc + item * factor, with `factor` captured.
	body := mustJSON(t, nbin("+", nid("acc"), nbin("*", nid("item"), nid("factor"))))
	items := []any{1, 2, 3}
	got := FoldEval(items, body, "acc", "item", 0, "left", map[string]any{"factor": 10})
	if evalToNumber(got) != 60 { // 0 + 1*10 + 2*10 + 3*10
		t.Errorf("FoldEval with captured factor = %v, want 60", got)
	}

	// sort by distance from a captured `pivot`: |a-pivot| - |b-pivot|.
	cmp := mustJSON(t, nbin("-",
		ncallMath("abs", nbin("-", nid("a"), nid("pivot"))),
		ncallMath("abs", nbin("-", nid("b"), nid("pivot"))),
	))
	sorted := SortEval([]any{1, 8, 4}, cmp, "a", "b", map[string]any{"pivot": 5})
	wantOrder := []float64{4, 8, 1} // distances 1, 3, 4
	for i, w := range wantOrder {
		if evalToNumber(sorted[i]) != w {
			t.Errorf("SortEval with captured pivot [%d] = %v, want %v", i, sorted[i], w)
		}
	}
}
