package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// BlogPost is one post from the shared corpus.
type BlogPost struct {
	Slug    string   `json:"slug"`
	Title   string   `json:"title"`
	Date    string   `json:"date"`
	Tags    []string `json:"tags"`
	Excerpt string   `json:"excerpt"`
	Body    []string `json:"body"`
}

// blogDataFile is the shape of dist/blog-data.json, generated at build time by
// scripts/gen-blog-data.ts from the single shared corpus
// (../shared/blog/posts.ts) — the same source the JS adapters import and the
// Perl integrations read. The Go corpus is no longer hand-transcribed.
type blogDataFile struct {
	Posts     []BlogPost `json:"posts"`
	ListItems []Item     `json:"listItems"`
	AllTags   []string   `json:"allTags"`
}

// blogData is loaded once at process start. A missing / unreadable file yields
// an empty corpus (the blog renders empty) rather than crashing the whole
// server, matching the Perl integration's graceful fallback.
var blogData = loadBlogData()

func loadBlogData() blogDataFile {
	b, err := os.ReadFile("dist/blog-data.json")
	if err != nil {
		fmt.Fprintf(os.Stderr, "barefoot: blog data not found (run `bun run build`): %v\n", err)
		return blogDataFile{}
	}
	var d blogDataFile
	if err := json.Unmarshal(b, &d); err != nil {
		fmt.Fprintf(os.Stderr, "barefoot: blog data parse error: %v\n", err)
		return blogDataFile{}
	}
	return d
}

// blogPosts is the post corpus.
var blogPosts = blogData.Posts

// blogListItems returns the index-list items with pre-rendered `meta`, derived
// upstream in posts.ts so every adapter renders identical markup.
func blogListItems() []Item { return blogData.ListItems }

// blogAllTags returns the sorted, de-duplicated tag set.
func blogAllTags() []string { return blogData.AllTags }

// blogMeta renders the `<date> · #tag #tag` meta line for a post — the same
// format posts.ts pre-computes into listItems[].meta, recomputed here for the
// rows blogPostListItems builds from the sorted/filtered corpus.
func blogMeta(p BlogPost) string {
	tags := make([]string, len(p.Tags))
	for i, t := range p.Tags {
		tags[i] = "#" + t
	}
	return fmt.Sprintf("%s · %s", p.Date, strings.Join(tags, " "))
}

// blogArticle is everything a post page needs, with its pager neighbours
// computed in the index's default display order (date descending — newest
// first) rather than the authored corpus order (oldest-first). That way the
// article pager walks DOWN the list the reader is browsing: "next" is the post
// below in the list, "prev" the post above. The newest post (top of the list)
// thus gets a real "next" instead of falling off the end into "back to list".
type blogArticle struct {
	Post                BlogPost
	Position, Total     int
	PrevSlug, PrevTitle string
	NextSlug, NextTitle string
	Found               bool
}

// blogArticleFor looks up a post by slug and computes its pager neighbours in
// the default list order (date descending). Found is false for an unknown slug.
func blogArticleFor(slug string) blogArticle {
	ordered := blogVisible("date", "")
	for pos, q := range ordered {
		if q.Slug != slug {
			continue
		}
		a := blogArticle{Post: q, Position: pos + 1, Total: len(ordered), Found: true}
		if pos > 0 {
			a.PrevSlug, a.PrevTitle = ordered[pos-1].Slug, ordered[pos-1].Title
		}
		if pos < len(ordered)-1 {
			a.NextSlug, a.NextTitle = ordered[pos+1].Slug, ordered[pos+1].Title
		}
		return a
	}
	return blogArticle{}
}
