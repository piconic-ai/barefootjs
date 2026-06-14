import { describe, expect, test } from 'bun:test'
import { renderBlogPage, posts } from '../example/blog.ts'

describe('blog example', () => {
  test('renders every post as a complete progressively-enhanceable document', () => {
    for (const post of posts) {
      const html = renderBlogPage(`/blog/${post.slug}`)
      expect(html).toContain('<!doctype html>')
      expect(html).toContain('<main bf-outlet>')
      expect(html).toContain(`<h1>${post.title}</h1>`)
      expect(html.match(/<a href="\/blog\//g)).toHaveLength(posts.length)
      expect(html).not.toContain('X-Barefoot-Navigate')
      expect(html).not.toContain('data-bf-router')
    }
  })
})
