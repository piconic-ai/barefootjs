package bf

import (
	"encoding/json"
	"os"
	"testing"
)

// evalVectorsPath points at the golden ParsedExpr-evaluator vectors
// (issue #2018, spec/compiler.md "ParsedExpr Evaluator Semantics"),
// generated from the JS reference evaluator and shared with the Perl
// evaluator. The file only exists in the monorepo checkout — consumers
// of the published Go module don't receive it, so the test skips there.
const evalVectorsPath = "../../adapter-tests/helper-vectors/eval-vectors.json"

type evalVector struct {
	Src    string          `json:"src"`
	Expr   json.RawMessage `json:"expr"`
	Env    json.RawMessage `json:"env"`
	Expect json.RawMessage `json:"expect"`
	Note   string          `json:"note"`
}

type evalVectorFile struct {
	Version int          `json:"version"`
	Cases   []evalVector `json:"cases"`
}

// TestEvalVectors proves the Go ParsedExpr evaluator is isomorphic with the
// JS reference: each vector carries a real `ParsedExpr` tree (produced by the
// compiler's parseExpression) plus an environment, and EvalNode must reproduce
// the JS-computed expected value. There are no Go-side divergences — the
// evaluator's coercion is JS-faithful by contract (unlike the bf->string /
// Number helpers, whose SSR-survival divergences are pinned in
// vectorDivergences for the helper vectors).
func TestEvalVectors(t *testing.T) {
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
	if len(file.Cases) == 0 {
		t.Fatal("eval-vectors.json contains no cases")
	}

	for _, c := range file.Cases {
		t.Run(c.Note, func(t *testing.T) {
			// The expr tree is a decoded ParsedExpr (map nodes keyed by
			// "kind"); standard unmarshal is fine since EvalNode coerces
			// numbers as it goes.
			var exprNode any
			if err := json.Unmarshal(c.Expr, &exprNode); err != nil {
				t.Fatalf("decode expr: %v", err)
			}
			// The environment uses the same int-preserving decode as the
			// helper-vector args, so the evaluator exercises the int-typed
			// data templates actually pass.
			envAny, err := decodeVectorValue(c.Env)
			if err != nil {
				t.Fatalf("decode env: %v", err)
			}
			env, _ := envAny.(map[string]any)
			expect, err := decodeVectorValue(c.Expect)
			if err != nil {
				t.Fatalf("decode expect: %v", err)
			}

			got := EvalNode(exprNode, env)
			if !vectorEqual(got, expect) {
				t.Errorf("eval(%s) = %v (%T), want %v (%T)", c.Src, got, got, expect, expect)
			}
		})
	}
}
