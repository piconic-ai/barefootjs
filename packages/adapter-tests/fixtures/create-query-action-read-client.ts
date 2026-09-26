import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `create-query-action-read` (#3165). The marker
 * defers each action-accessor read to the client, so no BF117 fires and the
 * SSR leaves both positions for hydration to fill.
 */
export const fixture = createFixture({
  id: 'create-query-action-read-client',
  description: 'createQuery action accessors deferred with /* @client */ suppress BF117',
  source: `
'use client'
import { createQuery, http } from '@barefootjs/client'

type Post = { id: number; title: string }

export function PostList(props: { posts: Post[] }) {
  const [posts, fetchPosts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  return (
    <div aria-busy={/* @client */ fetchPosts.isPending()}>
      {/* @client */ fetchPosts.error() ? <p>Failed to load</p> : null}
      <ul>{posts().map((post) => <li key={post.id}>{post.title}</li>)}</ul>
    </div>
  )
}
`,
  props: { posts: [{ id: 1, title: 'Alpha' }] },
  expectedHtml: `
    <div bf-s="test" bf="s3"><!--bf-cond-start:s0--><!--bf-cond-end:s0--><ul bf="s2"><li data-key="1"><!--bf:s1-->Alpha<!--/--></li></ul></div>
  `,
})
