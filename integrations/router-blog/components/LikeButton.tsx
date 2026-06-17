'use client'

import { createSignal } from '@barefootjs/client'

/**
 * An outlet island: a like counter with purely local state. It is
 * re-created every time the router swaps in a post page, and torn down on
 * the way out. Nothing fancy — it exists so re-hydration after a partial
 * navigation has a real reactive island to bring back to life.
 */
export function LikeButton() {
  const [likes, setLikes] = createSignal(0)
  return (
    <button className="island like" type="button" onClick={() => setLikes((n) => n + 1)}>
      ♥ <span className="v">{likes()}</span>
    </button>
  )
}
