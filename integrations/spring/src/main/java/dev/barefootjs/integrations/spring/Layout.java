package dev.barefootjs.integrations.spring;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Page layout (HTML shell) — mirrors {@code integrations/axum/src/main.rs}'s
 * {@code layout()} / {@code html_response} / {@code html_response_cached} /
 * {@code render_error} helpers.
 */
public final class Layout {

  private Layout() {}

  public static final class Opts {
    public String title = "";
    public String heading = "";
    public String body = "";
    public String scripts = "";
    /** SSR-portal elements ({@link Bf#portals()}, #3119) — an `ssrPortalOwnerScope`-flagged element's already-rendered markup, collected during render and emitted here instead of at its source position. */
    public String portals = "";
    public String extraCss = "";
    /** {@code null} -> default "back to index" link; {@code ""} suppresses it (the index page itself). */
    public String back = null;

    public Opts title(String v) { this.title = v; return this; }
    public Opts heading(String v) { this.heading = v; return this; }
    public Opts body(String v) { this.body = v; return this; }
    public Opts scripts(String v) { this.scripts = v; return this; }
    public Opts portals(String v) { this.portals = v; return this; }
    public Opts extraCss(String v) { this.extraCss = v; return this; }
    public Opts back(String v) { this.back = v; return this; }
  }

  public static String render(BfContext ctx, Opts opts) {
    String base = ctx.basePath;
    String headingHtml = opts.heading.isEmpty() ? "" : "<h1>" + opts.heading + "</h1>";
    String backHref = opts.back != null ? opts.back : base;
    String backHtml = backHref.isEmpty() ? "" : "<p><a href=\"" + backHref + "\">&larr; Back</a></p>";
    return "<!DOCTYPE html>\n"
        + "<html lang=\"en\" class=\"dark\">\n"
        + "<head>\n"
        + "    <meta charset=\"UTF-8\">\n"
        + "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
        + "    <title>" + htmlEscape(opts.title) + "</title>\n"
        + "    <link rel=\"stylesheet\" href=\"" + base + "/styles/tokens.css\">\n"
        + "    <link rel=\"stylesheet\" href=\"" + base + "/styles/layout.css\">\n"
        + "    <link rel=\"stylesheet\" href=\"" + base + "/styles/components.css\">\n"
        + "    <link rel=\"stylesheet\" href=\"" + base + "/styles/todo-app.css\">\n"
        + "    " + opts.extraCss + "\n"
        + "</head>\n"
        + "<body>\n"
        + "    <header class=\"bf-header\">\n"
        + "        <div class=\"bf-header-inner\">\n"
        + "            <a href=\"https://barefootjs.dev\" class=\"bf-header-logo\" aria-label=\"BarefootJS\">\n"
        + "                <span class=\"bf-header-logo-img\" role=\"img\" aria-hidden=\"true\"></span>\n"
        + "            </a>\n"
        + "            <div class=\"bf-header-sep\"></div>\n"
        + "            <nav class=\"bf-header-crumbs\" aria-label=\"Breadcrumb\">\n"
        + "                <a href=\"/integrations\" class=\"bf-header-link\">Integrations</a>\n"
        + "                <span class=\"bf-header-crumb-sep\" aria-hidden=\"true\">/</span>\n"
        + "                <span class=\"bf-header-current\" aria-current=\"page\">Spring</span>\n"
        + "            </nav>\n"
        + "        </div>\n"
        + "    </header>\n"
        + "    " + headingHtml + "\n"
        + "    <div id=\"app\">" + opts.body + "</div>\n"
        + "    " + backHtml + "\n"
        + "    " + opts.portals + "\n"
        + "    " + opts.scripts + "\n"
        + "</body>\n"
        + "</html>\n";
  }

  private static String htmlEscape(String s) {
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  public static ResponseEntity<String> htmlResponse(String html) {
    return ResponseEntity.ok().contentType(MediaType.valueOf("text/html; charset=utf-8")).body(html);
  }

  /**
   * Like {@link #htmlResponse}, but for routes confirmed session-free (no
   * cookie read, no per-visitor state) — sets `Cache-Control` explicitly so
   * `container.ts`'s `withCacheControl` (which leaves a response alone once
   * the backend has already set its own `Cache-Control`) makes this route
   * cacheable even when the visitor's browser happens to still be carrying a
   * stale `bf_session` cookie from an earlier `/todos` visit. The value MUST
   * match `HTML_CACHE_CONTROL` in `integrations/shared/lib/cache-control.ts`
   * verbatim.
   */
  public static ResponseEntity<String> htmlResponseCached(String html) {
    return ResponseEntity.ok()
        .contentType(MediaType.valueOf("text/html; charset=utf-8"))
        .cacheControl(CacheControl.maxAge(java.time.Duration.ofHours(1)).cachePublic().staleWhileRevalidate(java.time.Duration.ofHours(24)))
        .body(html);
  }

  public static ResponseEntity<String> renderError(Exception err) {
    System.err.println("barefoot: render error: " + err);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .contentType(MediaType.valueOf("text/plain; charset=utf-8"))
        .body(String.valueOf(err.getMessage()));
  }

  public static String appStaticHref(BfContext ctx, String rel) {
    String r = rel.startsWith("/") ? rel.substring(1) : rel;
    return ctx.basePath + "/" + r;
  }

  /** Adds a `Set-Cookie` header, when `minted`, to an otherwise-built response. */
  public static ResponseEntity<String> withCookie(ResponseEntity<String> response, boolean minted, String cookieHeader) {
    if (!minted) {
      return response;
    }
    HttpHeaders headers = new HttpHeaders();
    headers.putAll(response.getHeaders());
    headers.add(HttpHeaders.SET_COOKIE, cookieHeader);
    return new ResponseEntity<>(response.getBody(), headers, response.getStatusCode());
  }
}
