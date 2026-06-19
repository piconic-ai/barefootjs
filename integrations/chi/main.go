package main

import (
	"container/list"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	bf "github.com/barefootjs/runtime/bf"
	"github.com/barefootjs/runtime/bf/bfdev"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

// basePath is the URL prefix under which every route and static asset is
// mounted, driven by the BASE_PATH env var. Defaults to /integrations/chi so
// the app is deploy-ready for barefootjs.dev/integrations/chi.
var basePath string

// renderer holds the cached templates + layout. In dev mode templates are
// re-parsed per request (see render) so a `bun run build:watch` rebuild shows
// up on refresh without restarting the server. layoutFn is kept alongside so
// the dev re-parse can rebuild the renderer with the same layout.
var (
	renderer *bf.Renderer
	layoutFn bf.LayoutFunc
	// baseTemplates is the parsed template set, kept so the blog renderer (which
	// composes several islands via RenderFragment) can build its own bf.Renderer
	// without re-parsing in production. In dev, currentTemplates re-parses per
	// request so build:watch rebuilds show on refresh.
	baseTemplates *template.Template
)

// currentTemplates returns the parsed templates: re-parsed per call in dev so
// `bun run build:watch` rebuilds appear on reload, the cached set otherwise.
func currentTemplates() *template.Template {
	if isDevEnv() {
		return loadTemplates()
	}
	return baseTemplates
}

// loadTemplates walks dist/templates/ recursively and parses every .tmpl
// file, registering a no-op "Tag" stub first so html/template's escape pass
// doesn't crash on the Slot template's conditional {{template "Tag" ...}}.
func loadTemplates() *template.Template {
	root := template.New("").Funcs(bf.FuncMap())
	template.Must(root.New("Tag").Parse(""))
	err := filepath.WalkDir("dist/templates", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || filepath.Ext(path) != ".tmpl" {
			return nil
		}
		_, parseErr := root.ParseFiles(path)
		return parseErr
	})
	if err != nil {
		panic(err)
	}
	return root
}

// isDevEnv reports whether the process is running in development.
func isDevEnv() bool {
	return bfdev.IsDevDefault()
}

// getID extracts the {id} URL parameter from a chi route.
func getID(req *http.Request) string {
	return chi.URLParam(req, "id")
}

// siteHeaderHTML is the shared BarefootJS header, matching the other
// integrations so every adapter looks identical.
const siteHeaderHTML = `<header class="bf-header">
    <div class="bf-header-inner">
        <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="Barefoot.js">
            <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
        </a>
        <div class="bf-header-sep"></div>
        <nav class="bf-header-crumbs" aria-label="Breadcrumb">
            <a href="/integrations" class="bf-header-link">Integrations</a>
            <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
            <span class="bf-header-current" aria-current="page">Chi</span>
        </nav>
    </div>
</header>`

