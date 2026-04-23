/**
 * SaasBlogPostDemo
 *
 * Single blog post view — fully SSR, no client JS.
 * Receives a post slug as a prop; shell handles 404 fallback.
 *
 * Compiler stress targets:
 * - Static content rendering with no reactive islands
 * - Conditional 404 state from a static prop
 * - Tag loop and paragraph loop
 */

import { BLOG_POSTS, getPost } from './blog-data'

interface SaasBlogPostDemoProps {
  slug: string
}

export function SaasBlogPostDemo({ slug }: SaasBlogPostDemoProps) {
  const post = getPost(slug)

  if (!post) {
    return (
      <div className="saas-blog-post-notfound flex flex-col items-center justify-center py-24 px-4 text-center space-y-4">
        <p className="text-4xl">404</p>
        <h1 className="text-xl font-semibold text-foreground">Post not found</h1>
        <p className="text-muted-foreground text-sm">
          This post does not exist or may have been moved.
        </p>
        <a href="/gallery/saas/blog" className="text-sm text-primary no-underline hover:underline">
          ← Back to blog
        </a>
      </div>
    )
  }

  return (
    <div className="saas-blog-post w-full max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">

      {/* Back link */}
      <a
        href="/gallery/saas/blog"
        className="saas-blog-back inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        All posts
      </a>

      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="saas-post-category inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
            {post.category}
          </span>
          <span className="text-xs text-muted-foreground">{post.date}</span>
          <span className="text-xs text-muted-foreground">{post.readMinutes} min read</span>
        </div>

        <h1 className="saas-post-title text-2xl sm:text-3xl font-bold tracking-tight leading-snug text-foreground">
          {post.title}
        </h1>

        <p className="text-muted-foreground leading-relaxed">{post.excerpt}</p>

        <div className="flex items-center gap-3 pt-1">
          <div className="size-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold shrink-0">
            {post.authorInitials}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{post.author}</p>
            <p className="text-xs text-muted-foreground">{post.authorRole}</p>
          </div>
        </div>
      </header>

      <hr className="border-border" />

      {/* Body */}
      <div className="saas-post-body space-y-5">
        {post.content.map((paragraph, i) => (
          <p key={i} className="text-foreground leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 flex-wrap pt-2">
        {post.tags.map((tag) => (
          <span
            key={tag}
            className="saas-post-tag inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div className="rounded-xl border bg-card p-5 space-y-3 text-center">
        <p className="text-sm font-medium text-foreground">Ready to ship like this?</p>
        <p className="text-xs text-muted-foreground">
          Deploy to the global edge in seconds. Start free, no credit card required.
        </p>
        <a
          href="/gallery/saas/pricing"
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground no-underline hover:bg-primary/90 transition-colors"
        >
          See pricing
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>

      {/* Other posts */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">More from the blog</h2>
        <div className="space-y-2">
          {BLOG_POSTS.filter((p) => p.slug !== slug).slice(0, 3).map((p) => (
            <a
              key={p.slug}
              href={`/gallery/saas/blog/${p.slug}`}
              className="saas-related-post flex items-start gap-3 rounded-lg p-3 no-underline hover:bg-muted/50 transition-colors"
            >
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.date} · {p.readMinutes} min</p>
              </div>
            </a>
          ))}
        </div>
      </div>

    </div>
  )
}
