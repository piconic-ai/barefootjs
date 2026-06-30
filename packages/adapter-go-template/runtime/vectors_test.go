package bf

import (
	"bytes"
	"encoding/json"
	"math"
	"os"
	"strconv"
	"strings"
	"testing"
)

// vectorsPath points at the golden vectors generated from the JS
// reference implementations (spec/template-helpers.md). The file only
// exists in the monorepo checkout — consumers of the published Go
// module don't receive it, so TestHelperVectors skips there.
const vectorsPath = "../../adapter-tests/helper-vectors/vectors.json"

type helperVector struct {
	Fn     string            `json:"fn"`
	Args   []json.RawMessage `json:"args"`
	Expect json.RawMessage   `json:"expect"`
	Note   string            `json:"note"`
}

type vectorFile struct {
	Version int            `json:"version"`
	Cases   []helperVector `json:"cases"`
}

// vectorBindings maps a canonical helper id from the spec catalogue to
// the Go implementation the compiled templates call. Per the spec, a
// vector whose fn has no binding here FAILS the test — the Go backend
// is not allowed to silently fall behind the catalogue.
var vectorBindings = map[string]func(args []any) any{
	"add":    func(args []any) any { return Add(args[0], args[1]) },
	"sub":    func(args []any) any { return Sub(args[0], args[1]) },
	"mul":    func(args []any) any { return Mul(args[0], args[1]) },
	"div":    func(args []any) any { return Div(args[0], args[1]) },
	"mod":    func(args []any) any { return Mod(args[0], args[1]) },
	"neg":    func(args []any) any { return Neg(args[0]) },
	"string": func(args []any) any { return String(args[0]) },
	"json": func(args []any) any {
		s, err := JSON(args[0])
		if err != nil {
			// Surface the error as the compared value so the mismatch
			// message shows what went wrong.
			return err
		}
		return s
	},
	"number": func(args []any) any { return Number(args[0]) },
	"floor":  func(args []any) any { return Floor(args[0]) },
	"ceil":   func(args []any) any { return Ceil(args[0]) },
	"round":  func(args []any) any { return Round(args[0]) },
	"to_fixed": func(args []any) any {
		if len(args) > 1 {
			return ToFixed(args[0], args[1].(int))
		}
		return ToFixed(args[0], 0)
	},
	"lower": func(args []any) any { return Lower(args[0].(string)) },
	"upper": func(args []any) any { return Upper(args[0].(string)) },
	"trim":  func(args []any) any { return Trim(args[0].(string)) },
	"starts_with": func(args []any) any {
		if len(args) > 2 {
			return StartsWith(args[0].(string), args[1].(string), args[2].(int))
		}
		return StartsWith(args[0].(string), args[1].(string))
	},
	"ends_with": func(args []any) any {
		if len(args) > 2 {
			return EndsWith(args[0].(string), args[1].(string), args[2].(int))
		}
		return EndsWith(args[0].(string), args[1].(string))
	},
	"replace": func(args []any) any { return Replace(args[0].(string), args[1].(string), args[2].(string)) },
	"repeat":  func(args []any) any { return Repeat(args[0].(string), args[1].(int)) },
	"pad_start": func(args []any) any {
		if len(args) > 2 {
			return PadStart(args[0].(string), args[1].(int), args[2].(string))
		}
		return PadStart(args[0].(string), args[1].(int))
	},
	"pad_end": func(args []any) any {
		if len(args) > 2 {
			return PadEnd(args[0].(string), args[1].(int), args[2].(string))
		}
		return PadEnd(args[0].(string), args[1].(int))
	},
	"split": func(args []any) any {
		if len(args) > 2 {
			return Split(args[0].(string), args[1].(string), args[2].(int))
		}
		return Split(args[0].(string), args[1].(string))
	},
	"len":           func(args []any) any { return Len(args[0]) },
	"at":            func(args []any) any { return At(args[0], args[1].(int)) },
	"includes":      func(args []any) any { return Includes(args[0], args[1]) },
	"index_of":      func(args []any) any { return IndexOf(args[0], args[1]) },
	"last_index_of": func(args []any) any { return LastIndexOf(args[0], args[1]) },
	"concat":        func(args []any) any { return Concat(args[0], args[1]) },
	"slice": func(args []any) any {
		if len(args) > 2 {
			return Slice(args[0], args[1].(int), args[2].(int))
		}
		return Slice(args[0], args[1].(int))
	},
	"reverse":       func(args []any) any { return Reverse(args[0]) },
	"flat":          func(args []any) any { return Flat(args[0], args[1].(int)) },
	"join":          func(args []any) any { return Join(args[0], args[1].(string)) },
	"arr":           func(args []any) any { return Arr(args...) },
	"filter_truthy": func(args []any) any { return FilterTruthy(args[0]) },
	"search_params_get": func(args []any) any {
		return NewSearchParams(args[0].(string)).Get(args[1].(string))
	},
	"query":      func(args []any) any { return Query(args[0].(string), args[1:]...) },
	"every":      func(args []any) any { return Every(args[0], args[1].(string)) },
	"some":       func(args []any) any { return Some(args[0], args[1].(string)) },
	"filter":     func(args []any) any { return Filter(args[0], args[1].(string), args[2]) },
	"find":       func(args []any) any { return Find(args[0], args[1].(string), args[2]) },
	"find_index": func(args []any) any { return FindIndex(args[0], args[1].(string), args[2]) },
	"find_last":  func(args []any) any { return FindLast(args[0], args[1].(string), args[2]) },
	"find_last_index": func(args []any) any {
		return FindLastIndex(args[0], args[1].(string), args[2])
	},
	"sort": func(args []any) any { return Sort(args[0], toStringSlice(args[1:])...) },
	"reduce": func(args []any) any {
		return Reduce(args[0], args[1].(string), args[2].(string), args[3].(string),
			args[4].(string), args[5].(string), args[6].(string))
	},
	"flat_map": func(args []any) any { return FlatMap(args[0], args[1].(string), args[2].(string)) },
	"flat_map_tuple": func(args []any) any {
		return FlatMapTuple(args[0], toStringSlice(args[1:])...)
	},
}