// defaultLayout renders the standard HTML page structure.
func defaultLayout(ctx *bf.RenderContext) string {
	headingHTML := ""
	if ctx.Heading != "" {
		headingHTML = fmt.Sprintf(`
    <h1>%s</h1>`, ctx.Heading)
	}

	extraCSS := ""
	if css, ok := ctx.Extra["extra_css"].(string); ok && css != "" {
		extraCSS = "\n    " + css
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <link rel="stylesheet" href="%s/shared/styles/tokens.css">
    <link rel="stylesheet" href="%s/shared/styles/layout.css">
    <link rel="stylesheet" href="%s/shared/styles/components.css">
    <link rel="stylesheet" href="%s/shared/styles/todo-app.css">%s
</head>
<body>
%s%s
    <div id="app">%s</div>
    <p><a href="%s">← Back</a></p>
    %s%s
</body>
</html>`, ctx.Title, basePath, basePath, basePath, basePath, extraCSS, siteHeaderHTML, headingHTML, ctx.ComponentHTML, basePath, ctx.Portals, ctx.Scripts)
}

// render writes a fully laid-out HTML page for the named component. In dev
// mode templates re-parse on every call so edits picked up by
// `bun run build:watch` appear on reload.
func render(w http.ResponseWriter, status int, name string, opts bf.RenderOptions) {
	r := renderer
	if isDevEnv() {
		r = bf.NewRenderer(loadTemplates(), layoutFn)
	}
	opts.ComponentName = name
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(r.Render(opts)))
}

// writeJSON marshals v to the response as application/json.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Per-session in-memory todo storage. Each browser gets an opaque session id
// via a cookie scoped to basePath; sessionStore keys on that id so one
// visitor's list is never visible to another. LRU-bounded to keep memory
// usage predictable.
const (
	sessionCookieName = "bf_session"
	sessionTTLSeconds = 60 * 60 * 24 * 30 // 30d
	sessionStoreMax   = 1000
)

type sessionState struct {
	mu     sync.Mutex
	todos  []Todo
	nextID int
}

type sessionStoreT struct {
	mu    sync.Mutex
	items map[string]*list.Element
	order *list.List
}

type sessionEntry struct {
	id    string
	state *sessionState
}

var sessionStore = &sessionStoreT{
	items: make(map[string]*list.Element),
	order: list.New(),
}

func seedTodos() []Todo {
	return []Todo{
		{ID: 1, Text: "Setup project", Done: false, Editing: false},
		{ID: 2, Text: "Create components", Done: false, Editing: false},
		{ID: 3, Text: "Write tests", Done: true, Editing: false},
	}
}

func newSessionID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// getSession returns the per-session todo state for the caller, creating a
// new session (and setting the cookie) if none exists yet.
func getSession(w http.ResponseWriter, req *http.Request) *sessionState {
	var id string
	if ck, err := req.Cookie(sessionCookieName); err == nil && ck.Value != "" {
		id = ck.Value
	} else {
		newID, err := newSessionID()
		if err != nil {
			newID = fmt.Sprintf("fallback-%d", time.Now().UnixNano())
		}
		id = newID
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookieName,
			Value:    id,
			Path:     basePath,
			HttpOnly: true,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   sessionTTLSeconds,
		})
	}

	sessionStore.mu.Lock()
	defer sessionStore.mu.Unlock()

	if elem, ok := sessionStore.items[id]; ok {
		sessionStore.order.MoveToFront(elem)
		return elem.Value.(*sessionEntry).state
	}

	state := &sessionState{todos: seedTodos(), nextID: 4}
	elem := sessionStore.order.PushFront(&sessionEntry{id: id, state: state})
	sessionStore.items[id] = elem

	for sessionStore.order.Len() > sessionStoreMax {
		oldest := sessionStore.order.Back()
		if oldest == nil {
			break
		}
		sessionStore.order.Remove(oldest)
		delete(sessionStore.items, oldest.Value.(*sessionEntry).id)
	}

	return state
}

func main() {
	basePath = os.Getenv("BASE_PATH")
	if basePath == "" {
		basePath = "/integrations/chi"
	}

	devMode := isDevEnv()

	// Layout wraps defaultLayout with the dev auto-reload snippet (empty in
	// production) injected before </body>.
	layout := defaultLayout
	if snippet := bfdev.Snippet(bfdev.Config{Disabled: !devMode}); snippet != "" {
		layout = func(ctx *bf.RenderContext) string {
			html := defaultLayout(ctx)
			return strings.Replace(html, "</body>", string(snippet)+"\n</body>", 1)
		}
	}
	layoutFn = layout
	baseTemplates = loadTemplates()
	renderer = bf.NewRenderer(baseTemplates, layout)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Index: bare basePath and the trailing-slash variant.
	r.Get(basePath, indexHandler)
	r.Get(basePath+"/", indexHandler)
	r.Get(basePath+"/counter", counterHandler)
	r.Get(basePath+"/toggle", toggleHandler)
	r.Get(basePath+"/todos", todosHandler)
	r.Get(basePath+"/todos-ssr", todosSSRHandler)
	r.Get(basePath+"/reactive-props", reactivePropsHandler)
	r.Get(basePath+"/props-reactivity", propsReactivityHandler)
	r.Get(basePath+"/form", formHandler)
	r.Get(basePath+"/portal", portalHandler)
	r.Get(basePath+"/conditional-return", conditionalReturnHandler)
	r.Get(basePath+"/conditional-return-link", conditionalReturnLinkHandler)
	r.Get(basePath+"/ai-chat", aiChatHandler)
	r.Get(basePath+"/api/ai-chat", aiChatSSEHandler)

	// Blog — the @barefootjs/router showcase (partial navigation across a
	// region shell). Its own region-shell layout, separate from the catalog
	// renderer, mounted under ${basePath}/blog.
	r.Get(basePath+"/blog", blogIndexHandler)
	r.Get(basePath+"/blog/posts/{slug}", blogPostHandler)

	// Todo API endpoints
	r.Get(basePath+"/api/todos", getTodosAPI)
	r.Post(basePath+"/api/todos", createTodoAPI)
	r.Put(basePath+"/api/todos/{id}", updateTodoAPI)
	r.Delete(basePath+"/api/todos/{id}", deleteTodoAPI)
	r.Post(basePath+"/api/todos/reset", resetTodosAPI)

	if devMode {
		r.Handle(basePath+"/_bf/reload", bfdev.NewReloadHandler(bfdev.Config{DistDir: "./dist"}))
	}

	// Static files: dist/ (client JS) under /static, shared styles under
	// /shared. `bun run build` copies ../shared into dist/shared so the same
	// path works in local dev and inside the container image.
	r.Handle(basePath+"/static/*", http.StripPrefix(basePath+"/static/", http.FileServer(http.Dir("dist"))))
	r.Handle(basePath+"/shared/*", http.StripPrefix(basePath+"/shared/", http.FileServer(http.Dir("dist/shared"))))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8082"
	}
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("barefoot: server error: %v", err)
	}
}

func indexHandler(w http.ResponseWriter, _ *http.Request) {
	body := fmt.Sprintf(`
    <h1>BarefootJS + Chi Example</h1>
    <p>This example demonstrates server-side rendering with Go Chi and BarefootJS.</p>
    <ul>
        <li><a href="%s/counter">Counter</a></li>
        <li><a href="%s/toggle">Toggle</a></li>
        <li><a href="%s/todos">Todo (@client)</a></li>
        <li><a href="%s/todos-ssr">Todo (no @client markers)</a></li>
        <li><a href="%s/ai-chat">AI Chat (SSE Streaming)</a></li>
        <li><a href="%s/blog">Blog (@barefootjs/router — partial navigation)</a></li>
    </ul>`, basePath, basePath, basePath, basePath, basePath, basePath)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BarefootJS + Chi Example</title>
    <link rel="stylesheet" href="%s/shared/styles/tokens.css">
    <link rel="stylesheet" href="%s/shared/styles/layout.css">
    <link rel="stylesheet" href="%s/shared/styles/components.css">
</head>
<body>
%s%s
</body>
</html>`, basePath, basePath, basePath, siteHeaderHTML, body)
}

func counterHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewCounterProps(CounterInput{Initial: 0})
	render(w, http.StatusOK, "Counter", bf.RenderOptions{
		Props:   &props,
		Title:   "Counter - BarefootJS",
		Heading: "Counter Component",
	})
}

func toggleHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewToggleProps(ToggleInput{
		ToggleItems: []ToggleItemInput{
			{Label: "Setting 1", DefaultOn: true},
			{Label: "Setting 2", DefaultOn: false},
			{Label: "Setting 3", DefaultOn: false},
		},
	})
	render(w, http.StatusOK, "Toggle", bf.RenderOptions{
		Props:   &props,
		Title:   "Toggle - BarefootJS",
		Heading: "Toggle Component",
	})
}

func todosHandler(w http.ResponseWriter, req *http.Request) {
	state := getSession(w, req)
	state.mu.Lock()
	currentTodos := make([]Todo, len(state.todos))
	copy(currentTodos, state.todos)
	state.mu.Unlock()

	todoItems := make([]TodoItemProps, len(currentTodos))
	for i, t := range currentTodos {
		// ScopeID is left empty on purpose: bf.Renderer.Render backfills a
		// unique one for each child at render time.
		todoItems[i] = TodoItemProps{Todo: t}
	}

	props := NewTodoAppProps(TodoAppInput{InitialTodos: currentTodos})
	props.Todos = currentTodos
	props.TodoItems = todoItems

	render(w, http.StatusOK, "TodoApp", bf.RenderOptions{
		Props: &props,
		Title: "TodoMVC - BarefootJS",
	})
}

func todosSSRHandler(w http.ResponseWriter, req *http.Request) {
	state := getSession(w, req)
	state.mu.Lock()
	currentTodos := make([]Todo, len(state.todos))
	copy(currentTodos, state.todos)
	state.mu.Unlock()

	todoItems := make([]TodoItemProps, len(currentTodos))
	for i, t := range currentTodos {
		// ScopeID is left empty on purpose: bf.Renderer.Render backfills a
		// unique one for each child at render time.
		todoItems[i] = TodoItemProps{Todo: t}
	}

	props := NewTodoAppSSRProps(TodoAppSSRInput{InitialTodos: currentTodos})
	props.Todos = currentTodos
	props.TodoItems = todoItems

	render(w, http.StatusOK, "TodoAppSSR", bf.RenderOptions{
		Props: &props,
		Title: "TodoMVC SSR - BarefootJS",
	})
}

func reactivePropsHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewReactivePropsProps(ReactivePropsInput{})
	render(w, http.StatusOK, "ReactiveProps", bf.RenderOptions{
		Props:   &props,
		Title:   "Reactive Props - BarefootJS",
		Heading: "Reactive Props Test",
	})
}

func propsReactivityHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewPropsReactivityComparisonProps(PropsReactivityComparisonInput{})
	render(w, http.StatusOK, "PropsReactivityComparison", bf.RenderOptions{
		Props:   &props,
		Title:   "Props Reactivity - BarefootJS",
		Heading: "Props Reactivity Comparison",
	})
}

func formHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewFormProps(FormInput{})
	render(w, http.StatusOK, "Form", bf.RenderOptions{
		Props:   &props,
		Title:   "Form - BarefootJS",
		Heading: "Form Example",
	})
}

func portalHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewPortalExampleProps(PortalExampleInput{})
	render(w, http.StatusOK, "PortalExample", bf.RenderOptions{
		Props:   &props,
		Title:   "Portal - BarefootJS",
		Heading: "Portal Example",
	})
}

func conditionalReturnHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewConditionalReturnProps(ConditionalReturnInput{})
	render(w, http.StatusOK, "ConditionalReturn", bf.RenderOptions{
		Props:   &props,
		Title:   "Conditional Return - BarefootJS",
		Heading: "Conditional Return Example",
	})
}

func conditionalReturnLinkHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewConditionalReturnProps(ConditionalReturnInput{Variant: "link"})
	render(w, http.StatusOK, "ConditionalReturn", bf.RenderOptions{
		Props:   &props,
		Title:   "Conditional Return (Link) - BarefootJS",
		Heading: "Conditional Return Example (Link)",
	})
}

// Todo API handlers

func getTodosAPI(w http.ResponseWriter, req *http.Request) {
	state := getSession(w, req)
	state.mu.Lock()
	defer state.mu.Unlock()
	writeJSON(w, http.StatusOK, state.todos)
}

func createTodoAPI(w http.ResponseWriter, req *http.Request) {
	var input struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(req.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid input"})
		return
	}

	state := getSession(w, req)
	state.mu.Lock()
	newTodo := Todo{ID: state.nextID, Text: input.Text, Done: false}
	state.nextID++
	state.todos = append(state.todos, newTodo)
	state.mu.Unlock()

	writeJSON(w, http.StatusCreated, newTodo)
}

func updateTodoAPI(w http.ResponseWriter, req *http.Request) {
	id, err := strconv.Atoi(getID(req))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	var input struct {
		Text *string `json:"text"`
		Done *bool   `json:"done"`
	}
	if err := json.NewDecoder(req.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid input"})
		return
	}

	state := getSession(w, req)
	state.mu.Lock()
	defer state.mu.Unlock()

	for i, todo := range state.todos {
		if todo.ID == id {
			if input.Text != nil {
				state.todos[i].Text = *input.Text
			}
			if input.Done != nil {
				state.todos[i].Done = *input.Done
			}
			writeJSON(w, http.StatusOK, state.todos[i])
			return
		}
	}

	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func deleteTodoAPI(w http.ResponseWriter, req *http.Request) {
	id, err := strconv.Atoi(getID(req))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}

	state := getSession(w, req)
	state.mu.Lock()
	defer state.mu.Unlock()

	for i, todo := range state.todos {
		if todo.ID == id {
			state.todos = append(state.todos[:i], state.todos[i+1:]...)
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}

	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func resetTodosAPI(w http.ResponseWriter, req *http.Request) {
	state := getSession(w, req)
	state.mu.Lock()
	state.todos = seedTodos()
	state.nextID = 4
	state.mu.Unlock()
	w.WriteHeader(http.StatusOK)
}

// ---------------------------------------------------------------------------
// AI Chat — Streaming SSR Example
// ---------------------------------------------------------------------------

var fakeResponses = []string{
	"[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
	"[Dummy response] BarefootJS compiles JSX to Go html/template + client JS. Signals drive reactivity on any backend.",
	"[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
	"[Dummy response] The Go/Chi backend streams each character with a 30ms delay to simulate token-by-token LLM output.",
	"[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
}

func aiChatHandler(w http.ResponseWriter, _ *http.Request) {
	props := NewAIChatInteractiveProps(AIChatInteractiveInput{})
	render(w, http.StatusOK, "AIChatInteractive", bf.RenderOptions{
		Props:   &props,
		Title:   "AI Chat — SSE Streaming (Go/Chi)",
		Heading: "AI Chat — SSE Streaming",
		Extra: map[string]interface{}{
			"extra_css": fmt.Sprintf(`<link rel="stylesheet" href="%s/shared/styles/ai-chat.css">`, basePath),
		},
	})
}

func aiChatSSEHandler(w http.ResponseWriter, _ *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	idx := int(time.Now().UnixNano()) % len(fakeResponses)
	if idx < 0 {
		idx = -idx
	}
	text := fakeResponses[idx]

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	for _, ch := range text {
		fmt.Fprintf(w, "data: %s\n\n", strconv.Quote(string(ch)))
		flusher.Flush()
		time.Sleep(30 * time.Millisecond)
	}

	fmt.Fprint(w, "data: [DONE]\n\n")
	flusher.Flush()
}
