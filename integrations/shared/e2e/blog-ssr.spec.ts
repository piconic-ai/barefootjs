/**
 * Shared blog SSR (direct-load) E2E test.
 *
 * Guards the class of bug where a post page's article props (title, date,
 * body, slug, pager titles) reach the client hydration payload (`bf-p`) but
 * never make it into the SERVER-rendered HTML — these are static props, so
 * hydration never fills them in and the page stays visibly empty. The other
 * shared suites (and the adapter-local `blog.spec.ts` region tests) all
 * assert post-hydration/navigation behavior, so they pass against an
 * empty-SSR page; only a direct fetch of the raw HTML catches it. First
 * seen on axum, whose `render_island` originally dropped props with no
 * `ssrDefaults` entry.
 *
 * Expected values derive from the shared corpus (`../blog/posts`), so the
 * test tracks content edits. Assertions avoid markup- and escaping-
 * sensitive fragments: each string is cut before the first character an
 * adapter may entity-escape differently (`' " & < >`).
 */

import { test, expect } from '@playwright/test'
import { posts } from '../blog/posts'

/** Longest prefix free of cross-adapter escaping differences. */
function safeFragment(s: string): string {
  return s.split(/['"&<>]/)[0].trim().slice(0, 60).trim()
}

/**
 * Run the blog direct-load SSR test.
 *
 * @param blogUrl - The blog mount point (e.g. 'http://localhost:3008/integrations/flask/blog')
 */
export function blogSsrTests(blogUrl: string) {
  // Any post would do; pin one mid-list so BOTH pager links (prev + next)
  // exist and their titles assert the props actually flowed.
  const slug = 'disposal-is-the-hard-part'

  // Mirror the route handlers: the pager walks the list newest-first.
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date))
  const idx = sorted.findIndex((p) => p.slug === slug)
  const post = sorted[idx]
  const prev = sorted[idx - 1]
  const next = sorted[idx + 1]

  test.describe('Blog SSR (direct load)', () => {
    test('a post page carries the full article in the server-rendered HTML', async ({ page }) => {
      const res = await page.goto(`${blogUrl}/posts/${slug}`, { waitUntil: 'commit' })
      expect(res?.status()).toBe(200)
      // Assert on the raw response body — the pre-hydration server output —
      // not the live DOM, which client JS may have already touched.
      const html = (await res?.text()) ?? ''
      expect(html).toContain(safeFragment(post.title))
      expect(html).toContain(post.date)
      expect(html).toContain(`data-slug="${slug}"`)
      for (const para of post.body) {
        const fragment = safeFragment(para)
        if (fragment.length > 10) expect(html).toContain(fragment)
      }
      expect(html).toContain(safeFragment(prev.title))
      expect(html).toContain(safeFragment(next.title))
      // And the visible article heading (shared PostArticle markup).
      await expect(page.locator('.post h1')).toHaveText(post.title)
    })
  })
}
