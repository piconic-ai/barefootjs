package main

import (
	"fmt"
	"sort"
	"strings"
)

// BlogPost is the source post data for the blog showcase, ported from the
// shared TS source `integrations/shared/blog/posts.ts`. The JS integrations
// (Hono / h3 / Elysia) import that module directly; the Go integration keeps a
// byte-identical copy here so the same shared islands render the same markup.
type BlogPost struct {
	Slug    string
	Title   string
	Date    string
	Tags    []string
	Excerpt string
	Body    []string
}

// blogPosts mirrors `posts` in posts.ts, in the same order.
var blogPosts = []BlogPost{
	{
		Slug:    "partial-navigation",
		Title:   "Partial navigation, without a SPA framework",
		Date:    "2026-06-01",
		Tags:    []string{"design", "runtime"},
		Excerpt: `Swap only the content region and leave the shell mounted — no virtual DOM, no full rebuild.`,
		Body: []string{
			`Most "SPA feel" comes down to one trick: when you follow a link, replace only the part of the page that changed and keep everything else where it is.`,
			`BarefootJS already renders on the server and hydrates islands in place. The router adds the missing piece — intercept the link, fetch the next page, swap just the content outlet, re-hydrate.`,
			`The header you are reading this in never reloads. Watch the live counters as you move between posts.`,
		},
	},
	{
		Slug:    "any-backend",
		Title:   "Any backend, zero cooperation required",
		Date:    "2026-06-03",
		Tags:    []string{"backend", "design"},
		Excerpt: `The server just returns HTML. The router pulls the outlet out of the response on the client.`,
		Body: []string{
			`There is no special protocol to implement. This blog is a plain Hono server returning HTML strings.`,
			`The router sends no content-negotiation header: it just fetches the page and pulls the outlet out of the response on the client.`,
			`That is why the same approach works against Go, Perl, or any other backend the adapters target — the server stays a plain HTML server.`,
		},
	},
	{
		Slug:    "islands-stay-alive",
		Title:   "Islands in the shell stay alive",
		Date:    "2026-06-05",
		Tags:    []string{"islands", "runtime"},
		Excerpt: `Anything outside the outlet keeps its state: open menus, playing media, live counters, theme.`,
		Body: []string{
			`Because only the outlet is replaced, every interactive island in the surrounding shell survives a navigation untouched.`,
			`The uptime timer in the header was started once, on first load. Full reloads would reset it. It does not.`,
			`Toggle the theme switch up there, then navigate — the choice sticks because the shell was never torn down.`,
		},
	},
	{
		Slug:    "reuses-the-runtime",
		Title:   "It reuses the runtime you already ship",
		Date:    "2026-06-08",
		Tags:    []string{"runtime", "design"},
		Excerpt: `Re-hydration after a swap goes through the same walk the streaming primitive uses.`,
		Body: []string{
			`After the outlet is swapped, the freshly inserted islands need to hydrate. The router calls the same re-hydration walk the streaming primitive already uses.`,
			`New islands light up; the shell is left alone. The router package is tiny because the heavy lifting already lives in the runtime.`,
			`The like button and "time on page" timer below are outlet islands — they are re-created on every navigation, and torn down when you leave.`,
		},
	},
	{
		Slug:    "disposal-is-the-hard-part",
		Title:   "Disposal is the hard part",
		Date:    "2026-06-10",
		Tags:    []string{"runtime", "perf"},
		Excerpt: `Outgoing islands must release timers and listeners or they leak. The stress test measures it.`,
		Body: []string{
			`Swapping HTML in is easy. The subtle work is tearing the OLD islands down — their intervals, listeners, and subscriptions.`,
			`This demo wires a dispose hook that clears each outlet island on the way out. With it off, the per-page timers keep firing forever.`,
			`That is exactly why precise per-scope disposal is the router prototype's next step.`,
		},
	},
	{
		Slug:    "history-back-forward",
		Title:   "Back and forward, done right",
		Date:    "2026-06-12",
		Tags:    []string{"history", "design"},
		Excerpt: `popstate swaps the outlet to match the URL without pushing duplicate entries.`,
		Body: []string{
			`A client router lives or dies on the back button. On popstate the router swaps the outlet to match the new URL — without recording a fresh history entry.`,
			`The stress harness walks forward through several posts then mashes Back, asserting the content matches the URL at every step.`,
			`Scroll restoration on back/forward is a known gap — the router resets to the top for now.`,
		},
	},
	{
		Slug:    "rapid-fire",
		Title:   "Rapid-fire clicks and the last-wins rule",
		Date:    "2026-06-14",
		Tags:    []string{"perf", "runtime"},
		Excerpt: `Spam the links: the latest navigation must win even if an earlier response resolves last.`,
		Body: []string{
			`Users double-click. They click B before A has loaded. The router aborts the in-flight request and bails after each await, so the latest target always wins.`,
			`The stress harness forces a slow response, then navigates away, and asserts the stale content never lands.`,
			`This was a real race in the first cut — the prototype now has a regression test for it.`,
		},
	},
	{
		Slug:    "query-string-nav",
		Title:   "Filtering by tag is just navigation",
		Date:    "2026-06-16",
		Tags:    []string{"design", "backend"},
		Excerpt: `Same path, different query string — the outlet swaps just like any other link.`,
		Body: []string{
			`Tag filters on the index are plain links to ?tag=x. To the router they are ordinary same-origin navigations.`,
			`The outlet swaps to the filtered list; the shell and its theme stay put.`,
			`Hash-only links, in contrast, are left to the browser so in-page anchors keep working.`,
		},
	},
	{
		Slug:    "no-fragment-negotiation",
		Title:   "Why there is no fragment negotiation",
		Date:    "2026-06-18",
		Tags:    []string{"backend", "perf"},
		Excerpt: `Returning just the outlet fragment was considered and dropped — it shaves compressible markup but hurts caching.`,
		Body: []string{
			`A "smaller" fragment response only removes the shell markup, which gzip already compresses to almost nothing — while making the same URL return two different bodies, so it needs a Vary header that fragments the cache.`,
			`It would also force every fragment to re-include its island <script type="module"> tags and <title>, or navigated-to islands go inert.`,
			`The cost that actually matters is the round-trip, not the byte count — so the effort goes into prefetch, and the server stays a plain, cacheable HTML server.`,
		},
	},
	{
		Slug:    "where-this-goes",
		Title:   "Where this goes next",
		Date:    "2026-06-20",
		Tags:    []string{"design", "islands"},
		Excerpt: `Compiler-derived outlets, morph for persistent islands, prefetch on hover, snapshot cache.`,
		Body: []string{
			`The outlet is authored by hand today. The end state is the compiler deriving it from the component tree.`,
			`Add idiomorph-style morphing and data-bf-permanent for islands that should survive a swap, plus hover prefetch and a snapshot cache for instant back/forward.`,
			`This is the last post — loop back to the start from the navigation below.`,
		},
	},
}

