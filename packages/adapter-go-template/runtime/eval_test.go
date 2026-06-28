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
