import { createFixture } from '../src/types'

/**
 * A memo derived from a `createQuery` value (#3165) resolves its SSR seed from
 * `initial` on every adapter, like a memo over a `createSignal` getter.
 */
export const fixture = createFixture({
  id: 'create-query-derived-memo',
  description: 'A memo over a createQuery value is seeded from `initial` at SSR',
  source: `
'use client'
import { createMemo, createQuery, http } from '@barefootjs/client'

type Post = { id: number; title: string }

export function PostCount(props: { posts: Post[] }) {
  const [posts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  const count = createMemo(() => posts()?.length ?? 0)
  return <p>{count()} posts</p>
}
`,
  props: {
    posts: [
      { id: 1, title: 'Alpha' },
      { id: 2, title: 'Beta' },
    ],
  },
  expectedHtml: `
    <p bf-s="test" bf="s1"><!--bf:s0-->2<!--/--> posts</p>
  `,
})
