package dev.barefootjs.integrations.spring.controller;

import dev.barefootjs.integrations.spring.BfContext;
import dev.barefootjs.integrations.spring.BlogData;
import dev.barefootjs.integrations.spring.Layout;
import dev.barefootjs.integrations.spring.Render;
import dev.barefootjs.pebble.Bf;
import dev.barefootjs.pebble.ChildMeta;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Blog — the `@barefootjs/router` showcase, mounted under
 * `${BASE}/blog`. Mirrors `integrations/axum/src/blog.rs`: a region-shell
 * layout (header + `ThemeToggle` in the shell, a hand-authored sidebar
 * region `nav:0` + the compiled `PageShell` nested content region in the
 * main column) whose islands are the shared blog components in
 * `../shared/blog`, compiled by this integration's Vite build
 * (`vite.config.ts`). The client router (`client/router-entry.ts`, its
 * bundled URL resolved into `ctx.assets.get("RouterEntry")`) fetches a full
 * HTML page for every navigation and diffs `[bf-region]` boundaries
 * client-side, so every route below just returns a normal HTML document.
 *
 * <p>`PostList`'s own `params` memo returns an OBJECT built through a
 * helper function, and `sortClass`/`tagClass` are plain functions called
 * with different literal arguments per link — shapes the static
 * `ssrDefaults` extractor can't lower for SSR. We seed `params` from the
 * request query (validated the same way the client's `asSortKey` would) and
 * `visible` with the filtered+sorted list; the client re-derives the same
 * values from `searchParams()` on hydration. This mirrors `blog.rs`'s
 * `blog_index_route` exactly (down to `as_sort_key`).
 */
@RestController
public class BlogController {
  private final BfContext ctx;

  public BlogController(BfContext ctx) {
    this.ctx = ctx;
  }

  private static final List<String> SORT_KEYS = List.of("date", "title", "tag");

  /** Mirrors `PostList`'s `asSortKey`: an unknown/absent `?sort=` falls back to `'date'` so the SSR row order always matches a valid post-hydration state. */
  private static String asSortKey(String raw) {
    return raw != null && SORT_KEYS.contains(raw) ? raw : "date";
  }

  private static String firstTag(BlogData.ListItem p) {
    return p.tags.isEmpty() ? "" : p.tags.get(0);
  }

  private static List<BlogData.ListItem> visibleItems(List<BlogData.ListItem> items, String sortKey, String tag) {
    List<BlogData.ListItem> list = new ArrayList<>();
    for (BlogData.ListItem p : items) {
      if (tag.isEmpty() || p.tags.contains(tag)) {
        list.add(p);
      }
    }
    Comparator<BlogData.ListItem> cmp;
    switch (sortKey) {
      case "title":
        cmp = Comparator.comparing(a -> a.title);
        break;
      case "tag":
        cmp = Comparator.<BlogData.ListItem, String>comparing(BlogController::firstTag)
            .thenComparing((a, b) -> b.date.compareTo(a.date));
        break;
      default:
        cmp = (a, b) -> b.date.compareTo(a.date);
    }
    list.sort(cmp);
    return list;
  }

  private static Map<String, Object> listItemJs(BlogData.ListItem item) {
    return Render.obj(
        "slug", item.slug,
        "title", item.title,
        "date", item.date,
        "tags", new ArrayList<Object>(item.tags),
        "meta", item.meta);
  }

  private String blogBase() {
    return ctx.basePath + "/blog";
  }

  private static String esc(String s) {
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  /** Assemble the region-shell document shared by every blog route. `seed` is the shared render-tree anchor every island shares (see {@link Render#newRenderTreeSeed}). */
  private String blogPage(Bf seed, String title, String contentHtml) throws IOException {
    String base = blogBase();
    String theme = Render.renderIsland(ctx, seed, "ThemeToggle", Render.emptyObj(), Render.emptyObj()).body();
    String sidebar = Render.renderIsland(ctx, seed, "Sidebar", Render.emptyObj(), Render.emptyObj()).body();
    Render.Rendered shellRendered = Render.renderComponentWithRawChildren(
        ctx, "PageShell", Render.emptyObj(), Render.emptyObj(), contentHtml, seed);
    String scripts = seed.scripts();
    // #3119: an `ssrPortalOwnerScope`-flagged element anywhere in this page's
    // shared render tree (`seed` — ThemeToggle/Sidebar/PageShell all share
    // it) registers its markup with `seed` rather than returning it inline;
    // without flushing it here that markup would be silently dropped from
    // the page instead of rendered, the same outlet every other layout site
    // (`Layout.render`) now wires in.
    String portals = seed.portals();
    String routerEntry = ctx.assets.getOrDefault("RouterEntry", "");

    return "<!DOCTYPE html>\n"
        + "<html lang=\"en\" data-theme=\"dark\">\n"
        + "<head>\n"
        + "<meta charset=\"UTF-8\">\n"
        + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
        + "<title>" + esc(title) + "</title>\n"
        + "<link rel=\"stylesheet\" href=\"" + ctx.basePath + "/styles/blog.css\">\n"
        + "</head>\n"
        + "<body>\n"
        + "<header class=\"shell\">\n"
        + "<a class=\"shell-brand\" href=\"" + base + "\">&#128240; Barefoot Blog</a>\n"
        + "<div class=\"shell-island\">" + theme + "</div>\n"
        + "</header>\n"
        + "<div class=\"layout\">\n"
        + "<aside bf-region=\"nav:0\">" + sidebar + "</aside>\n"
        + "<main>" + shellRendered.body() + "</main>\n"
        + "</div>\n"
        + portals + "\n"
        + scripts + "\n"
        + "<script type=\"module\" src=\"" + routerEntry + "\"></script>\n"
        + "</body>\n"
        + "</html>\n";
  }

  @GetMapping("${app.base-path}/blog")
  public ResponseEntity<String> index(
      @RequestParam(required = false) String sort, @RequestParam(required = false) String tag) {
    String sortKey = asSortKey(sort);
    String tagValue = tag != null ? tag : "";

    List<Object> items = new ArrayList<>();
    for (BlogData.ListItem it : ctx.blog.listItems) {
      items.add(listItemJs(it));
    }
    List<BlogData.ListItem> visible = visibleItems(ctx.blog.listItems, sortKey, tagValue);
    List<Object> visibleJs = new ArrayList<>();
    for (BlogData.ListItem it : visible) {
      visibleJs.add(listItemJs(it));
    }
    String base = blogBase();

    Bf seed = Render.newRenderTreeSeed(ctx, ctx.manifest);
    Map<String, Object> props = Render.obj(
        "items", items,
        "tags", new ArrayList<Object>(ctx.blog.allTags),
        "base", base);
    Map<String, Object> extra = Render.obj(
        "params", Render.obj("sort", sortKey, "tag", tagValue),
        "visible", visibleJs,
        "sortClass", "sort",
        "root", base,
        "tagClass", "tag");

    try {
      String postList = Render.renderIsland(ctx, seed, "PostList", props, extra).body();
      Map<String, Object> nowPlayingExtra = Render.obj("Math", Render.obj("min", 0.0));
      String nowPlaying = Render.renderIsland(ctx, seed, "NowPlaying", Render.emptyObj(), nowPlayingExtra).body();

      String title = tagValue.isEmpty() ? "Barefoot Blog — Latest posts" : "#" + tagValue + " — Barefoot Blog";
      String html = blogPage(seed, title, postList + nowPlaying);
      return Layout.htmlResponseCached(html);
    } catch (IOException e) {
      return Layout.renderError(e);
    }
  }

  @GetMapping("${app.base-path}/blog/posts/{slug}")
  public ResponseEntity<String> post(@PathVariable String slug) {
    // Sort newest-first (the index's default display order) so the article
    // pager walks down the list the reader is browsing; the corpus is
    // authored oldest-first.
    List<BlogData.Post> posts = new ArrayList<>(ctx.blog.posts);
    posts.sort((a, b) -> b.date.compareTo(a.date));
    int idx = -1;
    for (int i = 0; i < posts.size(); i++) {
      if (posts.get(i).slug.equals(slug)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      return ResponseEntity.status(404).body("Not Found");
    }
    BlogData.Post post = posts.get(idx);
    BlogData.Post prev = idx > 0 ? posts.get(idx - 1) : null;
    BlogData.Post next = idx + 1 < posts.size() ? posts.get(idx + 1) : null;
    String base = blogBase();

    // `now_playing` rendered INSIDE `PostArticle` needs the same `Math`
    // stash entry the standalone top-level island gets above — see
    // `Render#withSignalOverride`'s doc comment.
    Map<String, ChildMeta> manifestWithOverride = Render.withSignalOverride(
        ctx.manifest, "now_playing", Render.obj("Math", Render.obj("min", 0.0)));
    Bf seed = Render.newRenderTreeSeed(ctx, manifestWithOverride);

    Map<String, Object> props = Render.obj(
        "slug", post.slug,
        "title", post.title,
        "date", post.date,
        "tags", new ArrayList<Object>(post.tags),
        "body", new ArrayList<Object>(post.body),
        "position", (double) (idx + 1),
        "total", (double) posts.size(),
        "base", base,
        "prevSlug", prev != null ? prev.slug : null,
        "prevTitle", prev != null ? prev.title : null,
        "nextSlug", next != null ? next.slug : null,
        "nextTitle", next != null ? next.title : null);

    try {
      String content = Render.renderIsland(ctx, seed, "PostArticle", props, Render.emptyObj()).body();
      String html = blogPage(seed, post.title + " — Barefoot Blog", content);
      return Layout.htmlResponseCached(html);
    } catch (IOException e) {
      return Layout.renderError(e);
    }
  }
}
