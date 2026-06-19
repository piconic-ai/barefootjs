package main

import (
	"fmt"
	"html/template"
	"net/http"
	"sort"
	"strings"

	bf "github.com/barefootjs/runtime/bf"
	"github.com/barefootjs/runtime/bf/bfdev"
	"github.com/labstack/echo/v4"
)

// Blog — the `@barefootjs/router` showcase for the Go/Echo adapter.
//
// A region-shell sub-site mounted at `${basePath}/blog`, mirroring the Hono /
// h3 / Elysia integrations. The islands are the SAME shared components under
// `../shared/blog`, compiled by this integration's `bf build`. Partial
// navigation is driven entirely on the client by `@barefootjs/router`
// (bundled into `static/client/router-entry.js`); the server's only job is to
// return a plain HTML page per route with the right `bf-region` boundaries —
// exactly the "any backend, zero cooperation" point the blog itself makes.

// blogBasePath is where the blog is mounted; every blog link is built relative
// to it so the shared components work under any adapter's base path.
func blogBasePath() string { return basePath + "/blog" }

// blogSortKeys are the sort values the PostList understands; anything else
// falls back to "date" (matching the island's `asSortKey`).
var blogSortKeys = []string{"date", "title", "tag"}

// blogImportMap maps the bare `@barefootjs/client*` specifiers that the router
// bundle imports to the SAME physical `barefoot.js` the compiled islands import
// via the relative `./barefoot.js`. Resolving both to one URL gives a single
// reactive runtime instance, so `searchParams()` is one shared signal and the
// router's query push reaches the islands' effects.
func blogImportMap() string {
	bjs := basePath + "/static/client/barefoot.js"
	j := fmt.Sprintf(
		`{"imports":{"@barefootjs/client":%q,"@barefootjs/client/runtime":%q,"@barefootjs/client/reactive":%q}}`,
		bjs, bjs, bjs,
	)
	// Escape "<" so a stray "</script>" in the value (e.g. a misconfigured
	// BASE_PATH) can't break out of the inline <script type="importmap">. The
	// replacement is the JS unicode escape backslash-u003c, built by
	// concatenation so it survives verbatim.
	return strings.ReplaceAll(j, "<", `\`+"u003c")
}

// blogFrag renders one island subtree against shared script/portal collectors.
type blogFrag func(name string, props interface{}) template.HTML

// blogPageHTML assembles the region-shell document shared by every blog route.
// It mirrors the Hono blog renderer: a persistent shell (header ThemeToggle +
// a hand-authored `bf-region="nav:0"` Sidebar) wrapping a compiled <PageShell>
// whose inner region holds the per-route content.
//
// Every island — the shell ones AND the route content built by `renderContent`
// — is rendered through bf.Renderer.RenderFragment against ONE script + portal
// collector, so `barefoot.js` and each island's client JS are emitted exactly
// once and share a single runtime instance.
func blogPageHTML(title string, renderContent func(frag blogFrag) template.HTML) string {
	r := bf.NewRenderer(currentTemplates(), nil)
	sc := bf.NewScriptCollector()
	pc := bf.NewPortalCollector()

	frag := func(name string, props interface{}) template.HTML {
		return r.RenderFragment(bf.RenderOptions{ComponentName: name, Props: props}, sc, pc)
	}

	// Content first so its islands register before the shell's; PageShell wraps
	// it as `children`, Sidebar + ThemeToggle are the persistent shell.
	content := renderContent(frag)

	shellProps := NewPageShellProps(PageShellInput{Children: content})
	shellHTML := frag("PageShell", &shellProps)

	sidebarProps := NewSidebarProps(SidebarInput{})
	sidebarHTML := frag("Sidebar", &sidebarProps)

	themeProps := NewThemeToggleProps(ThemeToggleInput{})
	themeHTML := frag("ThemeToggle", &themeProps)

	scripts := bf.BfScripts(sc)
	portals := pc.Render()

	// Dev auto-reload snippet (empty in production) so `bun run build:watch`
	// rebuilds show up on refresh, matching the catalog pages' layout.
	devSnippet := bfdev.Snippet(bfdev.Config{Disabled: !isDevEnv()})

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <script type="importmap">%s</script>
    <link rel="stylesheet" href="%s/shared/styles/blog.css">
</head>
<body>
    <header class="shell">
        <a class="shell-brand" href="%s">📰 Barefoot Blog</a>
        <div class="shell-island">%s</div>
    </header>
    <div class="layout">
        <aside bf-region="nav:0">%s</aside>
        <main>%s</main>
    </div>
    %s%s
    <script type="module" src="%s/static/client/router-entry.js"></script>%s
</body>
</html>`,
		template.HTMLEscapeString(title),
		blogImportMap(),
		basePath,
		blogBasePath(),
		themeHTML,
		sidebarHTML,
		shellHTML,
		scripts,
		portals,
		basePath,
		devSnippet,
	)
}

// blogTagContains reports whether tag is one of the post's tags.
func blogTagContains(tags []string, tag string) bool {
	for _, t := range tags {
		if t == tag {
			return true
		}
	}
	return false
}