func toStringSlice(args []any) []string {
	out := make([]string, len(args))
	for i, a := range args {
		out[i] = a.(string)
	}
	return out
}

// vectorDivergence pins one deliberate divergence of THIS backend
// from the JS-normative expect (spec/template-helpers.md "Adapter
// status model"). The harness asserts the pinned value, so the
// divergence itself is regression-tested; if the backend later
// matches JS, the stale declaration fails so it gets removed.
type vectorDivergence struct {
	expect any
	reason string
}

// Keyed by the case key `fn + "/" + note`. This table is the single
// source of truth for the Go backend's divergences — the spec stays
// backend-neutral.
var vectorDivergences = map[string]vectorDivergence{
	"div/zero divisor yields Infinity": {
		expect: 0,
		reason: "bf.Div degrades to 0 so a template render survives instead of emitting +Inf",
	},
	"mod/float remainder": {
		expect: 1,
		reason: "bf.Mod truncates operands to integers",
	},
	"number/empty string coerces to 0": {
		expect: math.NaN(),
		reason: "deliberate: empty input must not silently zero downstream arithmetic",
	},
	"number/null coerces to 0": {
		expect: math.NaN(),
		reason: "deliberate: unset props must not silently zero downstream arithmetic",
	},
	"number/surrounding whitespace is trimmed": {
		expect: math.NaN(),
		reason: "strconv.ParseFloat does not trim whitespace",
	},
	"string/null renders as the string \"null\"": {
		expect: "",
		reason: "deliberate: an unset prop must not surface a literal \"null\" in HTML",
	},
	"round/negative half rounds toward +Infinity": {
		expect: -2.0,
		reason: "math.Round is half-away-from-zero",
	},
	"round/negative half rounds toward +Infinity (away tie)": {
		expect: -3.0,
		reason: "math.Round is half-away-from-zero",
	},
	"sort/localeCompare orders case-insensitively (ICU collation)": {
		expect: []any{"B", "a"},
		reason: "strings.Compare is byte order, not ICU collation",
	},
	"sort/relational compare on numeric strings is lexical": {
		expect: []any{"9", "10"},
		reason: "the \"auto\" compare goes numeric when both keys parse as numbers",
	},
	"reduce/numeric-string items concatenate under JS +": {
		expect: 11.0,
		reason: "numeric folds parse numeric strings (toFloat64WithOK) instead of concatenating",
	},
	"search_params_get/absent key is null": {
		expect: "",
		reason: "url.Values.Get returns \"\" for an absent key where JS URLSearchParams.get returns null; the ?? → or lowering folds both to the author default, so SSR output still matches",
	},
	"query/included-but-empty value is omitted": {
		expect: "/?tag=",
		reason: "Go's Query has no value-emptiness check: lowerQueryHrefCall folds `ne value \"\"` INTO the include flag (`and (cond) (ne value \"\")`), so the compiler never emits an included-empty triple. The Perl helper instead omits empties itself, so the two helpers split that responsibility; real SSR output matches the client on both.",
	},
}

// vectorUnsupported marks helper ids this backend has not implemented
// yet (skipped visibly with the reason). Empty for Go — the binding
// table is complete; the mechanism exists so a bootstrapping backend
// can land its harness first and burn the list down. Note the Go
// FuncMap also carries bf_first/bf_last/bf_contains, which the
// compiler never emits — they are Go-internal conveniences outside
// the catalogue, not entries for this list.
var vectorUnsupported = map[string]string{}

