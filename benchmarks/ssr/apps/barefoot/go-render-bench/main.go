// SSR render-gap investigation, item 4: is Hono the slow adapter among
// barefoot's own backends, or does the JS-tree-walking cost that
// hono/jsx pays disappear once the compiled *text/template* is executed
// by Go's html/template package instead? Standalone script, not part of
// the product.
//
// Loads the SAME fixed 1,000-row dataset (../../../data.json) the Hono /
// React / Solid benches use, parses the marked template ONCE (mirrors a
// real Go server: `html/template.Parse` runs at startup, not per
// request), then times `bf.Renderer.RenderFragment` — the real production
// entry point (BfIsRoot wiring, bf-p JSON marshal, script/portal
// collectors) — in a tight WARMUP+MEASURE loop, the Go analogue of
// bench-ssr.ts's measureServerRender. Writes one JSON array of per-call
// elapsed milliseconds to timings.json so the caller can compute stats
// the same way the JS harnesses do (median of N, see runner/stats.ts).
package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"math/rand"
	"os"
	"runtime/pprof"
	"strings"
	"time"

	bf "github.com/barefootjs/runtime/bf"
)

var _ = bf.FuncMap

// randomID generates a random alphanumeric string of given length.
// Required by generated NewXxxProps constructors.
func randomID(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

const tmplContent = `{{define "BenchSsr"}}
{{if .Scripts}}{{.Scripts.Register "/static/client/barefoot.js"}}{{.Scripts.Register "/static/client/BenchSsr.client.js"}}{{end}}
<table class="table" bf-s="{{bfScopeAttr .}}" {{bfHydrationAttrs .}} {{bfPropsAttr .}}{{if .BfDataKey}} data-key="{{.BfDataKey}}"{{end}}><tbody id="tbody" bf="s4">{{bfComment "loop:l0"}}{{range $_, $row := .InitialRows}}<tr data-key="{{.ID}}" class="{{if eq $.Selected .ID}}danger{{else}}{{end}}" bf="s3"><td class="col-md-1">{{bfTextStart "s0"}}{{.ID}}{{bfTextEnd}}</td><td class="col-md-4"><a class="lbl" bf="s2">{{bfTextStart "s1"}}{{.Label}}{{bfTextEnd}}</a></td><td class="col-md-1"><a class="remove">x</a></td><td class="col-md-6"></td></tr>{{end}}{{bfComment "/loop:l0"}}</tbody></table>
{{end}}
`

func main() {
	data, err := os.ReadFile("../../../data.json")
	if err != nil {
		panic(err)
	}
	var rows []RowData
	if err := json.Unmarshal(data, &rows); err != nil {
		panic(err)
	}

	root := template.New("").Funcs(bf.FuncMap())
	root = root.Funcs(bf.TemplateFuncMap(root))
	tmpl := template.Must(root.Parse(tmplContent))
	renderer := bf.NewRenderer(tmpl, nil)

	// render runs the SAME production entry point a real Go app uses for a
	// standalone island (bf.Renderer.RenderFragment): reflection-based
	// BfIsRoot/Scripts wiring + BfPropsAttr's json.Marshal(props) for bf-p,
	// exactly like Render — not the bare tmpl.ExecuteTemplate the adapter
	// conformance harness (test-render.ts) uses, which SKIPS that wiring and
	// so under-counts real per-request cost. Fresh props + collectors each
	// call, mirroring one HTTP request.
	render := func() template.HTML {
		props := NewBenchSsrProps(BenchSsrInput{
			ScopeID:     "BenchSsr_bench",
			InitialRows: rows,
		})
		sc := bf.NewScriptCollector()
		pc := bf.NewPortalCollector()
		return renderer.RenderFragment(bf.RenderOptions{
			ComponentName: "BenchSsr",
			Props:         &props,
		}, sc, pc)
	}

	one := render()
	if err := os.WriteFile("one.html", []byte(one), 0o644); err != nil {
		panic(err)
	}
	fmt.Printf("rows(<tr): %d, bytes: %d, has bf-p: %v\n",
		strings.Count(string(one), "<tr"), len(one), strings.Contains(string(one), "bf-p"))

	const warmup = 50
	const measure = 2000

	for i := 0; i < warmup; i++ {
		_ = render()
	}

	profFile, err := os.Create("cpu.prof")
	if err != nil {
		panic(err)
	}
	defer profFile.Close()
	if err := pprof.StartCPUProfile(profFile); err != nil {
		panic(err)
	}

	iterations := make([]float64, measure)
	for i := 0; i < measure; i++ {
		t0 := time.Now()
		_ = render()
		iterations[i] = time.Since(t0).Seconds() * 1000 // ms
	}
	pprof.StopCPUProfile()

	out, _ := json.Marshal(iterations)
	if err := os.WriteFile("timings.json", out, 0o644); err != nil {
		panic(err)
	}
	fmt.Println("wrote timings.json")
}
