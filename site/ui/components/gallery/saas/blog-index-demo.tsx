/**
 * SaasBlogIndexDemo
 *
 * Blog post listing page — fully SSR, no client JS.
 *
 * Compiler stress targets:
 * - Static map() loop over posts array
 * - Deep static nesting with no reactive islands
 * - Category badge rendering from static data
 */

import { BLOG_POSTS } from './blog-data'

export function SaasBlogIndexDemo() {
  return (
    <div className="saas-blog-index w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

      <div className="space-y-2">
        <h1 className="saas-blog-title text-3xl font-bold tracking-tight">Blog</h1>
        <p className="text-muted-foreground">
          Engineering deep-dives, product updates, and deployment best practices.
        </p>
      </div>

      <div className="space-y-6">
        {BLOG_POSTS.map((post) => (
          <article
            key={post.slug}
            className="saas-blog-card group rounded-xl border bg-card p-5 sm:p-6 space-y-3 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="saas-blog-category inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium">
                {post.category}
              </span>
              <span className="text-xs text-muted-foreground">{post.date}</span>
              <span className="text-xs text-muted-foreground">{post.readMinutes} min read</span>
            </div>

            <h2 className="saas-blog-post-title text-lg font-semibold text-foreground leading-snug">
              <a
                href={`/gallery/saas/blog/${post.slug}`}
                className="no-underline hover:text-primary transition-colors"
              >
                {post.title}
              </a>
            </h2>

            <p className="text-sm text-muted-foreground leading-relaxed">
              {post.excerpt}
            </p>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                  {post.authorInitials}
                </div>
                <div>
                  <span className="text-sm font-medium text-foreground">{post.author}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">{post.authorRole}</span>
                </div>
              </div>
              <a
                href={`/gallery/saas/blog/${post.slug}`}
                className="saas-blog-read-more text-xs font-medium text-primary no-underline hover:underline shrink-0"
              >
                Read more →
              </a>
            </div>
          </article>
        ))}
      </div>

    </div>
  )
}
