package dev.barefootjs.integrations.spring.controller;

import dev.barefootjs.integrations.spring.BfContext;
import dev.barefootjs.integrations.spring.Layout;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The `/` index page — mirrors `integrations/axum/src/main.rs`'s `home_route`. */
@RestController
public class HomeController {
  private final BfContext ctx;

  public HomeController(BfContext ctx) {
    this.ctx = ctx;
  }

  @GetMapping("${app.base-path}")
  public ResponseEntity<String> home() {
    String base = ctx.basePath;
    String body = "<p>This example renders the same shared JSX components as every other"
        + " BarefootJS integration under a plain Spring Boot app, using the Pebble Java"
        + " runtime (packages/adapter-pebble/java) as the rendering backend.</p>"
        + "<ul>"
        + "    <li><a href=\"" + base + "/counter\">Counter</a></li>"
        + "    <li><a href=\"" + base + "/toggle\">Toggle</a></li>"
        + "    <li><a href=\"" + base + "/todos\">Todo (@client)</a></li>"
        + "    <li><a href=\"" + base + "/todos-ssr\">Todo (no @client markers)</a></li>"
        + "    <li><a href=\"" + base + "/ai-chat\">AI Chat (SSE Streaming)</a></li>"
        + "    <li><a href=\"" + base + "/blog\">Blog (@barefootjs/router - partial navigation)</a></li>"
        + "</ul>";
    return Layout.htmlResponseCached(Layout.render(ctx, new Layout.Opts()
        .title("BarefootJS + Spring Example")
        .heading("BarefootJS + Spring Example")
        .body(body)
        .back("")));
  }
}
