'use client'

// A `createMutation` form (spec/async.md §7.4/§7.5, #3210). The submit
// button is `disabled={save.isPending()}` and an error branch reads
// `save.error()`: both accessors are seeded at SSR (`false` / `undefined`),
// and the value `saved()` is seeded `undefined` — a mutation has no
// `initial`. The request is sent only when the action is called, never on
// mount.
import { createMutation, http } from '@barefootjs/client'

type Comment = { id: number; text: string }

export function CreateMutationForm(props: { postId: number }) {
  const [saved, save] = createMutation(
    () => http.post<Comment>('/api/posts/' + props.postId + '/comments', { body: { text: 'hi' } }),
    { invalidates: ['/api/posts'] },
  )
  return (
    <form>
      {save.error() ? <p role="alert">Failed to save</p> : null}
      {saved() ? <p>Saved</p> : null}
      <button type="button" disabled={save.isPending()} onClick={() => save()}>
        Send
      </button>
    </form>
  )
}
