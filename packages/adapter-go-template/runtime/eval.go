package bf

import (
	"encoding/json"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

// =============================================================================
// Lightweight ParsedExpr evaluator (issue #2018)
// =============================================================================
//
// Templates cannot carry a lambda in expression position, which is why the
// adapter historically special-cased higher-order callbacks (reduce / sort /
// map / filter / find) into fixed shapes (bf_sort's comparator catalogue,
// bf_reduce's +/* fold). This evaluator replaces that ad-hoc list: a callback
// BODY is carried as a pure `ParsedExpr` subtree (the same structured IR the
// compiler already produces) and evaluated here against an environment
// (`{acc, item, …captured free vars}`).
//
// Scope: higher-order callback bodies only. Ordinary expressions stay lowered
// to template-native syntax — this is NOT a general expression engine.
//
// The accepted pure subset and its semantics (evaluation order, coercion,
// equality, allowed operators / builtins) are documented in spec/compiler.md
// ("ParsedExpr Evaluator Semantics") and pinned isomorphically by the golden
// vectors in packages/adapter-tests/helper-vectors/eval-vectors.json (shared
// with the Perl evaluator). The coercion rules below are the literal JS rules
// (ToNumber / ToString / ToBoolean) — deliberately NOT the divergent
// bf->string / bf_reduce helper conventions — so the contract is unambiguous
// and the backends stay byte-isomorphic.
//
// String semantics operate on Unicode code points / UTF-8 bytes: `.length`
// counts code points and relational `<`/`>` compares byte order. This equals
// the JS reference (UTF-16 code units) across the BMP — the range template
// data uses — and matches the Perl evaluator exactly (the primary "same input
// → same output" contract is between the two SSR backends). Astral-plane
// characters (where JS counts a surrogate pair as length 2 and orders by
// surrogate code units) are a documented divergence region, alongside the
// already-documented non-ASCII relational / localeCompare carve-outs
// (spec/compiler.md). Both backends stay equal; only the JS reference differs,
// and no corpus vector exercises the astral range.

// EvalExpr evaluates a pure ParsedExpr (carried as its JSON encoding) against
// env. The result is a value in the JSON domain: a number (Go int or float64 —
// both are the single JS number type; e.g. `.length` returns int, arithmetic
// returns float64), string, bool, nil, []any, or map[string]any. A malformed
// tree yields nil.
func EvalExpr(exprJSON string, env map[string]any) any {
	var node any
	if err := json.Unmarshal([]byte(exprJSON), &node); err != nil {
		return nil
	}
	return EvalNode(node, env)
}

// EvalNode evaluates an already-decoded ParsedExpr node (a map[string]any with
// a "kind" discriminator) against env. Exported so callers that already hold a
// decoded tree (e.g. the golden-vector harness) skip a re-marshal.
func EvalNode(node any, env map[string]any) any {
	n, ok := node.(map[string]any)
	if !ok {
		return nil
	}
	kind, _ := n["kind"].(string)
	switch kind {
	case "literal":
		return n["value"]

	case "identifier":
		name, _ := n["name"].(string)
		return env[name]

	case "binary":
		op, _ := n["op"].(string)
		return evalBinary(op, EvalNode(n["left"], env), EvalNode(n["right"], env))

	case "unary":
		op, _ := n["op"].(string)
		return evalUnary(op, EvalNode(n["argument"], env))

	case "logical":
		op, _ := n["op"].(string)
		left := EvalNode(n["left"], env)
		switch op {
		case "&&":
			if !evalTruthy(left) {
				return left
			}
			return EvalNode(n["right"], env)
		case "||":
			if evalTruthy(left) {
				return left
			}
			return EvalNode(n["right"], env)
		case "??":
			if left == nil {
				return EvalNode(n["right"], env)
			}
			return left
		}
		return nil

	case "conditional":
		if evalTruthy(EvalNode(n["test"], env)) {
			return EvalNode(n["consequent"], env)
		}
		return EvalNode(n["alternate"], env)

	case "member":
		prop, _ := n["property"].(string)
		return evalReadProperty(EvalNode(n["object"], env), prop)

	case "index-access":
		return evalReadIndex(EvalNode(n["object"], env), EvalNode(n["index"], env))

	case "call":
		name := evalBuiltinName(n["callee"])
		if name == "" {
			return nil
		}
		rawArgs, _ := n["args"].([]any)
		args := make([]any, len(rawArgs))
		for i, a := range rawArgs {
			args[i] = EvalNode(a, env)
		}
		return evalCallBuiltin(name, args)

	case "template-literal":
		parts, _ := n["parts"].([]any)
		var sb strings.Builder
		for _, p := range parts {
			pm, _ := p.(map[string]any)
			if t, _ := pm["type"].(string); t == "string" {
				s, _ := pm["value"].(string)
				sb.WriteString(s)
			} else {
				sb.WriteString(evalToString(EvalNode(pm["expr"], env)))
			}
		}
		return sb.String()

	case "array-literal":
		elems, _ := n["elements"].([]any)
		out := make([]any, len(elems))
		for i, e := range elems {
			out[i] = EvalNode(e, env)
		}
		return out

	case "object-literal":
		props, _ := n["properties"].([]any)
		out := make(map[string]any, len(props))
		for _, p := range props {
			pm, _ := p.(map[string]any)
			key, _ := pm["key"].(string)
			out[key] = EvalNode(pm["value"], env)
		}
		return out
	}
	// arrow-fn / higher-order / array-method / unsupported: a callback body
	// containing these is refused upstream (BF101); never reached here.
	return nil
}

// ---------------------------------------------------------------------------
// JS coercion primitives (ToNumber / ToString / ToBoolean), pinned so the
// evaluator matches the JS reference. These are JS-faithful and intentionally
// distinct from the bf->string / Number helpers, which diverge (null → "",
// null/"" → NaN) for SSR-survival reasons that do not apply to the evaluator.
// ---------------------------------------------------------------------------

func evalToNumber(v any) float64 {
	switch x := v.(type) {
	case nil:
		return 0
	case bool:
		if x {
			return 1
		}
		return 0
	case string:
		t := strings.TrimSpace(x)
		if t == "" {
			return 0
		}
		// Decimal / exponent / "Infinity" numeric strings parse JS-faithfully
		// (ParseFloat handles these, matching the Perl evaluator). The
		// radix-prefixed forms JS Number() also accepts ("0x10" / "0o17" /
		// "0b101") are a documented divergence region: they yield NaN here, as
		// they do in the Perl evaluator (looks_like_number is false for them),
		// so Go==Perl while differing from the JS reference. Template data
		// carries JSON numbers, not radix-string literals, so this never
		// arises in practice.
		f, err := strconv.ParseFloat(t, 64)
		if err != nil {
			return math.NaN()
		}
		return f
	default:
		if evalIsNumeric(v) {
			return toFloat64(v)
		}
		return math.NaN()
	}
}

// evalIsNumeric reports whether v is one of the Go numeric types (all of
// which are the single JS "number" type to the evaluator).
func evalIsNumeric(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return true
	}
	return false
}

