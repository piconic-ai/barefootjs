package dev.barefootjs.integrations.spring;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;

/**
 * Static asset serving + trailing-slash normalization + the bare-`/`
 * fallback redirect — mirrors `integrations/axum/src/main.rs`'s
 * `.nest_service("/client", ...)` / `.nest_service("/styles", ...)`,
 * `NormalizePathLayer::trim_trailing_slash()`, and the bare-`/` `Redirect`
 * route respectively.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

  private final BfContext ctx;

  public WebConfig(BfContext ctx) {
    this.ctx = ctx;
  }

  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    // `dist/client` (Vite's build.outDir — the compiled, content-hashed
    // client JS bundle) and `dist/styles` (the shared design-system
    // stylesheets, staged there by `scripts/copy-shared.ts`) are plain
    // filesystem directories relative to the process's working directory —
    // never web-exposed at any other path, matching every sibling
    // integration's `/client` + `/styles` convention.
    registry.addResourceHandler(ctx.basePath + "/client/**").addResourceLocations("file:dist/client/");
    registry.addResourceHandler(ctx.basePath + "/styles/**").addResourceLocations("file:dist/styles/");
  }

  /**
   * Spring MVC (Spring Framework 6 / Boot 3+) no longer matches a trailing
   * slash by default, unlike axum/gin/flask, which all accept both
   * spellings. Trim it BEFORE routing (redirect, not rewrite) so
   * `/integrations/spring/` and `/integrations/spring/counter/` resolve the
   * same way their bare forms do — mirrors axum's
   * `NormalizePathLayer::trim_trailing_slash()` exactly (a real 301, not an
   * internal forward, so the browser's address bar and any relative-link
   * resolution stay correct).
   */
  @Bean
  @Order(Ordered.HIGHEST_PRECEDENCE)
  public jakarta.servlet.Filter trailingSlashRedirectFilter() {
    return new OncePerRequestFilter() {
      @Override
      protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
          throws ServletException, IOException {
        String uri = request.getRequestURI();
        if (uri.length() > 1 && uri.endsWith("/")) {
          String trimmed = uri.substring(0, uri.length() - 1);
          String query = request.getQueryString();
          String location = query != null ? trimmed + "?" + query : trimmed;
          response.setStatus(HttpServletResponse.SC_MOVED_PERMANENTLY);
          response.setHeader("Location", location);
          return;
        }
        chain.doFilter(request, response);
      }
    };
  }

  /** The bare `/` -> `${BASE_PATH}` fallback redirect, exactly like `main.rs`'s `Router::new().route("/", get(move || Redirect::to(&target)))`. */
  @Controller
  public static class RootRedirectController {
    private final BfContext ctx;

    public RootRedirectController(BfContext ctx) {
      this.ctx = ctx;
    }

    @GetMapping("/")
    public String root() {
      return "redirect:" + ctx.basePath;
    }
  }
}
