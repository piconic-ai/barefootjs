import { createFixture } from '../src/types'

/**
 * A query action's accessors read in template positions (#3158-B/#3166):
 * `fetchPosts.isPending()` as an attribute value and `fetchPosts.error()` as
 * a condition. These are seeded ordinary values now (`false` / `undefined`,
 * spec/async.md §7.3) — the request function never runs on the server, but
 * that IS the one seed value, not a refusal. SSR renders the non-pending,
 * no-error branch on every adapter, including Hono.
 *
 * Graduated from BF117 (#3165's original refusal, `query-action-read-in-
 * template` in the limitations registry) — this fixture is now its
 * regression test.
 *
 * `create-query-action-read-client` (kept passing): the same reads deferred
 * to the client with `/* @client *\/` still work — an explicit escape isn't
 * required anymore, but it isn't wrong either.
 */
export const fixture = createFixture({
  id: 'create-query-action-read',
  description: 'A createQuery action accessor read in a template position renders its seeded value on every adapter',
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
  expectedHtml: `
    <div aria-busy="false" bf-s="test"><!--bf-cond-start:s0--><!--bf-cond-end:s0--><ul bf="s2"><li data-key="1"><!--bf:s1-->Alpha<!--/--></li></ul></div>
  `,
})
