import { createFixture } from '../src/types'

/**
 * A query action's accessors read in template positions (#3165, BF117):
 * `fetchPosts.isPending()` as an attribute value and `fetchPosts.error()` as
 * a condition. The request function never runs on the server, so nothing
 * seeds them yet; the read is refused on every adapter including Hono.
 *
 * `escapes` twin: `create-query-action-read-client` — the same reads
 * deferred to the client with `/* @client *\/`.
 */
export const fixture = createFixture({
  id: 'create-query-action-read',
  description: 'Reading a createQuery action accessor in a template position refuses with BF117 on every adapter',
  source: `
'use client'
import { createQuery, http } from '@barefootjs/client'

type Post = { id: number; title: string }

export function PostList(props: { posts: Post[] }) {
  const [posts, fetchPosts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  return (
    <div aria-busy={fetchPosts.isPending()}>
      {fetchPosts.error() ? <p>Failed to load</p> : null}
      <ul>{posts().map((post) => <li key={post.id}>{post.title}</li>)}</ul>
    </div>
  )
}
`,
  props: { posts: [{ id: 1, title: 'Alpha' }] },
  escapes: [{ kind: 'client-directive', fixture: 'create-query-action-read-client' }],
})
