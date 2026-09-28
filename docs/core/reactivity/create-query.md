---
title: createQuery
description: A reactive value loaded by an HTTP request, re-sent when a signal the request reads changes, and seeded on the server from the data it already has.
---

# createQuery

Creates a value that an HTTP request fills. The request is re-sent whenever a signal it reads changes. Returns `[value, action]`: the value getter, and an action that re-sends the request and carries its pending and error state.

```ts
import { createQuery, http } from '@barefootjs/client'

const [value, action] = createQuery<T>(
  fn: () => HttpDescriptor<T>,
  options?: { initial?: T; ttl?: number },
)

value()             // T when `initial` is a required prop, else T | undefined
action()            // re-send now; Promise<T>
action.isPending()  // the last send has not settled
action.error()      // the last send's error; cleared by the next success
```

```tsx
'use client'
import { createQuery, createSignal, http } from '@barefootjs/client'

type Post = { id: number; title: string }

export function PostList(props: { posts: Post[] }) {
  const [page, setPage] = createSignal(1)
  const [posts, fetchPosts] = createQuery(
    () => http.get<Post[]>('/api/posts', { page: page() }),
    { initial: props.posts },
  )
  return (
    <div aria-busy={fetchPosts.isPending()}>
      {fetchPosts.error() ? <p role="alert">Failed to load</p> : null}
      <ul>{posts().map((post) => <li key={post.id}>{post.title}</li>)}</ul>
      <button onClick={() => setPage(page() + 1)}>Next page</button>
    </div>
  )
}
```

The value survives a refetch and a failure: while the next page loads, the previous posts stay visible, and `isPending()` / `error()` describe the request, not the value.

## The request function

The first argument is a function, like a memo or effect body. The signals it reads are its dependencies. The compiler emits it into the client JS only, with prop reads kept live. It never runs on the server, on any adapter.

**Descriptors only.** The function must return an `http` request descriptor: `http.get(url, params?)`, `http.head`, `http.query`, `http.post`, `http.put`, `http.patch` or `http.delete`. A descriptor is plain data, so building one sends nothing, and the method, URL and body form the cache key. A function that returns anything else, such as a `Promise` from your own client, throws when it runs. Responses are parsed as JSON; a non-2xx response rejects with `HttpError` (`status`, `body`).

**One send per tick.** Several writes to the function's dependencies in one handler can run the function more than once, but only the last descriptor of the tick is sent, at the end of the tick. A dependency shared through two memos runs it once.

## The two SSR modes

The value on the server comes from `initial`, never from a request.

- **Mode A: the server already has the data.** Pass `initial` from a **required** prop. The server renders the list, the value's type is `T`, and the client sends nothing on mount: `initial` enters the cache as fresh for `ttl` (default 15 s).
- **Mode B: the server renders a shell.** Pass `initial` from an **optional** prop, or leave it out. When it is `undefined`, the value's type is `T | undefined`, the server renders the "no value" branch, and the client sends the request after hydration.

```tsx
'use client'
import { createQuery, http } from '@barefootjs/client'
import { Skeleton } from './skeleton'

type Post = { id: number; title: string }

export function Feed(props: { posts?: Post[] }) {
  const [posts] = createQuery(() => http.get<Post[]>('/api/posts'), { initial: props.posts })
  return !posts() ? <Skeleton /> : <ul>{posts()!.map((p) => <li key={p.id}>{p.title}</li>)}</ul>
}
```

Both modes are the same component. Which one a request takes is whether the parent passed the prop.

## `initial` is a result, not a placeholder

`initial` claims "this is what the request returns". Writing `initial: []` to avoid `undefined` tells the query the server already fetched an empty list, so it **suppresses the request**. For a placeholder, fold the value instead: `posts() ?? []`, or a memo over it.

## Pending and error in the template

On the server, `isPending()` is `false` and `error()` is `undefined`, because no request runs there. The compiler seeds these values where they render exactly as the Hono reference does:

- as a condition: `{fetchPosts.error() ? <Alert/> : null}`, `{fetchPosts.isPending() ? <Spinner/> : null}`;
- `isPending()` in an ARIA boolean-state attribute or an HTML boolean attribute: `aria-busy={fetchPosts.isPending()}`, `disabled={fetchPosts.isPending()}`.

Any other template read, such as `{fetchPosts.error()}` as text or `title={fetchPosts.isPending()}`, is refused with BF117. Read it inside a condition, in an event handler or effect, or defer it with `/* @client */`.

## Caveats

- Destructure the call as `const [value, action] = createQuery(…)`. `[value]` and `[, action]` also work; anything longer, or a third argument, is BF115 / BF116.
- Write the call in the component. Wrapping `createQuery` in a helper sends it through the reactive-factory inliner and its constraints; share the descriptor instead: `const postsAt = (page: number) => http.get('/api/posts', { page })`.
- A write that changes the data is a [`createMutation`](./create-mutation.md). Its `invalidates` option marks matching queries stale, and a live query re-sends at once.
- `bf debug graph` shows the query with edges from the signals its request function reads.

See [`spec/async.md`](../../../spec/async.md) §7 for the full model.