func TestHelperVectors(t *testing.T) {
	data, err := os.ReadFile(vectorsPath)
	if os.IsNotExist(err) {
		t.Skipf("golden vectors not available outside the monorepo checkout (%s)", vectorsPath)
	}
	if err != nil {
		t.Fatalf("read %s: %v", vectorsPath, err)
	}

	var file vectorFile
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("parse %s: %v", vectorsPath, err)
	}
	if len(file.Cases) == 0 {
		t.Fatal("vectors.json contains no cases")
	}

	declared := make(map[string]bool, len(vectorDivergences))
	for i, c := range file.Cases {
		key := c.Fn + "/" + c.Note
		t.Run(key, func(t *testing.T) {
			if reason, ok := vectorUnsupported[c.Fn]; ok {
				t.Skipf("unsupported on this backend: %s", reason)
			}
			bind, ok := vectorBindings[c.Fn]
			if !ok {
				t.Fatalf("no Go binding for helper %q — add it to vectorBindings", c.Fn)
			}
			args := make([]any, len(c.Args))
			for j, raw := range c.Args {
				v, err := decodeVectorValue(raw)
				if err != nil {
					t.Fatalf("case %d: decode arg %d: %v", i, j, err)
				}
				args[j] = v
			}
			expect, err := decodeVectorValue(c.Expect)
			if err != nil {
				t.Fatalf("case %d: decode expect: %v", i, err)
			}
			got := bind(args)
			if d, ok := vectorDivergences[key]; ok {
				declared[key] = true
				if vectorEqual(got, expect) {
					t.Errorf("stale divergence declaration for %q — the backend now matches JS (%v); remove it", key, got)
					return
				}
				if !vectorEqual(got, d.expect) {
					t.Errorf("divergence drift for %q: got %v (%T), pinned %v (%s)", key, got, got, d.expect, d.reason)
				}
				return
			}
			if !vectorEqual(got, expect) {
				t.Errorf("%s(%s) = %v (%T), want %v (%T)", c.Fn, string(mustJoinRaw(c.Args)), got, got, expect, expect)
			}
		})
	}
	// A declaration referencing a case that no longer exists is dead —
	// likely a renamed note. Fail so the key gets re-pointed.
	for key := range vectorDivergences {
		if !declared[key] {
			t.Errorf("divergence declaration %q matches no vector case — renamed note?", key)
		}
	}
}

func mustJoinRaw(raws []json.RawMessage) []byte {
	parts := make([][]byte, len(raws))
	for i, r := range raws {
		parts[i] = []byte(r)
	}
	return bytes.Join(parts, []byte(", "))
}

// decodeVectorValue decodes a JSON value with integral numbers mapped
// to Go int — template data is typically int-typed (struct fields,
// range indices), so this exercises the int-preserving helper paths —
// and all other numbers to float64.
func decodeVectorValue(raw json.RawMessage) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	return normalizeVectorValue(v), nil
}

func normalizeVectorValue(v any) any {
	switch x := v.(type) {
	case json.Number:
		if !strings.ContainsAny(x.String(), ".eE") {
			if n, err := strconv.ParseInt(x.String(), 10, 64); err == nil {
				return int(n)
			}
		}
		f, _ := x.Float64()
		return f
	case []any:
		for i := range x {
			x[i] = normalizeVectorValue(x[i])
		}
		return x
	case map[string]any:
		// Reserved non-finite sentinel (spec/template-helpers.md):
		// {"$num": "NaN" | "Infinity" | "-Infinity"}.
		if len(x) == 1 {
			if s, ok := x["$num"].(string); ok {
				switch s {
				case "NaN":
					return math.NaN()
				case "Infinity":
					return math.Inf(1)
				case "-Infinity":
					return math.Inf(-1)
				}
			}
		}
		for k := range x {
			x[k] = normalizeVectorValue(x[k])
		}
		return x
	}
	return v
}

// vectorEqual implements the spec's value-compat contract: numbers
// compare numerically regardless of Go type (int 3 == float64 3),
// everything else compares structurally.
func vectorEqual(got, expect any) bool {
	if expect == nil {
		return got == nil
	}
	if isNumericValue(expect) {
		if !isNumericValue(got) {
			return false
		}
		ef, gf := toFloat64(expect), toFloat64(got)
		if math.IsNaN(ef) {
			return math.IsNaN(gf)
		}
		return gf == ef
	}
	switch e := expect.(type) {
	case string:
		s, ok := got.(string)
		return ok && s == e
	case bool:
		b, ok := got.(bool)
		return ok && b == e
	case []any:
		g, ok := got.([]any)
		if !ok || len(g) != len(e) {
			return false
		}
		for i := range e {
			if !vectorEqual(g[i], e[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		g, ok := got.(map[string]any)
		if !ok || len(g) != len(e) {
			return false
		}
		for k := range e {
			gv, present := g[k]
			if !present || !vectorEqual(gv, e[k]) {
				return false
			}
		}
		return true
	}
	return false
}

func isNumericValue(v any) bool {
	switch v.(type) {
	case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64:
		return true
	}
	return false
}
