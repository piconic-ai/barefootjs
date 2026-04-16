package main

import (
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"

	bf "github.com/barefootjs/runtime/bf"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

// loadTemplates loads all templates with BarefootJS functions registered
func loadTemplates() *template.Template {
	return template.Must(
		template.New("").Funcs(bf.FuncMap()).ParseGlob("dist/templates/*.tmpl"),
	)
}

// EchoRenderer adapts bf.Renderer to Echo's Renderer interface
type EchoRenderer struct {
	bf *bf.Renderer
}

func (r *EchoRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	opts := data.(bf.RenderOptions)
	opts.ComponentName = name
	_, err := w.Write([]byte(r.bf.Render(opts)))
	return err
}

// defaultLayout renders the standard HTML page structure
func defaultLayout(ctx *bf.RenderContext) string {
	headingStyle := ""
	headingHTML := ""
	if ctx.Heading != "" {
		headingStyle = `
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    </style>`
		headingHTML = fmt.Sprintf(`
    <h1>%s</h1>`, ctx.Heading)
	}

	extraCSS := ""
	if css, ok := ctx.Extra["extra_css"].(string); ok && css != "" {
		extraCSS = "\n    " + css
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <title>%s</title>
    <link rel="stylesheet" href="/shared/styles/components.css">
    <link rel="stylesheet" href="/shared/styles/todo-app.css">%s%s
</head>
<body>%s
    <div id="app">%s</div>
    <p><a href="/">← Back</a></p>
    %s%s
</body>
</html>`, ctx.Title, headingStyle, extraCSS, headingHTML, ctx.ComponentHTML, ctx.Portals, ctx.Scripts)
}

// In-memory todo storage
var (
	todoMutex  sync.RWMutex
	todoNextID = 4
	todos      = []Todo{
		{ID: 1, Text: "Setup project", Done: false, Editing: false},
		{ID: 2, Text: "Create components", Done: false, Editing: false},
		{ID: 3, Text: "Write tests", Done: true, Editing: false},
	}
)

// Reset todos to initial state (for testing)
func resetTodos() {
	todoMutex.Lock()
	defer todoMutex.Unlock()
	todoNextID = 4
	todos = []Todo{
		{ID: 1, Text: "Setup project", Done: false, Editing: false},
		{ID: 2, Text: "Create components", Done: false, Editing: false},
		{ID: 3, Text: "Write tests", Done: true, Editing: false},
	}
}

func main() {
	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	// Renderer
	e.Renderer = &EchoRenderer{bf: bf.NewRenderer(loadTemplates(), defaultLayout)}

	// Routes
	e.GET("/", indexHandler)
	e.GET("/counter", counterHandler)
	e.GET("/toggle", toggleHandler)
	e.GET("/todos", todosHandler)
	e.GET("/todos-ssr", todosSSRHandler)
	e.GET("/reactive-props", reactivePropsHandler)
	e.GET("/props-reactivity", propsReactivityHandler)
	e.GET("/form", formHandler)
	e.GET("/portal", portalHandler)
	e.GET("/conditional-return", conditionalReturnHandler)
	e.GET("/conditional-return-link", conditionalReturnLinkHandler)
	e.GET("/ai-chat", aiChatHandler)
	e.GET("/api/ai-chat", aiChatSSEHandler)

	// Todo API endpoints
	e.GET("/api/todos", getTodosAPI)
	e.POST("/api/todos", createTodoAPI)
	e.PUT("/api/todos/:id", updateTodoAPI)
	e.DELETE("/api/todos/:id", deleteTodoAPI)
	e.POST("/api/todos/reset", resetTodosAPI)

	// Static files (for client JS)
	e.Static("/static", "dist")

	// Shared styles
	e.Static("/shared", "../shared")

	e.Logger.Fatal(e.Start(":8080"))
}

func indexHandler(c echo.Context) error {
	return c.HTML(http.StatusOK, `
<!DOCTYPE html>
<html>
<head>
    <title>BarefootJS + Echo Example</title>
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
        h1 { color: #333; }
        a { color: #0066cc; }
    </style>
</head>
<body>
    <h1>BarefootJS + Echo Example</h1>
    <p>This example demonstrates server-side rendering with Go Echo and BarefootJS.</p>
    <ul>
        <li><a href="/counter">Counter</a></li>
        <li><a href="/toggle">Toggle</a></li>
        <li><a href="/todos">Todo (@client)</a></li>
        <li><a href="/todos-ssr">Todo (no @client markers)</a></li>
        <li><a href="/ai-chat">AI Chat (SSE Streaming)</a></li>
    </ul>
</body>
</html>
`)
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
	todoMutex.RLock()
	currentTodos := make([]Todo, len(todos))
	copy(currentTodos, todos)
	todoMutex.RUnlock()

	// Count done todos
	doneCount := 0
	for _, t := range currentTodos {
		if t.Done {
			doneCount++
		}
	}

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
	props.DoneCount = doneCount

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
	todoMutex.RLock()
	currentTodos := make([]Todo, len(todos))
	copy(currentTodos, todos)
	todoMutex.RUnlock()

	// Count done todos
	doneCount := 0
	for _, t := range currentTodos {
		if t.Done {
			doneCount++
		}
	}

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
	props.DoneCount = doneCount

	return c.Render(http.StatusOK, "TodoAppSSR", bf.RenderOptions{
		Props: &props,
		Title: "TodoMVC SSR - BarefootJS",
	})
}

// Todo API handlers
func getTodosAPI(c echo.Context) error {
	todoMutex.RLock()
	defer todoMutex.RUnlock()
	return c.JSON(http.StatusOK, todos)
}

func createTodoAPI(c echo.Context) error {
	var input struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(c.Request().Body).Decode(&input); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid input"})
	}

	todoMutex.Lock()
	newTodo := Todo{
		ID:   todoNextID,
		Text: input.Text,
		Done: false,
	}
	todoNextID++
	todos = append(todos, newTodo)
	todoMutex.Unlock()

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

	todoMutex.Lock()
	defer todoMutex.Unlock()

	for i, todo := range todos {
		if todo.ID == id {
			if input.Text != nil {
				todos[i].Text = *input.Text
			}
			if input.Done != nil {
				todos[i].Done = *input.Done
			}
			return c.JSON(http.StatusOK, todos[i])
		}
	}

	return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
}

func deleteTodoAPI(c echo.Context) error {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid id"})
	}

	todoMutex.Lock()
	defer todoMutex.Unlock()

	for i, todo := range todos {
		if todo.ID == id {
			todos = append(todos[:i], todos[i+1:]...)
			return c.NoContent(http.StatusNoContent)
		}
	}

	return c.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
}

func resetTodosAPI(c echo.Context) error {
	resetTodos()
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
			"extra_css": `<link rel="stylesheet" href="/shared/styles/ai-chat.css">`,
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