func evalToString(v any) string {
	if v == nil {
		return "null"
	}
	// JS spells the non-finite doubles "Infinity" / "-Infinity" / "NaN"; the
	// runtime String() helper (fmt %v) would render "+Inf" / "-Inf" / "NaN",
	// so the non-finite cases are pinned here to stay JS-faithful (and match
	// the Perl evaluator's _to_string). Strings, bools and nil are JS-faithful
	// through String() (nil is already handled above as "null").
	//
	// Finite-number formatting is a documented divergence region. Go's fmt is
	// shortest-round-trip (it matches JS's *digits*, e.g. 0.1+0.2 →
	// "0.30000000000000004"), but its exponent threshold/padding differ from
	// JS Number::toString for very large / very small magnitudes (Go renders
	// 1e6 as "1e+06" where JS keeps "1000000", and "1e-07" vs JS "1e-7").
	// Perl's `%.15g` instead diverges on *precision* (the pinned helper-vector
	// "0.3" case). A fully JS-faithful Number::toString is not reimplemented
	// here because Perl has no shortest-round-trip formatter, so the three
	// could never all agree; the common integer / short-decimal range — what
	// arithmetic over template data produces — renders identically across all
	// three. Only the ±0 sign is normalised below, since it is cheap and the
	// realisticly-reachable case.
	if f, ok := v.(float64); ok {
		if math.IsNaN(f) {
			return "NaN"
		}
		if math.IsInf(f, 1) {
			return "Infinity"
		}
		if math.IsInf(f, -1) {
			return "-Infinity"
		}
		// JS `String(-0)` is "0", but fmt %v renders Go's negative zero as
		// "-0". `f == 0` matches both ±0, normalising to JS's spelling. (A
		// unary `-` on a zero operand is the way the evaluator can produce -0.)
		if f == 0 {
			return "0"
		}
	}
	// Non-primitive operands (arrays / objects) in ToString position are
	// outside the evaluator subset — the JS reference refuses them, and the
	// compiler gates such a callback body with BF101 before it ever reaches
	// the runtime. This evaluator runs already-validated bodies, so it does
	// not re-reject here; String() (fmt %v) is a best-effort fallback for that
	// unreachable path, never exercised by the in-subset corpus.
	return String(v)
}

