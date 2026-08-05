package bfdev

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func writeBuildID(t *testing.T, dir, id string) {
	t.Helper()
	devDir := filepath.Join(dir, ".dev")
	if err := os.MkdirAll(devDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(devDir, "build-id"), []byte(id), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestSnippet_DisabledReturnsEmpty(t *testing.T) {
	if got := Snippet(Config{Disabled: true}); got != "" {
		t.Errorf("Snippet(disabled) = %q, want empty", got)
	}
}

func TestSnippet_ContainsEventSource(t *testing.T) {
	got := string(Snippet(Config{}))
	if !strings.Contains(got, "<script>") {
		t.Errorf("snippet missing <script>: %q", got)
	}
	if !strings.Contains(got, `new EventSource("/_bf/reload")`) {
		t.Errorf("snippet missing default EventSource URL: %q", got)
	}
	if !strings.Contains(got, "addEventListener('reload'") {
		t.Errorf("snippet missing reload listener: %q", got)
	}
}

func TestSnippet_CustomEndpoint(t *testing.T) {
	got := string(Snippet(Config{Endpoint: "/__reload"}))
	if !strings.Contains(got, `new EventSource("/__reload")`) {
		t.Errorf("snippet did not use custom endpoint: %q", got)
	}
}

func TestNewReloadHandler_DisabledReturns404(t *testing.T) {
	srv := httptest.NewServer(NewReloadHandler(Config{DistDir: t.TempDir(), Disabled: true}))
	defer srv.Close()

	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", resp.StatusCode)
	}
}

// readSSEUntil reads lines from r until `contains` is seen or `timeout` elapses.
// Returns the accumulated text.
func readSSEUntil(t *testing.T, r *http.Response, contains string, timeout time.Duration) string {
	t.Helper()
	done := make(chan string, 1)
	go func() {
		sc := bufio.NewScanner(r.Body)
		var acc strings.Builder
		for sc.Scan() {
			acc.WriteString(sc.Text())
			acc.WriteByte('\n')
			if strings.Contains(acc.String(), contains) {
				done <- acc.String()
				return
			}
		}
		done <- acc.String()
	}()
	select {
	case got := <-done:
		return got
	case <-time.After(timeout):
		t.Fatalf("timeout waiting for %q", contains)
		return ""
	}
}

func TestNewReloadHandler_InitialHello(t *testing.T) {
	dir := t.TempDir()
	writeBuildID(t, dir, "1000")

	srv := httptest.NewServer(NewReloadHandler(Config{DistDir: dir}))
	defer srv.Close()

	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Errorf("Content-Type = %q, want text/event-stream", ct)
	}
	body := readSSEUntil(t, resp, "data: 1000", 2*time.Second)
	if !strings.Contains(body, "retry: 1000") {
		t.Errorf("missing retry: %q", body)
	}
	if !strings.Contains(body, "event: hello") {
		t.Errorf("missing hello: %q", body)
	}
	if !strings.Contains(body, "data: 1000") {
		t.Errorf("missing build-id data: %q", body)
	}
}

// Regression: a client reconnecting with a stale Last-Event-ID must see
// `reload` immediately, otherwise the build that happened during its
// disconnected window silently stays unpainted until the next change.
func TestNewReloadHandler_StaleLastEventIDEmitsReload(t *testing.T) {
	dir := t.TempDir()
	writeBuildID(t, dir, "2000")

	srv := httptest.NewServer(NewReloadHandler(Config{DistDir: dir}))
	defer srv.Close()

	req, _ := http.NewRequest(http.MethodGet, srv.URL, nil)
	req.Header.Set("Last-Event-ID", "1999")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	body := readSSEUntil(t, resp, "data: 2000", 2*time.Second)
	if !strings.Contains(body, "event: reload") {
		t.Errorf("expected reload on stale Last-Event-ID, got: %q", body)
	}
	if strings.Contains(body, "event: hello") {
		t.Errorf("should not emit hello when stale, got: %q", body)
	}
	if !strings.Contains(body, "data: 2000") {
		t.Errorf("missing current build-id: %q", body)
	}
}

