package bf

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"testing"
	"text/template"
)

// primitivesDir holds the JS primitive-operation corpus
// (spec/js-primitive-semantics.md, "Conformance"): one <op>.json per
// operation, generated from packages/adapter-tests/vectors/primitives/*.ts.
// Like vectors.json it only exists in the monorepo checkout.
const primitivesDir = "../../adapter-tests/vectors/primitives"

// primitivesLedgerPath is the step-0 expected-failure ledger: the cases that
// fail on each runtime today, each naming the rollout step that removes it.
// It may only shrink (see TestPrimitiveVectors).
const primitivesLedgerPath = "../../adapter-tests/vectors/primitives-expected-failures.json"

// primitivesNativeSafePath lists, per runtime, the vector domains each op's
// NATIVE operator binding runs over: the go-template adapter's NATIVE_SAFE
// claims (spec/js-primitive-semantics.md, "Conformance" item 3), generated
// from the TS table.
const primitivesNativeSafePath = "../../adapter-tests/vectors/primitives-native-safe.json"

// primitiveBindings binds each canonical op id to the Go helper compiled
// templates call. A case whose fn has no binding fails.
var primitiveBindings = map[string]func(args []any) any{
	"truthy":    func(a []any) any { return Truthy(a[0]) },
	"to_number": func(a []any) any { return ToNumber(a[0]) },
	"to_string": func(a []any) any { return ToString(a[0]) },
	"get":       func(a []any) any { return getFieldValue(a[0], a[1]) },
	"strict_eq": func(a []any) any { return Eq(a[0], a[1]) },
	"lt":        func(a []any) any { return Lt(a[0], a[1]) },
	"le":        func(a []any) any { return Le(a[0], a[1]) },
	"gt":        func(a []any) any { return Gt(a[0], a[1]) },
	"ge":        func(a []any) any { return Ge(a[0], a[1]) },
	"plus":      func(a []any) any { return Plus(a[0], a[1]) },
	"neg":       func(a []any) any { return Neg(a[0]) },
}

// nativeIndex is the native Go-template index read, the `index` builtin;
// `capture` hands the read value back with its type.
var nativeIndex = template.Must(template.New("index").Funcs(template.FuncMap{
	"capture": func(box *any, v any) string { *box = v; return "" },
}).Parse(`{{capture .Box (index .Recv .Key)}}`))

// nativeBindings binds each op the adapter can spell natively to the native
// Go-template operator: an index read is the `index` builtin.
// TestPrimitiveNativeVectors runs it over the cases whose domain the adapter
// claims (none today).
var nativeBindings = map[string]func(args []any) any{
	"get": func(a []any) any {
		var got any
		if err := nativeIndex.Execute(io.Discard, map[string]any{"Box": &got, "Recv": a[0], "Key": a[1]}); err != nil {
			panic(err)
		}
		return got
	},
}

type primitiveCase struct {
	Fn     string            `json:"fn"`
	Args   []json.RawMessage `json:"args"`
	Expect json.RawMessage   `json:"expect"`
	Domain string            `json:"domain"`
	Note   string            `json:"note"`
}

type primitiveLedger struct {
	Runtimes map[string]map[string]struct {
		Step int `json:"step"`
	} `json:"runtimes"`
}

