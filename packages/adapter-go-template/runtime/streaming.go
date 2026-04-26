// Package bf — Out-of-Order Streaming SSR helpers
//
// Provides StreamRenderer for progressive page rendering using HTTP
// chunked transfer encoding. Async boundaries display fallback content
// immediately (fast TTFB), then swap in resolved content as data arrives.
//
// Works with any Go HTTP server that supports http.Flusher (net/http,
// chi, gorilla/mux, echo, fiber, etc.).
package bf

import (
	"bytes"
	"fmt"
	"html/template"
	"net/http"
	"sync"
)

// AsyncBoundary defines a region of the page that loads asynchronously.
// The fallback is sent immediately; resolved content streams in later.
type AsyncBoundary struct {
	// ID is the unique boundary identifier (e.g., "a0", "a1").
	ID string

	// FallbackHTML is the loading/skeleton content shown immediately.
	FallbackHTML string

	// Resolve produces the final HTML content for this boundary.
	// Called after the initial page flush; may perform I/O (DB, API, etc.).
	// Return an error to skip this boundary (fallback remains visible).
	Resolve func() (string, error)
}

// StreamOptions configures a single streaming render.
type StreamOptions struct {
	// ComponentName is the template to render.
	ComponentName string

	// Props is the component props (same as RenderOptions.Props).
	Props interface{}

	// Title is the page title (defaults to "{ComponentName} - BarefootJS").
	Title string

	// Heading is the page heading.
	Heading string

	// Extra holds additional data for the layout.
	Extra map[string]interface{}

	// Boundaries lists async regions that will be streamed.
	Boundaries []AsyncBoundary
}

// StreamRenderer renders pages with out-of-order streaming support.
type StreamRenderer struct {
	templates *template.Template
	layout    LayoutFunc
}

// NewStreamRenderer creates a StreamRenderer with the given templates and layout.
// The layout function should include the streaming bootstrap script, e.g.:
//
//	bf.StreamingBootstrap()
//
// in the <head> or before any async boundary in the <body>.
func NewStreamRenderer(tmpl *template.Template, layout LayoutFunc) *StreamRenderer {
	return &StreamRenderer{
		templates: tmpl,
		layout:    layout,
	}
}

// Stream renders the initial page (with fallback placeholders), flushes it
// to the client, then resolves each async boundary concurrently and
// streams the resolved content as it becomes available.
//
// If w does not implement http.Flusher, falls back to blocking render
// (all boundaries resolved before sending the response).
func (sr *StreamRenderer) Stream(w http.ResponseWriter, opts StreamOptions) error {
	flusher, canFlush := w.(http.Flusher)

	// Build the initial page using the normal Renderer
	renderer := NewRenderer(sr.templates, sr.layout)
	extra := opts.Extra
	if extra == nil {
		extra = make(map[string]interface{})
	}

	// Register boundary fallbacks in extra so the layout can access them
	boundaryMap := make(map[string]template.HTML, len(opts.Boundaries))
	for _, b := range opts.Boundaries {
		boundaryMap[b.ID] = template.HTML(
			fmt.Sprintf(`<div bf-async="%s">%s</div>`, b.ID, b.FallbackHTML),
		)
	}
	extra["_bfBoundaries"] = boundaryMap

	initialHTML := renderer.Render(RenderOptions{
		ComponentName: opts.ComponentName,
		Props:         opts.Props,
		Title:         opts.Title,
		Heading:       opts.Heading,
		Extra:         extra,
	})

	if !canFlush {
		// No flusher — resolve all boundaries inline (blocking)
		resolvedHTML := sr.resolveAllBlocking(opts.Boundaries)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, initialHTML)
		fmt.Fprint(w, resolvedHTML)
		return nil
	}

	// Streaming mode
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, initialHTML)
	flusher.Flush() // ← TTFB

	// Resolve boundaries concurrently, stream each result as it arrives
	type result struct {
		id   string
		html string
		err  error
	}

	ch := make(chan result, len(opts.Boundaries))
	var wg sync.WaitGroup

	for _, b := range opts.Boundaries {
		wg.Add(1)
		go func(boundary AsyncBoundary) {
			defer wg.Done()
			content, err := boundary.Resolve()
			ch <- result{id: boundary.ID, html: content, err: err}
		}(b)
	}

	// Close channel when all goroutines complete
	go func() {
		wg.Wait()
		close(ch)
	}()

	// Write resolve chunks as they arrive
	for r := range ch {
		if r.err != nil {
			continue // Skip failed boundaries (fallback remains visible)
		}
		chunk := fmt.Sprintf(
			`<template bf-async-resolve="%s">%s</template><script>__bf_swap("%s")</script>`,
			r.id, r.html, r.id,
		)
		fmt.Fprint(w, chunk)
		flusher.Flush()
	}

	return nil
}

func (sr *StreamRenderer) resolveAllBlocking(boundaries []AsyncBoundary) string {
	var buf bytes.Buffer
	for _, b := range boundaries {
		content, err := b.Resolve()
		if err != nil {
			continue
		}
		fmt.Fprintf(&buf,
			`<template bf-async-resolve="%s">%s</template><script>__bf_swap("%s")</script>`,
			b.ID, content, b.ID,
		)
	}
	return buf.String()
}

// StreamingBootstrap returns the inline script required for OOS streaming.
// Include this once per page, before any async boundaries.
func StreamingBootstrap() template.HTML {
	return `<script>(function(){function s(id){var a=document.querySelector('[bf-async="'+id+'"]');var t=document.querySelector('template[bf-async-resolve="'+id+'"]');if(!a||!t)return;a.replaceChildren(t.content.cloneNode(true));a.removeAttribute('bf-async');t.remove();requestAnimationFrame(function(){if(window.__bf_hydrate)window.__bf_hydrate()})};window.__bf_swap=s})()</script>`
}

// BfAsyncBoundary is a template function that renders an async boundary placeholder.
// Usage in Go templates:
//
//	{{bfAsyncBoundary "a0" "<div class='skeleton'>Loading...</div>"}}
//
// This generates: <div bf-async="a0"><div class='skeleton'>Loading...</div></div>
func BfAsyncBoundary(id string, fallbackHTML string) template.HTML {
	return template.HTML(fmt.Sprintf(`<div bf-async="%s">%s</div>`, id, fallbackHTML))
}

// StreamingFuncMap returns additional template functions for streaming support.
// Merge this with the base FuncMap():
//
//	funcMap := bf.FuncMap()
//	for k, v := range bf.StreamingFuncMap() {
//	    funcMap[k] = v
//	}
func StreamingFuncMap() template.FuncMap {
	return template.FuncMap{
		"bfAsyncBoundary":    BfAsyncBoundary,
		"bfStreamBootstrap":  func() template.HTML { return StreamingBootstrap() },
	}
}
