package dev.barefootjs.integrations.spring;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

/**
 * Per-session in-memory todo storage — mirrors
 * {@code integrations/axum/src/session.rs}: each browser gets an opaque id
 * via a `BASE`-scoped cookie; this store keys on that id so one visitor's
 * list is never visible to another. LRU-bounded to keep memory usage
 * predictable.
 */
public final class SessionStore {
  public static final String SESSION_COOKIE = "bf_session";
  public static final long SESSION_TTL_SECS = 60L * 60 * 24 * 30; // 30d
  private static final int SESSION_STORE_MAX = 1000;

  private static final AtomicLong ID_COUNTER = new AtomicLong(0);

  public static final class Todo {
    public long id;
    public String text;
    public boolean done;
    public boolean editing;

    public Todo(long id, String text, boolean done, boolean editing) {
      this.id = id;
      this.text = text;
      this.done = done;
      this.editing = editing;
    }

    public Map<String, Object> toMap() {
      return Render.obj("id", (double) id, "text", text, "done", done, "editing", editing);
    }
  }

  public static final class SessionData {
    public final List<Todo> todos = new ArrayList<>();
    public long nextId = 4;
  }

  private static List<Todo> seedTodos() {
    List<Todo> out = new ArrayList<>();
    out.add(new Todo(1, "Setup project", false, false));
    out.add(new Todo(2, "Create components", false, false));
    out.add(new Todo(3, "Write tests", true, false));
    return out;
  }

  private final Map<String, SessionData> sessions = new LinkedHashMap<>();
  private final Set<String> order = new LinkedHashSet<>();
  private final Object lock = new Object();

  private static String newSessionId() {
    long nanos = System.nanoTime();
    long counter = ID_COUNTER.getAndIncrement();
    return Long.toHexString(nanos) + Long.toHexString(counter);
  }

  private static String cookieValue(HttpServletRequest request, String name) {
    Cookie[] cookies = request.getCookies();
    if (cookies == null) {
      return null;
    }
    for (Cookie c : cookies) {
      if (c.getName().equals(name)) {
        return c.getValue();
      }
    }
    return null;
  }

  public record Resolved<T>(T value, String sessionId, boolean minted) {}

  /**
   * Run `f` against the session's data (creating it if new), returning `f`'s
   * result plus the session id and whether it was just minted (the caller
   * sets the `Set-Cookie` header only in that case) — mirrors
   * {@code session.rs}'s {@code with_session}.
   */
  public <T> Resolved<T> withSession(HttpServletRequest request, Function<SessionData, T> f) {
    String existing = cookieValue(request, SESSION_COOKIE);
    String id = existing != null ? existing : newSessionId();
    boolean minted = existing == null;
    synchronized (lock) {
      SessionData data = sessions.get(id);
      if (data == null) {
        data = new SessionData();
        data.todos.addAll(seedTodos());
        sessions.put(id, data);
        order.add(id);
        while (order.size() > SESSION_STORE_MAX) {
          String oldest = order.iterator().next();
          order.remove(oldest);
          sessions.remove(oldest);
        }
      } else {
        order.remove(id);
        order.add(id);
      }
      T result = f.apply(data);
      return new Resolved<>(result, id, minted);
    }
  }

  /** Builds a `Set-Cookie` header value scoped to `basePath`, `HttpOnly` + `SameSite=Lax` — mirrors every other integration's session cookie attributes. */
  public static String setCookieHeader(String basePath, String id) {
    return SESSION_COOKIE + "=" + id + "; Path=" + basePath + "; Max-Age=" + SESSION_TTL_SECS + "; HttpOnly; SameSite=Lax";
  }
}