func TestPrimitiveVectors(t *testing.T) {
	files, err := filepath.Glob(filepath.Join(primitivesDir, "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Skipf("primitive vectors not available outside the monorepo checkout (%s)", primitivesDir)
	}
	sort.Strings(files)

	raw, err := os.ReadFile(primitivesLedgerPath)
	if err != nil {
		t.Fatalf("read %s: %v", primitivesLedgerPath, err)
	}
	var ledger primitiveLedger
	if err := json.Unmarshal(raw, &ledger); err != nil {
		t.Fatalf("parse %s: %v", primitivesLedgerPath, err)
	}
	expected, ok := ledger.Runtimes["go"]
	if !ok {
		t.Fatalf("%s has no \"go\" runtime", primitivesLedgerPath)
	}

	seen := map[string]bool{}
	total, passed := 0, 0
	for _, path := range files {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var file struct {
			Cases []primitiveCase `json:"cases"`
		}
		if err := json.Unmarshal(data, &file); err != nil {
			t.Fatalf("parse %s: %v", path, err)
		}
		for _, c := range file.Cases {
			key := c.Fn + "/" + c.Note
			seen[key] = true
			total++
			ok, detail := runPrimitiveCase(c)
			entry, listed := expected[key]
			switch {
			case ok && listed:
				t.Errorf("ledger entry %q now passes; remove it from the ledger (step %d)", key, entry.Step)
			case !ok && !listed:
				t.Errorf("UNEXPECTED-FAIL %s: %s", key, detail)
			}
			if ok {
				passed++
			}
		}
	}
	for key := range expected {
		if !seen[key] {
			t.Errorf("ledger entry %q matches no primitives case — renamed note?", key)
		}
	}
	t.Logf("primitives: %d cases, %d pass, %d in the expected-failure ledger", total, passed, len(expected))
}

// runPrimitiveCase reports whether the Go binding returns the case's expect.
// A panic counts as a failure, with its value as the detail.
func runPrimitiveCase(c primitiveCase) (ok bool, detail string) {
	bind, found := primitiveBindings[c.Fn]
	if !found {
		return false, fmt.Sprintf("no Go binding for %q — add it to primitiveBindings", c.Fn)
	}
	return runPrimitiveCaseWith(c, bind)
}

// runPrimitiveCaseWith reports whether `bind` returns the case's expect.
func runPrimitiveCaseWith(c primitiveCase, bind func(args []any) any) (ok bool, detail string) {
	defer func() {
		if r := recover(); r != nil {
			ok, detail = false, fmt.Sprintf("panicked: %v", r)
		}
	}()
	args := make([]any, len(c.Args))
	for i, a := range c.Args {
		v, err := decodePrimitiveValue(a)
		if err != nil {
			return false, err.Error()
		}
		args[i] = v
	}
	expect, err := decodePrimitiveValue(c.Expect)
	if err != nil {
		return false, err.Error()
	}
	got := bind(args)
	if primitiveEqual(got, expect) {
		return true, ""
	}
	return false, fmt.Sprintf("got %#v, want %#v", got, expect)
}

// decodePrimitiveValue decodes like decodeVectorValue and adds the `-0`
// sentinel: {"$num": "-0"} becomes float64 negative zero.
func decodePrimitiveValue(raw json.RawMessage) (any, error) {
	v, err := decodeVectorValue(raw)
	if err != nil {
		return nil, err
	}
	return replaceNegZeroSentinel(v), nil
}

func replaceNegZeroSentinel(v any) any {
	switch x := v.(type) {
	case []any:
		for i := range x {
			x[i] = replaceNegZeroSentinel(x[i])
		}
	case map[string]any:
		if len(x) == 1 && x["$num"] == "-0" {
			return math.Copysign(0, -1)
		}
		for k := range x {
			x[k] = replaceNegZeroSentinel(x[k])
		}
	}
	return v
}

// primitiveEqual is the primitives contract: vectorEqual, except that a
// zero compares by sign (spec/js-primitive-semantics.md, "Conformance"
// item 2) and a boolean must be a real bool.
func primitiveEqual(got, expect any) bool {
	if isNumericValue(expect) && isNumericValue(got) {
		ef, gf := toFloat64(expect), toFloat64(got)
		if ef == 0 && gf == 0 {
			return math.Signbit(ef) == math.Signbit(gf)
		}
	}
	return vectorEqual(got, expect)
}

// TestPrimitiveNativeVectors holds each native claim of the go-template
// adapter's NATIVE_SAFE table to the vectors: every case whose domain the
// claim covers must give the JS answer through the native operator. No
// ledger applies: a native claim the vectors refute is a bug in the table.
func TestPrimitiveNativeVectors(t *testing.T) {
	raw, err := os.ReadFile(primitivesNativeSafePath)
	if err != nil {
		t.Skipf("native claims not available outside the monorepo checkout (%s)", primitivesNativeSafePath)
	}
	var mirror struct {
		Runtimes map[string]map[string][]string `json:"runtimes"`
	}
	if err := json.Unmarshal(raw, &mirror); err != nil {
		t.Fatalf("parse %s: %v", primitivesNativeSafePath, err)
	}
	claims, ok := mirror.Runtimes["go"]
	if !ok {
		t.Fatalf("%s has no \"go\" runtime", primitivesNativeSafePath)
	}
	ran := 0
	for fn, domains := range claims {
		bind, found := nativeBindings[fn]
		if !found {
			t.Errorf("no native Go binding for %q — add it to nativeBindings", fn)
			continue
		}
		data, err := os.ReadFile(filepath.Join(primitivesDir, fn+".json"))
		if err != nil {
			t.Fatal(err)
		}
		var file struct {
			Cases []primitiveCase `json:"cases"`
		}
		if err := json.Unmarshal(data, &file); err != nil {
			t.Fatalf("parse %s.json: %v", fn, err)
		}
		claimed := map[string]bool{}
		for _, d := range domains {
			claimed[d] = true
		}
		for _, c := range file.Cases {
			if !claimed[c.Domain] {
				continue
			}
			ran++
			if ok, detail := runPrimitiveCaseWith(c, bind); !ok {
				t.Errorf("NATIVE-FAIL %s/%s (domain %s): %s", c.Fn, c.Note, c.Domain, detail)
			}
		}
	}
	t.Logf("primitives (native): %d claimed cases", ran)
}