// When the build-id changes after connection is established, the handler
// should detect it via polling and emit a `reload` event.
func TestNewReloadHandler_DetectsBuildIDChange(t *testing.T) {
	dir := t.TempDir()
	writeBuildID(t, dir, "3000")

	srv := httptest.NewServer(NewReloadHandler(Config{DistDir: dir}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, srv.URL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	// Drain the initial hello before simulating a rebuild so we don't confuse
	// it with the expected reload below.
	_ = readSSEUntil(t, resp, "data: 3000", 2*time.Second)

	time.Sleep(pollInterval)
	writeBuildID(t, dir, "3001")

	body := readSSEUntil(t, resp, "data: 3001", 2*time.Second)
	if !strings.Contains(body, "event: reload") {
		t.Errorf("expected reload after build-id change, got: %q", body)
	}
	if !strings.Contains(body, "data: 3001") {
		t.Errorf("expected new build-id in data, got: %q", body)
	}
}

// GuardAssets: the whole point is that it does NOTHING in dev (dev-origin
// URLs are the correct, expected value there) regardless of what's in the
// map.
func TestGuardAssets_NoopInDev(t *testing.T) {
	t.Setenv("APP_ENV", "development")

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("GuardAssets panicked in dev mode: %v", r)
		}
	}()
	GuardAssets(map[string]string{"RouterEntry": "http://localhost:5173/static/client/router-entry.ts"})
}

// GuardAssets: a production run (APP_ENV unset/not "development") with an
// asset map that resolves to something other than a dev origin (the
// expected, correctly-tagged case) must not panic.
func TestGuardAssets_NoopInProductionWithHashedURLs(t *testing.T) {
	t.Setenv("APP_ENV", "")

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("GuardAssets panicked on a legitimate production asset map: %v", r)
		}
	}()
	GuardAssets(map[string]string{"RouterEntry": "/integrations/echo/static/assets/router-entry-DDIPLN_z.js"})
}

// GuardAssets: an empty map is always a no-op, dev or production — nothing
// to compare against a dev-origin prefix.
func TestGuardAssets_NoopWithEmptyMap(t *testing.T) {
	t.Setenv("APP_ENV", "")

	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("GuardAssets panicked on an empty map: %v", r)
		}
	}()
	GuardAssets(map[string]string{})
}

// GuardAssets: the exact mistake this guard exists for — a production run
// (no APP_ENV=development) whose Assets map still holds a Vite dev-server
// URL, meaning the binary was built without `-tags production`. Must
// panic, and the panic message must name the offending entry and point at
// the fix.
func TestGuardAssets_PanicsOnDevURLInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "")

	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected GuardAssets to panic on a dev-origin URL in production, it did not")
		}
		msg, ok := r.(string)
		if !ok {
			t.Fatalf("panic value is not a string: %#v", r)
		}
		if !strings.Contains(msg, "RouterEntry") {
			t.Errorf("panic message missing offending key: %q", msg)
		}
		if !strings.Contains(msg, "http://localhost:5173") {
			t.Errorf("panic message missing offending URL: %q", msg)
		}
		if !strings.Contains(msg, "-tags production") {
			t.Errorf("panic message missing the fix: %q", msg)
		}
	}()
	GuardAssets(map[string]string{"RouterEntry": "http://localhost:5173/static/client/router-entry.ts"})
}

// GuardAssets: same as above but via the 127.0.0.1 form some hosts resolve
// "localhost" to (resolveDevOrigin's fallback host is a literal
// "localhost", but this guards the general shape, not just one host).
func TestGuardAssets_PanicsOn127001URLInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "")

	defer func() {
		if recover() == nil {
			t.Fatal("expected GuardAssets to panic on a 127.0.0.1 dev-origin URL in production, it did not")
		}
	}()
	GuardAssets(map[string]string{"RouterEntry": "http://127.0.0.1:5173/static/client/router-entry.ts"})
}