// blogVisible filters by tag then sorts, replicating the PostList island's
// `visible()` memo so the server render matches the client for any `?sort=` /
// `?tag=` URL. Go's byte-wise string comparison matches `localeCompare` for the
// ASCII titles/tags and ISO date strings used here.
func blogVisible(sortKey, tag string) []BlogPost {
	list := make([]BlogPost, 0, len(blogPosts))
	for _, p := range blogPosts {
		if tag == "" || blogTagContains(p.Tags, tag) {
			list = append(list, p)
		}
	}
	switch sortKey {
	case "title":
		sort.SliceStable(list, func(i, j int) bool { return list[i].Title < list[j].Title })
	case "tag":
		sort.SliceStable(list, func(i, j int) bool {
			ti, tj := firstTag(list[i]), firstTag(list[j])
			if ti != tj {
				return ti < tj
			}
			return list[i].Date > list[j].Date // tie-break: newest first
		})
	default: // "date"
		sort.SliceStable(list, func(i, j int) bool { return list[i].Date > list[j].Date })
	}
	return list
}

// firstTag returns the post's first tag, or "" (mirrors `a.tags[0] ?? ”`).
func firstTag(p BlogPost) string {
	if len(p.Tags) > 0 {
		return p.Tags[0]
	}
	return ""
}

// blogPostListItems builds the per-row child props for the filtered+sorted
// list, following the contract documented on NewPostListProps in components.go:
// each row mounts at slot "s13" under the list's scope (BfParent/BfMount), so it
// gets the bf-h/bf-m hydration markers the runtime reconciles the loop through.
// BfDataKey carries the post slug so the keyed list reconciles by identity (a
// pinned row keeps its state across a re-sort), matching `key={p.slug}`.
func blogPostListItems(parentScope, sortKey, tag string) []PostListItemProps {
	visible := blogVisible(sortKey, tag)
	items := make([]PostListItemProps, len(visible))
	for i, p := range visible {
		row := NewPostListItemProps(PostListItemInput{
			Href:  blogBasePath() + "/posts/" + p.Slug,
			Title: p.Title,
			Date:  p.Date,
			Meta:  blogMeta(p),
		})
		row.BfParent = parentScope
		row.BfMount = "s13"
		row.BfDataKey = p.Slug
		items[i] = row
	}
	return items
}

// validSortKey clamps a raw `?sort=` value to a known key, like the island's
// `asSortKey`. NewPostListProps applies the same clamp for `.Params.Sort`; we
// recompute it here to build the matching SSR row list.
func validSortKey(raw string) string {
	if bf.Includes(blogSortKeys, raw) {
		return raw
	}
	return "date"
}

// blogIndexHandler renders the post list. The list reacts to `?sort=` / `?tag=`
// via searchParams() on the client; on the server the same query drives both
// `NewPostListProps` (active highlight + hrefs) and the SSR row order/visibility.
func blogIndexHandler(c echo.Context) error {
	sp := bf.NewSearchParams(c.Request().URL.RawQuery)
	sortKey := validSortKey(sp.Get("sort"))
	tag := sp.Get("tag")

	title := "Barefoot Blog — Latest posts"
	if tag != "" {
		title = fmt.Sprintf("#%s — Barefoot Blog", tag)
	}

	html := blogPageHTML(title, func(frag blogFrag) template.HTML {
		listProps := NewPostListProps(PostListInput{
			Items:        blogListItems(),
			Tags:         blogAllTags(),
			Base:         blogBasePath(),
			SearchParams: sp,
		})
		listProps.PostListItems = blogPostListItems(listProps.ScopeID, sortKey, tag)
		listHTML := frag("PostList", &listProps)

		// The player lives in the content region on the index too, marked
		// data-bf-permanent, so the router moves the same live node between the
		// list and a post — it keeps playing instead of resetting.
		npProps := NewNowPlayingProps(NowPlayingInput{})
		npHTML := frag("NowPlaying", &npProps)

		return listHTML + npHTML
	})

	return c.HTML(http.StatusOK, html)
}

// blogPostHandler renders a single article. The whole article is the shared
// <PostArticle> island (its nested children are LikeButton / ReadingTimer /
// NowPlaying), so the markup comes from post data, not hand-authored HTML.
func blogPostHandler(c echo.Context) error {
	slug := c.Param("slug")
	a := blogArticleFor(slug)
	if !a.Found {
		return echo.NewHTTPError(http.StatusNotFound)
	}
	in := PostArticleInput{
		Slug:      a.Post.Slug,
		Title:     a.Post.Title,
		Date:      a.Post.Date,
		Tags:      a.Post.Tags,
		Body:      a.Post.Body,
		Position:  a.Position,
		Total:     a.Total,
		Base:      blogBasePath(),
		PrevSlug:  a.PrevSlug,
		PrevTitle: a.PrevTitle,
		NextSlug:  a.NextSlug,
		NextTitle: a.NextTitle,
	}

	html := blogPageHTML(a.Post.Title+" — Barefoot Blog", func(frag blogFrag) template.HTML {
		props := NewPostArticleProps(in)
		return frag("PostArticle", &props)
	})

	return c.HTML(http.StatusOK, html)
}