// blogMeta renders the index list's pre-computed `meta` line (`<date> · #tag
// #tag`), matching `listItems[].meta` in posts.ts. It is computed here, NOT in
// the PostList island, on purpose: building it in the island needs a
// value-producing tag-map-join that the template-string adapters (Go included)
// can't lower for SSR. Pre-computing it upstream keeps the island's template a
// plain member access so the same shared component compiles on every adapter.
func blogMeta(p BlogPost) string {
	tags := make([]string, len(p.Tags))
	for i, t := range p.Tags {
		tags[i] = "#" + t
	}
	return fmt.Sprintf("%s · %s", p.Date, strings.Join(tags, " "))
}

// blogListItems derives the index-list items from blogPosts with `meta`
// pre-rendered, mirroring `listItems` in posts.ts.
func blogListItems() []Item {
	items := make([]Item, len(blogPosts))
	for i, p := range blogPosts {
		items[i] = Item{
			Slug:  p.Slug,
			Title: p.Title,
			Date:  p.Date,
			Tags:  p.Tags,
			Meta:  blogMeta(p),
		}
	}
	return items
}

// blogAllTags returns the sorted, de-duplicated tag set across all posts,
// mirroring `allTags` in posts.ts.
func blogAllTags() []string {
	seen := map[string]bool{}
	var tags []string
	for _, p := range blogPosts {
		for _, t := range p.Tags {
			if !seen[t] {
				seen[t] = true
				tags = append(tags, t)
			}
		}
	}
	sort.Strings(tags)
	return tags
}

// blogPostIndex returns the index of the post with the given slug, or -1,
// mirroring `postIndex` in posts.ts.
func blogPostIndex(slug string) int {
	for i, p := range blogPosts {
		if p.Slug == slug {
			return i
		}
	}
	return -1
}
