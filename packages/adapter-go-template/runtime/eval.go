package bf

import (
	"encoding/json"
	"math"
	"reflect"
	"sort"
	"strconv"
	"strings"
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

// EvalExpr evaluates a pure ParsedExpr (carried as its JSON encoding) against
// env. The result is a value in the JSON domain (float64, string, bool, nil,
// []any, map[string]any). A malformed tree yields nil.
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
			return len([]rune(o))
		}
		return nil
	case []any:
		if key == "length" {
			return len(o)
		}
		return nil
	case map[string]any:
		// A missing key reads as null (the backends' single absent value).
		return o[key]
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
	if v.Kind() != reflect.Slice && v.Kind() != reflect.Array {
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
// item}` for each element; `init` seeds the accumulator and `direction` is
// "left" (reduce) or "right" (reduceRight). This is the evaluator-based
// generalization of bf_reduce — any reducer body, not just the `+`/`*`
// arithmetic catalogue, and `acc` may appear anywhere in the body.
func FoldEval(items any, bodyJSON, accName, itemName string, init any, direction string) any {
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
	env := make(map[string]any, 2)
	for _, item := range arr {
		env[accName] = acc
		env[itemName] = item
		acc = EvalNode(body, env)
	}
	return acc
}

// SortEval returns a new stable-sorted slice ordered by a ParsedExpr
// comparator body (JSON) evaluated against `{paramA: a, paramB: b}` to a
// number (negative / zero / positive, like a JS comparator). This is the
// evaluator-based generalization of bf_sort — any comparator body, not just
// the subtraction / relational-ternary catalogue. Non-mutating.
func SortEval(items any, cmpJSON, paramA, paramB string) []any {
	arr := toAnySlice(items)
	if arr == nil {
		return nil
	}
	var cmp any
	if err := json.Unmarshal([]byte(cmpJSON), &cmp); err != nil {
		return arr
	}
	sort.SliceStable(arr, func(i, j int) bool {
		env := map[string]any{paramA: arr[i], paramB: arr[j]}
		return evalToNumber(EvalNode(cmp, env)) < 0
	})
	return arr
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
