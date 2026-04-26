// Package bfdev provides a dev-only browser auto-reload handler.
//
// It watches `<distDir>/.dev/build-id` (produced by `barefoot build --watch`
// in the @barefootjs/cli package) and streams SSE `event: reload` whenever
// the sentinel changes. Combined with the inline client snippet returned by
// Snippet, editing a .tsx component triggers a browser reload automatically.
//
// The handler is framework-agnostic (net/http.Handler). Echo users can mount
// it via echo.WrapHandler; other routers use it as-is.
//
// Example (Echo):
//
//	if bfdev.IsDevDefault() {
//	    e.GET("/_bf/reload", echo.WrapHandler(bfdev.NewReloadHandler(bfdev.Config{
//	        DistDir: "./dist",
//	    })))
//	}
//
// Example (net/http):
//
//	http.Handle("/_bf/reload", bfdev.NewReloadHandler(bfdev.Config{DistDir: "./dist"}))
package bfdev

import (
	"fmt"
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Sentinel path contract with `@barefootjs/cli`
// (`packages/cli/src/lib/build.ts`, DEV_SENTINEL_SUBDIR / DEV_SENTINEL_FILENAME).
// Duplicated here so the Go runtime avoids a dependency on the CLI. If the
// CLI changes these values, update this package in the same PR.
const (
	devSubdir        = ".dev"
	buildIDFile      = "build-id"
	scrollStorageKey = "__bf_devreload_scroll"

	// heartbeatInterval keeps the SSE stream under the framework's idle
	// timeout (Bun.serve defaults to 10s; Go/Echo defaults are more forgiving
	// but middleware-level timeouts exist in the wild). 5s leaves comfortable
	// headroom.
	heartbeatInterval = 5 * time.Second

	// pollInterval is how often the handler checks `.dev/build-id`. Uses
	// polling instead of fsnotify to keep the runtime dependency-free — dev
	// latency of ~500ms is imperceptible next to the browser's reload time.
	pollInterval = 500 * time.Millisecond
)

// Config configures a dev reload handler or snippet.
type Config struct {
	// DistDir is the directory that `barefoot build` writes output into
	// (contains `.dev/build-id`). Required for the handler; ignored by
	// Snippet.
	DistDir string

	// Endpoint is the public SSE URL the client will connect to. Used only by
	// Snippet to populate the EventSource URL. Defaults to "/_bf/reload" when
	// empty.
	Endpoint string

	// Disabled, when true, makes NewReloadHandler return a 404 handler and
	// Snippet return an empty fragment. Intended for production builds.
	Disabled bool
}

// IsDevDefault reports whether the process is running in a development
// environment using the common Go convention of APP_ENV=development.
// Callers can use this to populate Config.Disabled:
//
//	cfg := bfdev.Config{DistDir: "./dist", Disabled: !bfdev.IsDevDefault()}
func IsDevDefault() bool {
	return os.Getenv("APP_ENV") == "development"
}

// NewReloadHandler returns an http.Handler that streams Server-Sent Events
// and emits `event: reload` whenever `<DistDir>/.dev/build-id` changes. When
// cfg.Disabled is true, the handler responds 404 and never opens a stream.
func NewReloadHandler(cfg Config) http.Handler {
	if cfg.Disabled {
		return http.HandlerFunc(http.NotFound)
	}
	devDir := filepath.Join(cfg.DistDir, devSubdir)
	buildIDPath := filepath.Join(devDir, buildIDFile)
	// Ensure the directory exists so the first read does not race with the
	// initial build. Ignore the error: subsequent reads simply return "".
	_ = os.MkdirAll(devDir, 0o755)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		h := w.Header()
		h.Set("Content-Type", "text/event-stream")
		h.Set("Cache-Control", "no-cache, no-transform")
		h.Set("Connection", "keep-alive")
		h.Set("X-Accel-Buffering", "no")

		send := func(chunk string) bool {
			if _, err := fmt.Fprint(w, chunk); err != nil {
				return false
			}
			flusher.Flush()
			return true
		}

		if !send("retry: 1000\n\n") {
			return
		}

		lastEventID := strings.TrimSpace(r.Header.Get("Last-Event-ID"))
		initialID := readBuildID(buildIDPath)
		lastSent := ""
		if initialID != "" {
			lastSent = initialID
			// When the client reconnects with a stale Last-Event-ID, a build
			// happened during its disconnected window — fire `reload`
			// immediately so the missed rebuild does not silently stay
			// unpainted until the next change.
			event := "hello"
			if lastEventID != "" && lastEventID != initialID {
				event = "reload"
			}
			if !send(fmt.Sprintf("event: %s\nid: %s\ndata: %s\n\n", event, initialID, initialID)) {
				return
			}
		}

		ctx := r.Context()
		hbTicker := time.NewTicker(heartbeatInterval)
		defer hbTicker.Stop()
		pollTicker := time.NewTicker(pollInterval)
		defer pollTicker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-hbTicker.C:
				if !send(": hb\n\n") {
					return
				}
			case <-pollTicker.C:
				id := readBuildID(buildIDPath)
				if id == "" || id == lastSent {
					continue
				}
				lastSent = id
				if !send(fmt.Sprintf("event: reload\nid: %s\ndata: %s\n\n", id, id)) {
					return
				}
			}
		}
	})
}

func readBuildID(path string) string {
	b, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(b))
}

// Snippet returns an inline <script> that subscribes to the SSE endpoint,
// reloads on `reload`, and preserves window.scrollY across reloads via
// sessionStorage. Returns an empty fragment when cfg.Disabled is true.
//
// Place it before </body>, typically just after the rendered scripts.
func Snippet(cfg Config) template.HTML {
	if cfg.Disabled {
		return ""
	}
	endpoint := cfg.Endpoint
	if endpoint == "" {
		endpoint = "/_bf/reload"
	}
	// Small IIFE: EventSource subscriber + scrollY preservation. Idempotent
	// across duplicate mounts (guarded by window.__bfDevReload).
	js := fmt.Sprintf(
		`(function(){if(window.__bfDevReload)return;window.__bfDevReload=1;`+
			`try{var s=sessionStorage.getItem(%q);if(s){sessionStorage.removeItem(%q);`+
			`var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};`+
			`if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}`+
			`var es=new EventSource(%q);`+
			`es.addEventListener('reload',function(){try{sessionStorage.setItem(%q,String(window.scrollY))}catch(e){}location.reload()});`+
			`es.addEventListener('error',function(){})})();`,
		scrollStorageKey, scrollStorageKey, endpoint, scrollStorageKey,
	)
	// Safe: `js` is assembled from package-internal literals plus `endpoint`
	// escaped by %q (Go-syntax quoting == valid JS string literal for the
	// ASCII endpoint paths this accepts).
	return template.HTML("<script>" + js + "</script>") //nolint:gosec
}
