package dev.barefootjs.integrations.spring.controller;

import com.google.gson.Gson;
import dev.barefootjs.integrations.spring.BfContext;
import dev.barefootjs.integrations.spring.Layout;
import dev.barefootjs.integrations.spring.Render;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadLocalRandom;

/**
 * AI Chat — streaming SSR/SSE example. Mirrors
 * `integrations/axum/src/ai_chat.rs`'s `page_route`/`sse_route`.
 *
 * <p><b>SSE must not block the servlet thread pool</b> (the tracking
 * issue's explicit callout, same lesson as fastapi's asyncio SSE): the
 * request-handling (Tomcat) thread returns an {@link SseEmitter}
 * IMMEDIATELY and the actual char-by-char, 30ms-delayed streaming runs on a
 * SEPARATE virtual-thread executor — {@link Thread#sleep} on a virtual
 * thread parks it cheaply without pinning an OS thread, so this scales to
 * many concurrent streams the same way `tokio::time::sleep` does for axum,
 * with none of them holding a Tomcat worker thread for the stream's
 * duration.
 */
@RestController
public class AiChatController {
  private static final String[] AI_RESPONSES = {
      "[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
      "[Dummy response] BarefootJS compiles JSX to Pebble templates + client JS. Signals drive reactivity on any backend.",
      "[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
      "[Dummy response] The Spring Boot backend runs the barefootjs Pebble Java runtime directly and streams each character with a 30ms delay to simulate token-by-token LLM output.",
      "[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
  };

  private static final Gson GSON = new Gson();
  private static final ExecutorService SSE_EXECUTOR = Executors.newVirtualThreadPerTaskExecutor();

  private final BfContext ctx;

  public AiChatController(BfContext ctx) {
    this.ctx = ctx;
  }

  @GetMapping("${app.base-path}/ai-chat")
  public ResponseEntity<String> page() {
    Map<String, Object> stash = Render.obj(
        "messages", Render.arr(),
        "input", "",
        "streamingText", "",
        "isStreaming", false);
    String extraCss = "<link rel=\"stylesheet\" href=\"" + Layout.appStaticHref(ctx, "styles/ai-chat.css") + "\">";
    try {
      Render.Rendered rendered = Render.renderComponent(ctx, "AIChatInteractive", Render.emptyObj(), stash);
      return Layout.htmlResponseCached(Layout.render(ctx, new Layout.Opts()
          .title("AI Chat -- SSE Streaming (Spring)")
          .heading("AI Chat -- SSE Streaming")
          .body(rendered.body())
          .scripts(rendered.scripts())
          .extraCss(extraCss)));
    } catch (IOException e) {
      return Layout.renderError(e);
    }
  }

  private static String pickResponse() {
    int idx = ThreadLocalRandom.current().nextInt(AI_RESPONSES.length);
    return AI_RESPONSES[idx];
  }

  @GetMapping(value = "${app.base-path}/api/ai-chat", produces = "text/event-stream")
  public SseEmitter sse() {
    SseEmitter emitter = new SseEmitter(0L); // no timeout — the stream self-terminates on [DONE]
    String text = pickResponse();
    SSE_EXECUTOR.submit(() -> {
      try {
        for (int i = 0; i < text.length(); i++) {
          String payload = GSON.toJson(String.valueOf(text.charAt(i)));
          emitter.send(SseEmitter.event().data(payload));
          Thread.sleep(30);
        }
        emitter.send(SseEmitter.event().data("[DONE]"));
        emitter.complete();
      } catch (IOException | InterruptedException e) {
        emitter.completeWithError(e);
      }
    });
    return emitter;
  }
}
