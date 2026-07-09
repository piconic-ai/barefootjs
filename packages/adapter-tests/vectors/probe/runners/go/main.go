// Probe runner (Go template evaluator). Reads $PROBE_VECTORS, evaluates each
// case through the public bf.EvalNode, and prints a classified line per
// divergence. Standalone module (see go.mod's replace) so it imports only the
// exported evaluator, never the adapter package's test helpers. See ../../README.md.
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"

	bf "github.com/barefootjs/runtime/bf"
)

type probeFile struct {
	Cases []struct {
		Expr     json.RawMessage `json:"expr"`
		Env      json.RawMessage `json:"env"`
		Expect   json.RawMessage `json:"expect"`
		Category string          `json:"category"`
		Known    bool            `json:"known"`
		Note     string          `json:"note"`
	} `json:"cases"`
}

// decodeNum preserves the int/float distinction the evaluator's env and expect
// carry (JSON integers stay integers), mirroring the committed harness's
// decodeVectorValue.
func decode(raw json.RawMessage) any {
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.UseNumber()
	var v any
	dec.Decode(&v)
	return normalize(v)
}

func normalize(v any) any {
	switch x := v.(type) {
	case json.Number:
		s := x.String()
		if !strings.ContainsAny(s, ".eE") {
			if i, err := x.Int64(); err == nil {
				return int(i)
			}
		}
		f, _ := x.Float64()
		return f
	case []any:
		for i := range x {
			x[i] = normalize(x[i])
		}
		return x
	case map[string]any:
		for k := range x {
			x[k] = normalize(x[k])
		}
		return x
	default:
		return v
	}
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case float64:
		return n, true
	default:
		return 0, false
	}
}

func match(got, expect any) bool {
	if expect == nil {
		return got == nil
	}
	if m, ok := expect.(map[string]any); ok {
		if kind, ok := m["$num"].(string); ok && len(m) == 1 {
			g, ok := toFloat(got)
			if !ok {
				return false
			}
			switch kind {
			case "NaN":
				return math.IsNaN(g)
			case "Infinity":
				return math.IsInf(g, 1)
			case "-Infinity":
				return math.IsInf(g, -1)
			}
		}
	}
	switch e := expect.(type) {
	case bool:
		g, ok := got.(bool)
		return ok && g == e
	case []any:
		g, ok := got.([]any)
		if !ok || len(g) != len(e) {
			return false
		}
		for i := range e {
			if !match(g[i], e[i]) {
				return false
			}
		}
		return true
	case map[string]any:
		g, ok := got.(map[string]any)
		if !ok || len(g) != len(e) {
			return false
		}
		for k, v := range e {
			gv, present := g[k]
			if !present || !match(gv, v) {
				return false
			}
		}
		return true
	case string:
		g, ok := got.(string)
		return ok && g == e
	default:
		ef, eIsNum := toFloat(expect)
		gf, gIsNum := toFloat(got)
		if eIsNum != gIsNum {
			return false
		}
		if eIsNum {
			return ef == gf
		}
		return false
	}
}

func main() {
	data, err := os.ReadFile(os.Getenv("PROBE_VECTORS"))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	var doc probeFile
	if err := json.Unmarshal(data, &doc); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	n := 0
	for _, c := range doc.Cases {
		n++
		var exprNode any
		json.Unmarshal(c.Expr, &exprNode)
		envAny := decode(c.Env)
		env, _ := envAny.(map[string]any)
		expect := decode(c.Expect)
		var got any
		func() {
			defer func() {
				if r := recover(); r != nil {
					fmt.Printf("ERROR\t%s\t%s\tpanic: %v\n", c.Category, c.Note, r)
					got = "\x00panic"
				}
			}()
			got = bf.EvalNode(exprNode, env)
		}()
		if got == "\x00panic" {
			continue
		}
		if !match(got, expect) {
			kind := "NEW"
			if c.Known {
				kind = "KNOWN"
			}
			fmt.Printf("%s\t%s\t%s\t%v\t%s\n", kind, c.Category, c.Note, got, string(c.Expect))
		}
	}
	fmt.Printf("RAN\t%d\n", n)
}
