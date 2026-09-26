'use client'

// Mode B of `createQuery` (spec/async.md §7.3): `initial` comes from an
// optional prop. When the prop is absent there is no obtained result, so the
// value is `undefined` at SSR — the skeleton renders — and the query sends its
// first request on mount.
import { createQuery, http } from '@barefootjs/client'

type Post = { id: number; title: string }

export function CreateQueryOptionalInitial(props: { posts?: Post[] }) {
  const [posts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  return (
    <div>
      {!posts() ? (
        <p data-slot="skeleton">Loading…</p>
      ) : (
        <ul>
          {posts()!.map((post) => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
