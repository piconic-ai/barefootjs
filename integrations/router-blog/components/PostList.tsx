'use client'

import { createMemo } from '@barefootjs/client'
import { searchParams } from '@barefootjs/router/signals'
import { PostListItem } from './PostListItem'

interface Item {
  slug: string
  title: string
  date: string
  tags: string[]
}

type SortKey = 'date' | 'title' | 'tag'

interface PostListProps {
  items: Item[]
  tags: string[]
}

/**
 * The index list. It reads `searchParams()` — a reactive view of the URL
 * query — so `?sort=` / `?tag=` links re-order / filter the list in place,
 * fine-grained, WITH NO outlet swap and no re-hydration. The sort/tag bars'
 * active highlight and hrefs are reactive off the same source, so they stay
 * in sync as the query changes.
 */
export function PostList(props: PostListProps) {
  const params = createMemo(() => {
    const sp = searchParams()
    return { sort: (sp.get('sort') ?? 'date') as SortKey, tag: sp.get('tag') ?? '' }
  })

  const visible = createMemo(() => {
    const { sort, tag } = params()
    const list = props.items.filter((p) => !tag || p.tags.includes(tag))
    const sorted = [...list]
    if (sort === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title))
    else if (sort === 'tag')
      sorted.sort(
        (a, b) => (a.tags[0] ?? '').localeCompare(b.tags[0] ?? '') || b.date.localeCompare(a.date),
      )
    else sorted.sort((a, b) => b.date.localeCompare(a.date))
    return sorted
  })

  const hrefFor = (sort: SortKey, tag: string): string => {
    const u = new URLSearchParams()
    if (sort !== 'date') u.set('sort', sort)
    if (tag) u.set('tag', tag)
    const s = u.toString()
    return s ? `/?${s}` : '/'
  }
  const sortHref = (k: SortKey) => hrefFor(k, params().tag)
  const tagHref = (t: string) => hrefFor(params().sort, t)
  const sortClass = (k: SortKey) => (params().sort === k ? 'sort on' : 'sort')
  const tagClass = (t: string) => (params().tag === t ? 'tag on' : 'tag')

  return (
    <div className="content">
      <h1 className="page-title">Latest posts</h1>
      <p className="lede">
        Sort / filter below — the list updates reactively from <code>searchParams()</code>,{' '}
        <b>with no outlet swap</b>. Pin a post (☆) and re-sort: its state survives.
      </p>
      <div className="controls">
        <span className="ctl-label">sort:</span>
        <a className={sortClass('date')} href={sortHref('date')}>date</a>
        <a className={sortClass('title')} href={sortHref('title')}>title</a>
        <a className={sortClass('tag')} href={sortHref('tag')}>tag</a>
      </div>
      <div className="tags">
        <span className="ctl-label">tag:</span>
        <a className={tagClass('')} href={tagHref('')}>all</a>
        {props.tags.map((t) => (
          <a key={t} className={tagClass(t)} href={tagHref(t)}>#{t}</a>
        ))}
      </div>
      <div className="status">
        {visible().length} / {props.items.length} shown · sort: {params().sort}
        {params().tag ? ` · #${params().tag}` : ''}
      </div>
      <ol className="sortable-list">
        {visible().map((p) => (
          <PostListItem
            key={p.slug}
            slug={p.slug}
            title={p.title}
            date={p.date}
            meta={`${p.date} · ${p.tags.map((t) => `#${t}`).join(' ')}`}
          />
        ))}
      </ol>
    </div>
  )
}
