package bf

import (
	"bytes"
	"encoding/json"
	"fmt"
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
	"add": func(args []any) any { return Add(args[0], args[1]) },
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

	for i, c := range file.Cases {
		t.Run(fmt.Sprintf("%s/%s", c.Fn, c.Note), func(t *testing.T) {
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
			if !vectorEqual(got, expect) {
				t.Errorf("%s(%s) = %v (%T), want %v (%T)", c.Fn, string(mustJoinRaw(c.Args)), got, got, expect, expect)
			}
		})
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
		return isNumericValue(got) && toFloat64(got) == toFloat64(expect)
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
