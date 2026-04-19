package main

import (
	"container/list"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	bf "github.com/barefootjs/runtime/bf"
	"github.com/barefootjs/runtime/bf/bfdev"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// basePath is the URL prefix under which every route and static asset is
// mounted, driven by the BASE_PATH env var. Defaults to /examples/echo so the
// app is deploy-ready for barefootjs.dev/examples/echo.
var basePath string

// loadTemplates loads all templates with BarefootJS functions registered
func loadTemplates() *template.Template {
	return template.Must(
		template.New("").Funcs(bf.FuncMap()).ParseGlob("dist/templates/*.tmpl"),
	)
}

// EchoRenderer adapts bf.Renderer to Echo's Renderer interface.
// When devMode is true, templates are re-parsed on each request so edits
// made by `bun run build:watch` show up without restarting the server.
type EchoRenderer struct {
	bf      *bf.Renderer
	layout  bf.LayoutFunc
	devMode bool
}

// isDevEnv reports whether the process is running in a development environment,
// using the common Go convention of APP_ENV=development.
func isDevEnv() bool {
	return os.Getenv("APP_ENV") == "development"
}

func (r *EchoRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	opts := data.(bf.RenderOptions)
	opts.ComponentName = name
	renderer := r.bf
	if r.devMode {
		renderer = bf.NewRenderer(loadTemplates(), r.layout)
	}
	_, err := w.Write([]byte(renderer.Render(opts)))
	return err
}

// siteHeader returns the shared BarefootJS header HTML. Matches the class
// layout used by examples/hono/renderer.tsx and examples/mojolicious/app.pl
// so all three adapters look identical.
const siteHeaderHTML = `<header class="bf-header">
    <div class="bf-header-inner">
        <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="Barefoot.js">
            <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
        </a>
        <div class="bf-header-sep"></div>
        <a href="https://barefootjs.dev/examples" class="bf-header-link">Examples</a>
    </div>
</header>`

// defaultLayout renders the standard HTML page structure
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
<html lang="ja" class="dark">
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

// Per-session in-memory todo storage. Each browser gets an opaque session
// id via a cookie scoped to basePath; sessionStore keys on that id so one
// visitor's list is never visible to another. LRU-bounded to keep memory
// usage predictable; oldest sessions get evicted past sessionStoreMax.
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
	items map[string]*list.Element // session id → list element holding (id, state)
	order *list.List               // front = most recent, back = least recent
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
func getSession(c echo.Context) *sessionState {
	var id string
	if ck, err := c.Cookie(sessionCookieName); err == nil && ck.Value != "" {
		id = ck.Value
	} else {
		newID, err := newSessionID()
		if err != nil {
			// Fall back to a process-local deterministic id on error; bad
			// luck for the caller but avoids 500.
			newID = fmt.Sprintf("fallback-%d", time.Now().UnixNano())
		}
		id = newID
		c.SetCookie(&http.Cookie{
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

	// Evict least-recently-used sessions if we're over capacity.
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
		basePath = "/examples/echo"
	}

	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Renderer. In dev mode (APP_ENV=development), templates reload on each
	// request so edits picked up by `bun run build:watch` appear without
	// restarting the server. A dev-only EventSource snippet is injected
	// before </body> so the browser reloads automatically on every rebuild.
	devMode := isDevEnv()
	devSnippet := bfdev.Snippet(bfdev.Config{Disabled: !devMode})
	layout := defaultLayout
	if devSnippet != "" {
		layout = func(ctx *bf.RenderContext) string {
			html := defaultLayout(ctx)
			return strings.Replace(html, "</body>", string(devSnippet)+"\n</body>", 1)
		}
	}
	e.Renderer = &EchoRenderer{
		bf:      bf.NewRenderer(loadTemplates(), layout),
		layout:  layout,
		devMode: devMode,
	}
	if devMode {
		e.Logger.Info("Dev mode: templates will reload on each request")
		e.GET(basePath+"/_bf/reload", echo.WrapHandler(bfdev.NewReloadHandler(bfdev.Config{DistDir: "./dist"})))
	}

	// Routes (grouped under basePath so the app can be hosted at
	// barefootjs.dev/examples/echo/* behind a Worker).
	g := e.Group(basePath)
	g.GET("", indexHandler)
	g.GET("/", indexHandler)
	g.GET("/counter", counterHandler)
	g.GET("/toggle", toggleHandler)
	g.GET("/todos", todosHandler)
	g.GET("/todos-ssr", todosSSRHandler)
	g.GET("/reactive-props", reactivePropsHandler)
	g.GET("/props-reactivity", propsReactivityHandler)
	g.GET("/form", formHandler)
	g.GET("/portal", portalHandler)
	g.GET("/conditional-return", conditionalReturnHandler)
	g.GET("/conditional-return-link", conditionalReturnLinkHandler)
	g.GET("/ai-chat", aiChatHandler)
	g.GET("/api/ai-chat", aiChatSSEHandler)

	// Todo API endpoints
	g.GET("/api/todos", getTodosAPI)
	g.POST("/api/todos", createTodoAPI)
	g.PUT("/api/todos/:id", updateTodoAPI)
	g.DELETE("/api/todos/:id", deleteTodoAPI)
	g.POST("/api/todos/reset", resetTodosAPI)

	// Static files (for client JS)
	e.Static(basePath+"/static", "dist")

	// Shared styles. `bun run build` copies ../shared into dist/shared so the
	// same path works in local dev and inside the container image.
	e.Static(basePath+"/shared", "dist/shared")

	e.Logger.Fatal(e.Start(":8080"))
}

func indexHandler(c echo.Context) error {
	body := fmt.Sprintf(`
    <p><a href="/examples">← All adapters</a></p>
    <h1>BarefootJS + Echo Example</h1>
    <p>This example demonstrates server-side rendering with Go Echo and BarefootJS.</p>
    <ul>
        <li><a href="%s/counter">Counter</a></li>
        <li><a href="%s/toggle">Toggle</a></li>
        <li><a href="%s/todos">Todo (@client)</a></li>
        <li><a href="%s/todos-ssr">Todo (no @client markers)</a></li>
        <li><a href="%s/ai-chat">AI Chat (SSE Streaming)</a></li>
    </ul>`, basePath, basePath, basePath, basePath, basePath)

	return c.HTML(http.StatusOK, fmt.Sprintf(`<!DOCTYPE html>
<html lang="ja" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BarefootJS + Echo Example</title>
    <link rel="stylesheet" href="%s/shared/styles/tokens.css">
    <link rel="stylesheet" href="%s/shared/styles/layout.css">
    <link rel="stylesheet" href="%s/shared/styles/components.css">
</head>
<body>
%s%s
</body>
</html>`, basePath, basePath, basePath, siteHeaderHTML, body))
}

func counterHandler(c echo.Context) error {
	props := NewCounterProps(CounterInput{Initial: 0})
	return c.Render(http.StatusOK, "Counter", bf.RenderOptions{
		Props:   &props,
		Title:   "Counter - BarefootJS",
		Heading: "Counter Component",
	})
}

func toggleHandler(c echo.Context) error {
	props := NewToggleProps(ToggleInput{
		ToggleItems: []ToggleItemInput{
			{Label: "Setting 1", DefaultOn: true},
			{Label: "Setting 2", DefaultOn: false},
			{Label: "Setting 3", DefaultOn: false},
		},
	})

	return c.Render(http.StatusOK, "Toggle", bf.RenderOptions{
		Props:   &props,
		Title:   "Toggle - BarefootJS",
		Heading: "Toggle Component",
	})
}

func todosHandler(c echo.Context) error {
	state := getSession(c)
	state.mu.Lock()
	currentTodos := make([]Todo, len(state.todos))
	copy(currentTodos, state.todos)
	state.mu.Unlock()

	// Build TodoItemProps array with ScopeID for each item
	todoItems := make([]TodoItemProps, len(currentTodos))
	for i, t := range currentTodos {
		todoItems[i] = TodoItemProps{
			ScopeID: fmt.Sprintf("TodoItem_%d", t.ID),
			Todo:    t,
		}
	}

	props := NewTodoAppProps(TodoAppInput{
		InitialTodos: currentTodos,
	})
	// Manual fields not generated by NewTodoAppProps
	props.Todos = currentTodos  // For client hydration (JSON)
	props.TodoItems = todoItems // For Go template (not in JSON)

	return c.Render(http.StatusOK, "TodoApp", bf.RenderOptions{
		Props: &props,
		Title: "TodoMVC - BarefootJS",
	})
}

func reactivePropsHandler(c echo.Context) error {
	props := NewReactivePropsProps(ReactivePropsInput{})
	return c.Render(http.StatusOK, "ReactiveProps", bf.RenderOptions{
		Props:   &props,
		Title:   "Reactive Props - BarefootJS",
		Heading: "Reactive Props Test",
	})
}

func propsReactivityHandler(c echo.Context) error {
	props := NewPropsReactivityComparisonProps(PropsReactivityComparisonInput{})
	return c.Render(http.StatusOK, "PropsReactivityComparison", bf.RenderOptions{
		Props:   &props,
		Title:   "Props Reactivity - BarefootJS",
		Heading: "Props Reactivity Comparison",
	})
}

func formHandler(c echo.Context) error {
	props := NewFormProps(FormInput{})
	return c.Render(http.StatusOK, "Form", bf.RenderOptions{
		Props:   &props,
		Title:   "Form - BarefootJS",
		Heading: "Form Example",
	})
}

func portalHandler(c echo.Context) error {
	props := NewPortalExampleProps(PortalExampleInput{})
	return c.Render(http.StatusOK, "PortalExample", bf.RenderOptions{
		Props:   &props,
		Title:   "Portal - BarefootJS",
		Heading: "Portal Example",
	})
}

func conditionalReturnHandler(c echo.Context) error {
	props := NewConditionalReturnProps(ConditionalReturnInput{})
	return c.Render(http.StatusOK, "ConditionalReturn", bf.RenderOptions{
		Props:   &props,
		Title:   "Conditional Return - BarefootJS",
		Heading: "Conditional Return Example",
	})
}

func conditionalReturnLinkHandler(c echo.Context) error {
	props := NewConditionalReturnProps(ConditionalReturnInput{Variant: "link"})
	return c.Render(http.StatusOK, "ConditionalReturn", bf.RenderOptions{
		Props:   &props,
		Title:   "Conditional Return (Link) - BarefootJS",
		Heading: "Conditional Return Example (Link)",
	})
}

func todosSSRHandler(c echo.Context) error {
	state := getSession(c)
	state.mu.Lock()
	currentTodos := make([]Todo, len(state.todos))
	copy(currentTodos, state.todos)
	state.mu.Unlock()

	// Build TodoItemProps array with ScopeID for each item
	todoItems := make([]TodoItemProps, len(currentTodos))
	for i, t := range currentTodos {
		todoItems[i] = TodoItemProps{
			ScopeID: fmt.Sprintf("TodoItem_%d", t.ID),
			Todo:    t,
		}
	}

	props := NewTodoAppSSRProps(TodoAppSSRInput{
		InitialTodos: currentTodos,
	})
	// Manual fields not generated by NewTodoAppSSRProps
	props.Todos = currentTodos  // For client hydration (JSON)
	props.TodoItems = todoItems // For Go template (not in JSON)

	return c.Render(http.StatusOK, "TodoAppSSR", bf.RenderOptions{
		Props: &props,
		Title: "TodoMVC SSR - BarefootJS",
	})
}

// Todo API handlers
func getTodosAPI(c echo.Context) error {
	state := getSession(c)
	state.mu.Lock()
	defer state.mu.Unlock()
	return c.JSON(http.StatusOK, state.todos)
}

func createTodoAPI(c echo.Context) error {
	var input struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(c.Request().Body).Decode(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid input"})
	}

	state := getSession(c)
	state.mu.Lock()
	newTodo := Todo{
		ID:   state.nextID,
		Text: input.Text,
		Done: false,
	}
	state.nextID++
	state.todos = append(state.todos, newTodo)
	state.mu.Unlock()

	return c.JSON(http.StatusCreated, newTodo)
}

func updateTodoAPI(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	var input struct {
		Text *string `json:"text"`
		Done *bool   `json:"done"`
	}
	if err := json.NewDecoder(c.Request().Body).Decode(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid input"})
	}

	state := getSession(c)
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
			return c.JSON(http.StatusOK, state.todos[i])
		}
	}

	return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
}

func deleteTodoAPI(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	state := getSession(c)
	state.mu.Lock()
	defer state.mu.Unlock()

	for i, todo := range state.todos {
		if todo.ID == id {
			state.todos = append(state.todos[:i], state.todos[i+1:]...)
			return c.NoContent(http.StatusNoContent)
		}
	}

	return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
}

func resetTodosAPI(c echo.Context) error {
	state := getSession(c)
	state.mu.Lock()
	state.todos = seedTodos()
	state.nextID = 4
	state.mu.Unlock()
	return c.NoContent(http.StatusOK)
}

// ---------------------------------------------------------------------------
// AI Chat — Streaming SSR Example
// ---------------------------------------------------------------------------

var fakeResponses = []string{
	"[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
	"[Dummy response] BarefootJS compiles JSX to Go html/template + client JS. Signals drive reactivity on any backend.",
	"[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
	"[Dummy response] The Go/Echo backend streams each character with a 30ms delay to simulate token-by-token LLM output.",
	"[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
}

func aiChatHandler(c echo.Context) error {
	props := NewAIChatInteractiveProps(AIChatInteractiveInput{})
	return c.Render(http.StatusOK, "AIChatInteractive", bf.RenderOptions{
		Props:   &props,
		Title:   "AI Chat — SSE Streaming (Go/Echo)",
		Heading: "AI Chat — SSE Streaming",
		Extra: map[string]interface{}{
			"extra_css": fmt.Sprintf(`<link rel="stylesheet" href="%s/shared/styles/ai-chat.css">`, basePath),
		},
	})
}

func aiChatSSEHandler(c echo.Context) error {
	idx := int(time.Now().UnixNano()) % len(fakeResponses)
	if idx < 0 {
		idx = -idx
	}
	text := fakeResponses[idx]

	c.Response().Header().Set("Content-Type", "text/event-stream")
	c.Response().Header().Set("Cache-Control", "no-cache")
	c.Response().Header().Set("Connection", "keep-alive")
	c.Response().WriteHeader(http.StatusOK)

	flusher, ok := c.Response().Writer.(http.Flusher)
	if !ok {
		return echo.ErrInternalServerError
	}

	for _, ch := range text {
		encoded, _ := json.Marshal(string(ch))
		fmt.Fprintf(c.Response().Writer, "data: %s\n\n", encoded)
		flusher.Flush()
		time.Sleep(30 * time.Millisecond)
	}

	fmt.Fprint(c.Response().Writer, "data: [DONE]\n\n")
	flusher.Flush()
	return nil
}
