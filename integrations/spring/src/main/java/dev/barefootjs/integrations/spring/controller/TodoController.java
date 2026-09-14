package dev.barefootjs.integrations.spring.controller;

import dev.barefootjs.integrations.spring.BfContext;
import dev.barefootjs.integrations.spring.Layout;
import dev.barefootjs.integrations.spring.Render;
import dev.barefootjs.integrations.spring.SessionStore;
import dev.barefootjs.integrations.spring.SessionStore.Resolved;
import dev.barefootjs.integrations.spring.SessionStore.Todo;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Todo pages (`/todos`, `/todos-ssr`) and the todo REST API
 * (`/api/todos/*`), backed by the per-session in-memory store in
 * {@link SessionStore} — mirrors `integrations/axum/src/todo.rs`.
 */
@RestController
public class TodoController {
  private final BfContext ctx;

  public TodoController(BfContext ctx) {
    this.ctx = ctx;
  }

  private record TodosSnapshot(List<Object> todosJs, long doneCount) {}

  private ResponseEntity<String> todosPage(HttpServletRequest request, String component, String title) {
    // ONE `withSession` call: calling it twice on a cookie-less request
    // would mint TWO different session ids (the second call sees the same
    // cookie-less original request, since no response has been sent yet),
    // leaking an orphaned session record under the first id.
    //
    // `s.todos` holds the store's live, mutable `Todo` instances — copying
    // just the `List` container (the pre-fix shape here) still leaves every
    // `Todo` inside shared with whatever `updateTodo`/`createTodo` mutates
    // next, under a SEPARATE `withSession` lock acquisition. Reading
    // `t.toMap()`/`t.done` after this lambda returns races a concurrent
    // update with no happens-before edge (e.g. two tabs open to `/todos`).
    // Building the JSON-shaped snapshot AND the done count HERE, inside the
    // lock, mirrors `listTodos`'s pattern below and closes that race.
    Resolved<TodosSnapshot> data = ctx.sessions.withSession(request, s -> {
      List<Object> todosJs = new ArrayList<>();
      long done = 0;
      for (Todo t : s.todos) {
        todosJs.add(t.toMap());
        if (t.done) {
          done++;
        }
      }
      return new TodosSnapshot(todosJs, done);
    });
    List<Object> todosJs = data.value().todosJs();
    long done = data.value().doneCount();

    Map<String, Object> props = Render.obj("initialTodos", new ArrayList<>(todosJs));
    Map<String, Object> stash = Render.obj(
        "todos", new ArrayList<>(todosJs),
        "newText", "",
        "filter", "all",
        "doneCount", (double) done);

    ResponseEntity<String> response;
    try {
      Render.Rendered rendered = Render.renderComponent(ctx, component, props, stash);
      response = Layout.htmlResponse(Layout.render(ctx, new Layout.Opts()
          .title(title)
          .heading("")
          .body(rendered.body())
          .scripts(rendered.scripts())));
    } catch (IOException e) {
      return Layout.renderError(e);
    }
    return Layout.withCookie(response, data.minted(), SessionStore.setCookieHeader(ctx.basePath, data.sessionId()));
  }

  @GetMapping("${app.base-path}/todos")
  public ResponseEntity<String> todos(HttpServletRequest request) {
    return todosPage(request, "TodoApp", "TodoMVC - BarefootJS");
  }

  @GetMapping("${app.base-path}/todos-ssr")
  public ResponseEntity<String> todosSsr(HttpServletRequest request) {
    return todosPage(request, "TodoAppSSR", "TodoMVC SSR - BarefootJS");
  }

  // ---------------------------------------------------------------------
  // REST API
  // ---------------------------------------------------------------------

  private static <T> ResponseEntity<T> withCookie(ResponseEntity<T> response, boolean minted, String cookieHeader) {
    if (!minted) {
      return response;
    }
    HttpHeaders headers = new HttpHeaders();
    headers.putAll(response.getHeaders());
    headers.add(HttpHeaders.SET_COOKIE, cookieHeader);
    return new ResponseEntity<>(response.getBody(), headers, response.getStatusCode());
  }

  @GetMapping(value = "${app.base-path}/api/todos", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<List<Map<String, Object>>> listTodos(HttpServletRequest request) {
    Resolved<List<Map<String, Object>>> resolved = ctx.sessions.withSession(request, s -> {
      List<Map<String, Object>> out = new ArrayList<>();
      for (Todo t : s.todos) {
        out.add(t.toMap());
      }
      return out;
    });
    return withCookie(ResponseEntity.ok(resolved.value()), resolved.minted(),
        SessionStore.setCookieHeader(ctx.basePath, resolved.sessionId()));
  }

  public record CreateTodoInput(String text) {}

  @PostMapping(value = "${app.base-path}/api/todos", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> createTodo(HttpServletRequest request, @RequestBody(required = false) CreateTodoInput input) {
    String text = input != null && input.text() != null ? input.text() : "";
    Resolved<Todo> resolved = ctx.sessions.withSession(request, s -> {
      Todo todo = new Todo(s.nextId, text, false, false);
      s.nextId += 1;
      s.todos.add(todo);
      return todo;
    });
    ResponseEntity<Map<String, Object>> response = ResponseEntity.status(HttpStatus.CREATED).body(resolved.value().toMap());
    return withCookie(response, resolved.minted(), SessionStore.setCookieHeader(ctx.basePath, resolved.sessionId()));
  }

  public record UpdateTodoInput(String text, Boolean done) {}

  @PutMapping(value = "${app.base-path}/api/todos/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Map<String, Object>> updateTodo(
      HttpServletRequest request, @PathVariable long id, @RequestBody UpdateTodoInput input) {
    Resolved<Todo> resolved = ctx.sessions.withSession(request, s -> {
      for (Todo t : s.todos) {
        if (t.id == id) {
          if (input.text() != null) {
            t.text = input.text();
          }
          if (input.done() != null) {
            t.done = input.done();
          }
          return t;
        }
      }
      return null;
    });
    ResponseEntity<Map<String, Object>> response = resolved.value() != null
        ? ResponseEntity.ok(resolved.value().toMap())
        : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Render.obj("error", "not found"));
    return withCookie(response, resolved.minted(), SessionStore.setCookieHeader(ctx.basePath, resolved.sessionId()));
  }

  @DeleteMapping("${app.base-path}/api/todos/{id}")
  public ResponseEntity<Void> deleteTodo(HttpServletRequest request, @PathVariable long id) {
    Resolved<Void> resolved = ctx.sessions.withSession(request, s -> {
      s.todos.removeIf(t -> t.id == id);
      return null;
    });
    ResponseEntity<Void> response = ResponseEntity.noContent().build();
    return withCookie(response, resolved.minted(), SessionStore.setCookieHeader(ctx.basePath, resolved.sessionId()));
  }

  @PostMapping(value = "${app.base-path}/api/todos/reset", produces = MediaType.TEXT_PLAIN_VALUE)
  public ResponseEntity<String> resetTodos(HttpServletRequest request) {
    Resolved<Void> resolved = ctx.sessions.withSession(request, s -> {
      s.todos.clear();
      s.todos.add(new Todo(1, "Setup project", false, false));
      s.todos.add(new Todo(2, "Create components", false, false));
      s.todos.add(new Todo(3, "Write tests", true, false));
      s.nextId = 4;
      return null;
    });
    ResponseEntity<String> response = ResponseEntity.ok("ok");
    return withCookie(response, resolved.minted(), SessionStore.setCookieHeader(ctx.basePath, resolved.sessionId()));
  }
}
