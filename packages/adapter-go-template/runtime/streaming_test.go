package bf

import (
	"html/template"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStreamingBootstrap(t *testing.T) {
	script := string(StreamingBootstrap())

	if !strings.HasPrefix(script, "<script>") {
		t.Error("StreamingBootstrap should start with <script>")
	}
	if !strings.HasSuffix(script, "</script>") {
		t.Error("StreamingBootstrap should end with </script>")
	}
	if !strings.Contains(script, "__bf_swap") {
		t.Error("StreamingBootstrap should define __bf_swap")
	}
	if !strings.Contains(script, "bf-async") {
		t.Error("StreamingBootstrap should reference bf-async attribute")
	}
}

func TestBfAsyncBoundary(t *testing.T) {
	got := string(BfAsyncBoundary("a0", "<p>Loading...</p>"))
	want := `<div bf-async="a0"><p>Loading...</p></div>`
	if got != want {
		t.Errorf("BfAsyncBoundary = %q, want %q", got, want)
	}
}

func TestBfAsyncBoundaryEmpty(t *testing.T) {
	got := string(BfAsyncBoundary("a1", ""))
	want := `<div bf-async="a1"></div>`
	if got != want {
		t.Errorf("BfAsyncBoundary empty = %q, want %q", got, want)
	}
}

func TestStreamingFuncMap(t *testing.T) {
	fm := StreamingFuncMap()

	if _, ok := fm["bfAsyncBoundary"]; !ok {
		t.Error("StreamingFuncMap missing bfAsyncBoundary")
	}
	if _, ok := fm["bfStreamBootstrap"]; !ok {
		t.Error("StreamingFuncMap missing bfStreamBootstrap")
	}
}

// mockFlusher wraps httptest.ResponseRecorder with http.Flusher support
type mockFlusher struct {
	*httptest.ResponseRecorder
	flushCount int
}

func (f *mockFlusher) Flush() {
	f.flushCount++
}

func TestStreamRendererStreaming(t *testing.T) {
	// Simple template that renders component name
	tmpl := mustParseTemplate(t, `{{define "TestPage"}}Page Content{{end}}`)

	layout := func(ctx *RenderContext) string {
		return "<html><body>" + string(ctx.ComponentHTML) + string(ctx.Scripts) + "</body></html>"
	}

	sr := NewStreamRenderer(tmpl, layout)

	rec := httptest.NewRecorder()
	w := &mockFlusher{ResponseRecorder: rec}

	err := sr.Stream(w, StreamOptions{
		ComponentName: "TestPage",
		Props:         &struct{ ScopeID string }{ScopeID: "TestPage_abc"},
		Boundaries: []AsyncBoundary{
			{
				ID:           "a0",
				FallbackHTML: "<p>Loading...</p>",
				Resolve: func() (string, error) {
					return `<div bf-s="Counter_x1">42</div>`, nil
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}

	body := rec.Body.String()

	// Initial page should be present
	if !strings.Contains(body, "Page Content") {
		t.Error("Response should contain initial page content")
	}

	// Resolve chunk should be present
	if !strings.Contains(body, `bf-async-resolve="a0"`) {
		t.Error("Response should contain resolve template for a0")
	}
	if !strings.Contains(body, `__bf_swap("a0")`) {
		t.Error("Response should contain swap script for a0")
	}
	if !strings.Contains(body, `bf-s="Counter_x1"`) {
		t.Error("Response should contain resolved component content")
	}

	// Should have flushed at least once (initial page)
	if w.flushCount < 1 {
		t.Errorf("Expected at least 1 flush, got %d", w.flushCount)
	}
}

func TestStreamRendererMultipleBoundaries(t *testing.T) {
	tmpl := mustParseTemplate(t, `{{define "Multi"}}Multi{{end}}`)

	layout := func(ctx *RenderContext) string {
		return string(ctx.ComponentHTML)
	}

	sr := NewStreamRenderer(tmpl, layout)

	rec := httptest.NewRecorder()
	w := &mockFlusher{ResponseRecorder: rec}

	err := sr.Stream(w, StreamOptions{
		ComponentName: "Multi",
		Props:         &struct{ ScopeID string }{ScopeID: "Multi_abc"},
		Boundaries: []AsyncBoundary{
			{
				ID:           "a0",
				FallbackHTML: "Loading 1",
				Resolve: func() (string, error) {
					return "<div>Content 1</div>", nil
				},
			},
			{
				ID:           "a1",
				FallbackHTML: "Loading 2",
				Resolve: func() (string, error) {
					return "<div>Content 2</div>", nil
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}

	body := rec.Body.String()

	if !strings.Contains(body, `bf-async-resolve="a0"`) {
		t.Error("Response should contain resolve for a0")
	}
	if !strings.Contains(body, `bf-async-resolve="a1"`) {
		t.Error("Response should contain resolve for a1")
	}
	if !strings.Contains(body, "Content 1") {
		t.Error("Response should contain Content 1")
	}
	if !strings.Contains(body, "Content 2") {
		t.Error("Response should contain Content 2")
	}
}

func TestStreamRendererNoFlusher(t *testing.T) {
	tmpl := mustParseTemplate(t, `{{define "NoFlush"}}NoFlush{{end}}`)

	layout := func(ctx *RenderContext) string {
		return string(ctx.ComponentHTML)
	}

	sr := NewStreamRenderer(tmpl, layout)

	// Use plain ResponseRecorder (no Flusher interface)
	rec := httptest.NewRecorder()

	err := sr.Stream(rec, StreamOptions{
		ComponentName: "NoFlush",
		Props:         &struct{ ScopeID string }{ScopeID: "NoFlush_abc"},
		Boundaries: []AsyncBoundary{
			{
				ID:           "a0",
				FallbackHTML: "Loading",
				Resolve: func() (string, error) {
					return "<div>Resolved</div>", nil
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}

	body := rec.Body.String()
	// Should still contain everything (blocking mode)
	if !strings.Contains(body, "NoFlush") {
		t.Error("Blocking mode should render page content")
	}
	if !strings.Contains(body, "Resolved") {
		t.Error("Blocking mode should resolve boundaries inline")
	}
}

func TestStreamRendererErrorBoundary(t *testing.T) {
	tmpl := mustParseTemplate(t, `{{define "ErrPage"}}ErrPage{{end}}`)

	layout := func(ctx *RenderContext) string {
		return string(ctx.ComponentHTML)
	}

	sr := NewStreamRenderer(tmpl, layout)

	rec := httptest.NewRecorder()
	w := &mockFlusher{ResponseRecorder: rec}

	err := sr.Stream(w, StreamOptions{
		ComponentName: "ErrPage",
		Props:         &struct{ ScopeID string }{ScopeID: "ErrPage_abc"},
		Boundaries: []AsyncBoundary{
			{
				ID:           "a0",
				FallbackHTML: "Loading",
				Resolve: func() (string, error) {
					return "", http.ErrAbortHandler
				},
			},
		},
	})

	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}

	body := rec.Body.String()
	// Failed boundary should not produce a resolve chunk
	if strings.Contains(body, `bf-async-resolve="a0"`) {
		t.Error("Failed boundary should not produce resolve chunk")
	}
}

func mustParseTemplate(t *testing.T, text string) *template.Template {
	t.Helper()
	tmpl, err := template.New("").Funcs(FuncMap()).Parse(text)
	if err != nil {
		t.Fatalf("Failed to parse template: %v", err)
	}
	return tmpl
}
