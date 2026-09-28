import { createFixture } from '../src/types'

/**
 * `createMutation`'s request function (#3210) reads a local signal and a
 * prop. It is emitted into the client JS as the call's argument, with the
 * prop read live (`_p.postId`), and it is never evaluated on the server or
 * wrapped in anything that tracks: the runtime evaluates it untracked, only
 * when the action is called. It builds its URL from `window.location`, which
 * does not exist during SSR, so any backend that evaluated it would fail to
 * render. The value `saved()` is `undefined` until the action is called.
 *
 * `postId` is read only by the request function, so the hydration props must
 * still carry it for the client to build the request.
 */
export const fixture = createFixture({
  id: 'create-mutation-request-client-only',
  description: 'A createMutation request function that reads a signal and a prop is emitted client-side only and never evaluated at SSR',
  source: `
'use client'
import { createMutation, createSignal, http } from '@barefootjs/client'

export function LikeButton(props: { postId: number; label: string }) {
  const [count, setCount] = createSignal(1)
  const [saved, like] = createMutation(
    () => http.post<{ likes: number }>(window.location.origin + '/api/posts/' + props.postId + '/like', { body: { count: count() } }),
  )
  return (
    <section>
      <h2>{props.label}</h2>
      <button onClick={() => { setCount(count() + 1); like() }}>like</button>
      {saved() ? <p>Liked</p> : <p>Not yet</p>}
    </section>
  )
}
`,
  props: { postId: 7, label: 'Post' },
  expectedHtml: `
    <section bf-s="test" bf="s4">
      <h2 bf="s1"><!--bf:s0-->Post<!--/--></h2>
      <button bf="s2">like</button>
      <p bf-c="s3">Not yet</p>
    </section>
  `,
})
