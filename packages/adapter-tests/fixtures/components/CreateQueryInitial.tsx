'use client'

// Mode A of `createQuery` (spec/async.md §7.3): `initial` is the result the
// server already obtained, passed in as a required prop. The value is seeded
// from it at SSR, so the list renders server-side, and the query sends no
// request on mount. The action re-sends on demand.
//
// The value binding shares its name with the prop it is seeded from
// (`posts` / `props.posts`) — the shape that silently mis-seeds signals on
// template adapters if it takes the wrong path (#2669).
import { createQuery, http } from '@barefootjs/client'

type Post = { id: number; title: string }

export function CreateQueryInitial(props: { posts: Post[] }) {
  const [posts, fetchPosts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  return (
    <div>
      <ul>
        {posts().map((post) => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
      <button onClick={() => fetchPosts()}>reload</button>
    </div>
  )
}