func evalTruthy(v any) bool {
	return isTruthy(v)
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

func evalBinary(op string, l, r any) any {
	switch op {
	case "+":
		// JS `+`: string concatenation once either operand is a string,
		// numeric addition otherwise.
		if _, lok := l.(string); lok {
			return evalToString(l) + evalToString(r)
		}
		if _, rok := r.(string); rok {
			return evalToString(l) + evalToString(r)
		}
		return evalToNumber(l) + evalToNumber(r)
	case "-":
		return evalToNumber(l) - evalToNumber(r)
	case "*":
		return evalToNumber(l) * evalToNumber(r)
	case "/":
		return evalToNumber(l) / evalToNumber(r)
	case "%":
		return math.Mod(evalToNumber(l), evalToNumber(r))
	case "<", "<=", ">", ">=":
		return evalRelational(op, l, r)
	case "===":
		return evalStrictEq(l, r)
	case "!==":
		return !evalStrictEq(l, r)
	}
	// Loose equality / bitwise / shift are out of the subset.
	return nil
}

func evalRelational(op string, l, r any) bool {
	// JS Abstract Relational Comparison: both strings → compare by code
	// unit; otherwise coerce both to numbers (a NaN operand makes every
	// comparison false).
	var c int
	ls, lok := l.(string)
	rs, rok := r.(string)
	if lok && rok {
		if ls < rs {
			c = -1
		} else if ls > rs {
			c = 1
		}
	} else {
		ln := evalToNumber(l)
		rn := evalToNumber(r)
		if math.IsNaN(ln) || math.IsNaN(rn) {
			return false
		}
		if ln < rn {
			c = -1
		} else if ln > rn {
			c = 1
		}
	}
	switch op {
	case "<":
		return c < 0
	case "<=":
		return c <= 0
	case ">":
		return c > 0
	case ">=":
		return c >= 0
	}
	return false
}

func evalStrictEq(l, r any) bool {
	// Strict `===`: equal JS type and value, no coercion. All numeric Go
	// types are the single JS "number" type, so int 2 === float64 2.
	lnum := evalIsNumeric(l)
	rnum := evalIsNumeric(r)
	if lnum && rnum {
		lf, rf := toFloat64(l), toFloat64(r)
		if math.IsNaN(lf) || math.IsNaN(rf) {
			return false
		}
		return lf == rf
	}
	if lnum != rnum {
		return false
	}
	switch lv := l.(type) {
	case nil:
		return r == nil
	case string:
		rv, ok := r.(string)
		return ok && rv == lv
	case bool:
		rv, ok := r.(bool)
		return ok && rv == lv
	}
	// Non-primitive operands (arrays / objects) are outside the subset: the JS
	// reference refuses `===` on them and the compiler gates such a body with
	// BF101 upstream, so this is unreachable for an in-subset corpus. The
	// runtime trusts that gate rather than re-validating, returning false
	// here (it does not attempt JS reference identity, which templates can't
	// model anyway).
	return false
}

func evalUnary(op string, v any) any {
	switch op {
	case "!":
		return !evalTruthy(v)
	case "-":
		return -evalToNumber(v)
	case "+":
		return evalToNumber(v)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Built-in calls (the deterministic allowlist). Locale-sensitive builtins
// (localeCompare) are deliberately excluded to keep the backends isomorphic.
// ---------------------------------------------------------------------------

// evalBuiltinName resolves a `call` callee to its builtin name (e.g.
// "Math.max"), or "" if the callee is not an allowlisted builtin reference.
func evalBuiltinName(callee any) string {
	cm, ok := callee.(map[string]any)
	if !ok {
		return ""
	}
	switch cm["kind"] {
	case "identifier":
		name, _ := cm["name"].(string)
		return name
	case "member":
		if computed, _ := cm["computed"].(bool); computed {
			return ""
		}
		obj, _ := cm["object"].(map[string]any)
		if obj == nil || obj["kind"] != "identifier" {
			return ""
		}
		objName, _ := obj["name"].(string)
		prop, _ := cm["property"].(string)
		return objName + "." + prop
	}
	return ""
}

// evalMathRound rounds a half toward +Infinity (JS Math.round: 2.5→3,
// -2.5→-2), matching the existing `round` helper rather than Go's math.Round.
func evalMathRound(n float64) float64 {
	// floor(n+0.5) yields +0 for x in [-0.5, -0], where JS Math.round returns
	// -0. That sign is only observable through a subsequent division
	// (`1 / Math.round(-0.5)` is -Infinity in JS, +Infinity here) — through
	// ToString both ±0 render "0". It is left as +0 deliberately: the two SSR
	// backends must stay equal, and Perl can't reproduce the -0 divisor sign
	// without fragile, version-dependent zero handling (its native `/` even
	// dies on a zero divisor). So Math.round's -0 is a JS-reference-only
	// divergence region, like the astral-plane / radix-string carve-outs.
	return math.Floor(n + 0.5)
}

func evalCallBuiltin(name string, args []any) any {
	switch name {
	case "Math.max":
		if len(args) == 0 {
			return math.Inf(-1)
		}
		m := evalToNumber(args[0])
		for _, a := range args[1:] {
			m = math.Max(m, evalToNumber(a))
		}
		return m
	case "Math.min":
		if len(args) == 0 {
			return math.Inf(1)
		}
		m := evalToNumber(args[0])
		for _, a := range args[1:] {
			m = math.Min(m, evalToNumber(a))
		}
		return m
	case "Math.abs":
		return math.Abs(evalToNumber(arg0(args)))
	case "Math.floor":
		return math.Floor(evalToNumber(arg0(args)))
	case "Math.ceil":
		return math.Ceil(evalToNumber(arg0(args)))
	case "Math.round":
		return evalMathRound(evalToNumber(arg0(args)))
	case "String":
		return evalToString(arg0(args))
	case "Number":
		return evalToNumber(arg0(args))
	case "Boolean":
		return evalTruthy(arg0(args))
	}
	// Any other callee is outside the subset (refused upstream).
	return nil
}

func arg0(args []any) any {
	if len(args) == 0 {
		return nil
	}
	return args[0]
}

// ---------------------------------------------------------------------------
// Member / index access
// ---------------------------------------------------------------------------

func evalReadProperty(obj any, key string) any {
	switch o := obj.(type) {
	case string:
		if key == "length" {
			// Code-point count (== JS UTF-16 length across the BMP, == Perl
			// `length`). RuneCountInString avoids the []rune allocation since
			// this can run inside comparator / reducer evaluation.
			return utf8.RuneCountInString(o)
		}
		return nil
	case []any:
		if key == "length" {
			return len(o)
		}
		return nil
	case map[string]any:
		// Case-variant lookup: a callback body reads the raw JS property
		// (`t.duration`), but test data / Go-keyed maps may carry PascalCase
		// keys (`{"Duration": …}`). Reuse the field reader the sort / reduce
		// helpers use — it resolves `duration` → `Duration` and reads a
		// genuinely missing key as null (the backends' single absent value).
		return getFieldValue(o, key)
	case nil:
		return nil
	default:
		// Real template data (Go structs): reuse the field reader the sort /
		// reduce helpers use, which handles case-variant keys.
		return getFieldValue(obj, key)
	}
}

// ---------------------------------------------------------------------------
// Evaluator-driven higher-order folds (the generalization of bf_reduce /
// bf_sort onto the evaluator)
//
// These prove the evaluator subsumes the special-cased callback catalogue:
// the callback BODY is carried as a pure ParsedExpr (JSON) and evaluated per
// element against an environment, so the op restriction (bf_reduce's +/*),
// the acc-canonical form, and the comparator pattern restriction (bf_sort)
// all disappear — any pure reducer / comparator body works. They are the
// runtime half of the integration; the compiler-side emit migration (carrying
// callback bodies as ParsedExpr) and the byte-equal divergence decision for
// the string-`localeCompare` sort path (won't-fix for byte-equal SSR, see
// spec/compiler.md Known limitations) are the remaining follow-up.
// ---------------------------------------------------------------------------

// toAnySlice copies a reflect-iterable receiver into a fresh []any, returning
// nil for a non-slice/array (matching the bf_sort / bf_reduce nil-tolerance).
func toAnySlice(items any) []any {
	v := reflect.ValueOf(items)
	// A nil interface yields an invalid Value (Kind() == Invalid, not a
	// panic), so the Slice/Array guard below already tolerates nil; the
	// explicit IsValid check just documents the nil-tolerance intent.
	if !v.IsValid() || (v.Kind() != reflect.Slice && v.Kind() != reflect.Array) {
		return nil
	}
	out := make([]any, v.Len())
	for i := range out {
		out[i] = v.Index(i).Interface()
	}
	return out
}

// FoldEval folds items into a value via the ParsedExpr evaluator. The reducer
// body is a pure ParsedExpr (JSON) evaluated against `{accName: acc, itemName:
// item}` plus the captured free vars in `baseEnv` for each element; `init`
// seeds the accumulator and `direction` is "left" (reduce) or "right"
// (reduceRight). This is the evaluator-based generalization of bf_reduce — any
// reducer body, not just the `+`/`*` arithmetic catalogue, and `acc` may
// appear anywhere in the body. `baseEnv` may be nil when the body captures no
// outer references; the accName / itemName keys shadow any same-named base key.
func FoldEval(items any, bodyJSON, accName, itemName string, init any, direction string, baseEnv map[string]any) any {
	var body any
	if err := json.Unmarshal([]byte(bodyJSON), &body); err != nil {
		return init
	}
	arr := toAnySlice(items)
	if direction == "right" {
		for i, j := 0, len(arr)-1; i < j; i, j = i+1, j-1 {
			arr[i], arr[j] = arr[j], arr[i]
		}
	}
	acc := init
	// Seed the env from the captured free vars once; acc / item are
	// overwritten each iteration (constant base keys carry through).
	env := make(map[string]any, len(baseEnv)+2)
	for k, v := range baseEnv {
		env[k] = v
	}
	for _, item := range arr {
		env[accName] = acc
		env[itemName] = item
		acc = EvalNode(body, env)
	}
	return acc
}

// SortEval returns a new stable-sorted slice ordered by a ParsedExpr
// comparator body (JSON) evaluated against `{paramA: a, paramB: b}` plus the
// captured free vars in `baseEnv` to a number (negative / zero / positive,
// like a JS comparator). This is the evaluator-based generalization of bf_sort
// — any comparator body, not just the subtraction / relational-ternary
// catalogue. `baseEnv` may be nil. Non-mutating.
func SortEval(items any, cmpJSON, paramA, paramB string, baseEnv map[string]any) []any {
	arr := toAnySlice(items)
	if arr == nil {
		return nil
	}
	var cmp any
	if err := json.Unmarshal([]byte(cmpJSON), &cmp); err != nil {
		return arr
	}
	// One env seeded from the captured free vars; the two operand keys are
	// overwritten per comparison (the comparator runs synchronously).
	env := make(map[string]any, len(baseEnv)+2)
	for k, v := range baseEnv {
		env[k] = v
	}
	sort.SliceStable(arr, func(i, j int) bool {
		env[paramA] = arr[i]
		env[paramB] = arr[j]
		return evalToNumber(EvalNode(cmp, env)) < 0
	})
	return arr
}

// ---------------------------------------------------------------------------
// Evaluator-driven higher-order predicates (#2018, P2) — the generalization
// of bf_filter / bf_find / bf_find_index / bf_every / bf_some onto the
// evaluator. The predicate BODY travels as a pure ParsedExpr (JSON) and is
// evaluated per element against `{param: item}` plus the captured free vars in
// `baseEnv`, lifting the field-equality / truthiness restriction of the
// special-cased helpers to any pure predicate. `baseEnv` may be nil.
// ---------------------------------------------------------------------------

// decodeEvalBody unmarshals a serialized ParsedExpr body; ok is false on bad
// JSON (only reachable by a corrupt emit — the adapter always emits valid JSON).
func decodeEvalBody(bodyJSON string) (any, bool) {
	var body any
	if err := json.Unmarshal([]byte(bodyJSON), &body); err != nil {
		return nil, false
	}
	return body, true
}

// seedPredEnv copies the captured free vars into a fresh env with room for the
// single predicate param, which the callers overwrite per element.
func seedPredEnv(baseEnv map[string]any) map[string]any {
	env := make(map[string]any, len(baseEnv)+1)
	for k, v := range baseEnv {
		env[k] = v
	}
	return env
}

// FilterEval returns a new slice of the elements for which the predicate body
// evaluates truthy — the evaluator generalization of bf_filter. Returns a
// non-nil empty slice when nothing matches (so a downstream `range` / `bf_join`
// sees a real slice); returns nil only on a bad body.
func FilterEval(items any, predJSON, param string, baseEnv map[string]any) []any {
	pred, ok := decodeEvalBody(predJSON)
	if !ok {
		return nil
	}
	env := seedPredEnv(baseEnv)
	out := []any{}
	for _, item := range toAnySlice(items) {
		env[param] = item
		if evalTruthy(EvalNode(pred, env)) {
			out = append(out, item)
		}
	}
	return out
}

// EveryEval reports whether every element satisfies the predicate (vacuously
// true for an empty receiver, like JS) — the generalization of bf_every.
func EveryEval(items any, predJSON, param string, baseEnv map[string]any) bool {
	pred, ok := decodeEvalBody(predJSON)
	if !ok {
		return false
	}
	env := seedPredEnv(baseEnv)
	for _, item := range toAnySlice(items) {
		env[param] = item
		if !evalTruthy(EvalNode(pred, env)) {
			return false
		}
	}
	return true
}

// SomeEval reports whether any element satisfies the predicate (false for an
// empty receiver, like JS) — the generalization of bf_some.
func SomeEval(items any, predJSON, param string, baseEnv map[string]any) bool {
	pred, ok := decodeEvalBody(predJSON)
	if !ok {
		return false
	}
	env := seedPredEnv(baseEnv)
	for _, item := range toAnySlice(items) {
		env[param] = item
		if evalTruthy(EvalNode(pred, env)) {
			return true
		}
	}
	return false
}

// FindEval returns the first element satisfying the predicate, or nil when none
// does — the generalization of bf_find. `forward` false searches from the end
// (findLast).
func FindEval(items any, predJSON, param string, forward bool, baseEnv map[string]any) any {
	pred, ok := decodeEvalBody(predJSON)
	if !ok {
		return nil
	}
	env := seedPredEnv(baseEnv)
	arr := toAnySlice(items)
	for n := range arr {
		i := n
		if !forward {
			i = len(arr) - 1 - n
		}
		env[param] = arr[i]
		if evalTruthy(EvalNode(pred, env)) {
			return arr[i]
		}
	}
	return nil
}

// FindIndexEval returns the index of the first element satisfying the predicate,
// or -1 when none does — the generalization of bf_find_index. `forward` false
// searches from the end (findLastIndex).
func FindIndexEval(items any, predJSON, param string, forward bool, baseEnv map[string]any) int {
	pred, ok := decodeEvalBody(predJSON)
	if !ok {
		return -1
	}
	env := seedPredEnv(baseEnv)
	arr := toAnySlice(items)
	for n := range arr {
		i := n
		if !forward {
			i = len(arr) - 1 - n
		}
		env[param] = arr[i]
		if evalTruthy(EvalNode(pred, env)) {
			return i
		}
	}
	return -1
}

// FlatMapEval projects each element through the projection body (a pure
// ParsedExpr JSON evaluated against `{param: item}` + baseEnv) and flattens the
// results one level — the evaluator generalization of bf_flat_map /
// bf_flat_map_tuple. A projection that yields a slice contributes its elements;
// any other value contributes itself (matching JS `.flatMap`, where a non-array
// return is kept as a single element). Returns a non-nil empty slice on a bad
// body so a downstream `range` / `bf_join` sees a real slice.
func FlatMapEval(items any, projJSON, param string, baseEnv map[string]any) []any {
	proj, ok := decodeEvalBody(projJSON)
	if !ok {
		return []any{}
	}
	env := seedPredEnv(baseEnv)
	out := []any{}
	for _, item := range toAnySlice(items) {
		env[param] = item
		v := EvalNode(proj, env)
		if sub, isSlice := v.([]any); isSlice {
			out = append(out, sub...)
		} else {
			out = append(out, v)
		}
	}
	return out
}

// Env builds the captured-free-var environment for FoldEval / SortEval from a
// flat key, value, key, value, … argument list — the adapter emits
// `bf_env "k1" v1 "k2" v2 …` for the free variables a callback body references
// beyond its own params. An odd trailing key with no value is ignored; with no
// pairs it returns an empty (non-nil) map, the no-capture case. A non-string
// key (only reachable by a malformed template call, never by the adapter's
// quoted-literal emit) is skipped rather than collapsed into an `env[""]` slot.
func Env(pairs ...any) map[string]any {
	env := make(map[string]any, len(pairs)/2)
	for i := 0; i+1 < len(pairs); i += 2 {
		key, ok := pairs[i].(string)
		if !ok {
			continue
		}
		env[key] = pairs[i+1]
	}
	return env
}

func evalReadIndex(obj any, index any) any {
	switch o := obj.(type) {
	case []any:
		f := evalToNumber(index)
		i := int(f)
		if float64(i) != f || i < 0 || i >= len(o) {
			return nil
		}
		return o[i]
	case map[string]any:
		return o[evalToString(index)]
	case nil:
		return nil
	default:
		return getFieldValue(obj, evalToString(index))
	}
}
