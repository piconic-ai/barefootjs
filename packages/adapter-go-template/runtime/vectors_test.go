package bf

import (
	"bytes"
	"encoding/json"
	"math"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"
)

// vectorsPath points at the golden vectors generated from the JS
// reference implementations (spec/template-helpers.md). The file only
// exists in the monorepo checkout — consumers of the published Go
// module don't receive it, so TestHelperVectors skips there.
const vectorsPath = "../../adapter-tests/vectors/vectors.json"

// vectorDivergencesPath points at this backend's declared divergences
// from the JS-normative expect (spec/template-helpers.md "Adapter
// status model"). Package-local (testdata/, Go's conventional location
// for test fixtures), so it's always present regardless of whether the
// golden vectors themselves are available outside the monorepo
// checkout. Loaded inside TestHelperVectors, after the vectors file
// itself is confirmed present, so the not-in-monorepo skip above
// already happened before this one would ever fire.
const vectorDivergencesPath = "testdata/vector-divergences.json"

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
	"min":    func(args []any) any { return Min(args[0], args[1]) },
	"max":    func(args []any) any { return Max(args[0], args[1]) },
	"abs":    func(args []any) any { return Abs(args[0]) },
	"to_fixed": func(args []any) any {
		if len(args) > 1 {
			return ToFixed(args[0], args[1].(int))
		}
		return ToFixed(args[0], 0)
	},
	"lower":      func(args []any) any { return Lower(args[0].(string)) },
	"upper":      func(args []any) any { return Upper(args[0].(string)) },
	"trim":       func(args []any) any { return Trim(args[0].(string)) },
	"trim_start": func(args []any) any { return TrimStart(args[0].(string)) },
	"trim_end":   func(args []any) any { return TrimEnd(args[0].(string)) },
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
	"replace":     func(args []any) any { return Replace(args[0].(string), args[1].(string), args[2].(string)) },
	"replace_all": func(args []any) any { return ReplaceAll(args[0].(string), args[1].(string), args[2].(string)) },
	"repeat":      func(args []any) any { return Repeat(args[0].(string), args[1].(int)) },
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
	"flat_dynamic":  func(args []any) any { return FlatDynamicDepth(args[0], args[1]) },
	"join":          func(args []any) any { return Join(args[0], args[1].(string)) },
	"arr":           func(args []any) any { return Arr(args...) },
	"filter_truthy": func(args []any) any { return FilterTruthy(args[0]) },
	"search_params_get": func(args []any) any {
		return NewSearchParams(args[0].(string)).Get(args[1].(string))
	},
	"query":      func(args []any) any { return Query(args[0].(string), args[1:]...) },
	"date":       func(args []any) any { return Date(args[0], args[1].(string)) },
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

// divergenceEntry pins one deliberate divergence of THIS backend from
// the JS-normative expect (spec/template-helpers.md "Adapter status
// model"). The harness asserts the pinned value, so the divergence
// itself is regression-tested; if the backend later matches JS, the
// stale declaration fails so it gets removed.
type divergenceEntry struct {
	Expect json.RawMessage `json:"expect"`
	Throws bool            `json:"throws"`
	Reason string          `json:"reason"`
}

// divergenceFile is the shape of vectorDivergencesPath. Keyed by the
// case key `fn + "/" + note`, it is the single source of truth for the
// Go backend's divergences and unsupported helpers — the spec stays
// backend-neutral.
type divergenceFile struct {
	Version     int                        `json:"version"`
	Backend     string                     `json:"backend"`
	Divergences map[string]divergenceEntry `json:"divergences"`
	Unsupported map[string]string          `json:"unsupported"`
}

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

	// Declarations live in vectorDivergencesPath, not inline, so this
	// harness and the other backends' harnesses share one JSON schema
	// (spec/template-helpers.md "Adapter status model"). This harness
	// still enforces the machinery itself: stale declarations (the
	// backend now matches JS) and dead declarations (the case they
	// reference no longer exists) both fail the suite.
	divData, err := os.ReadFile(vectorDivergencesPath)
	if err != nil {
		t.Fatalf("read %s: %v", vectorDivergencesPath, err)
	}
	var divFile divergenceFile
	if err := json.Unmarshal(divData, &divFile); err != nil {
		t.Fatalf("parse %s: %v", vectorDivergencesPath, err)
	}

	declared := make(map[string]bool, len(divFile.Divergences))
	for i, c := range file.Cases {
		key := c.Fn + "/" + c.Note
		t.Run(key, func(t *testing.T) {
			if reason, ok := divFile.Unsupported[c.Fn]; ok {
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
			if d, ok := divFile.Divergences[key]; ok {
				declared[key] = true
				if vectorEqual(got, expect) {
					t.Errorf("stale divergence declaration for %q — the backend now matches JS (%v); remove it", key, got)
					return
				}
				if d.Throws {
					t.Fatalf("throws divergences are not supported by the Go harness — bindings return values")
				}
				if d.Expect == nil {
					t.Fatalf("malformed divergence declaration for %q: missing expect", key)
				}
				pinned, err := decodeVectorValue(d.Expect)
				if err != nil {
					t.Fatalf("case %d: decode divergence expect: %v", i, err)
				}
				if !vectorEqual(got, pinned) {
					t.Errorf("divergence drift for %q: got %v (%T), pinned %v (%s)", key, got, got, pinned, d.Reason)
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
	for key := range divFile.Divergences {
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
			// Native-date arg sentinel (#2288): {"$date": "<ISO>"},
			// materialized into the runtime's own time.Time so Date()'s
			// native-receiver branch (not just its string branch) is
			// exercised. Parse failure panics rather than silently
			// falling through to the zero-value branch under test.
			if s, ok := x["$date"].(string); ok {
				t, err := time.Parse(time.RFC3339Nano, s)
				if err != nil {
					panic(err)
				}
				return t
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
