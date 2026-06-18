'use client'

import { createSignal } from '@barefootjs/client'

interface PostListItemProps {
  slug: string
  title: string
  date: string
  meta: string
}

/**
 * One row of the index list, with a local "pin" toggle. Because each item is
 * its own keyed island, re-sorting the list (a `searchParams()` change) moves
 * the DOM node via keyed reconciliation and the pin state rides along — proof
 * that a URL-driven re-order does not reset island state.
 */
export function PostListItem(props: PostListItemProps) {
  const [pinned, setPinned] = createSignal(false)
  return (
    <li className={pinned() ? 'pinned' : ''}>
      <button className="pin" type="button" aria-label="pin" onClick={() => setPinned(!pinned())}>
        {pinned() ? '★' : '☆'}
      </button>
      <a className="item-link" href={`/posts/${props.slug}`}>{props.title}</a>
      <span className="item-meta">{props.meta}</span>
    </li>
  )
}
