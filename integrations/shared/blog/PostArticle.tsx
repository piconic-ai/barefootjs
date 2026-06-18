'use client'

import { LikeButton } from './LikeButton'
import { ReadingTimer } from './ReadingTimer'
import { NowPlaying } from './NowPlaying'

interface PostArticleProps {
  slug: string
  title: string
  date: string
  tags: string[]
  body: string[]
  /** 1-based position ("post N of M"). */
  position: number
  total: number
  /** Blog mount path; every link is built relative to it. */
  base: string
  prevSlug?: string
  prevTitle?: string
  nextSlug?: string
  nextTitle?: string
}

/**
 * The post page body — the article chrome that used to be hand-authored per
 * adapter (Hono JSX / Perl heredocs). Extracted into one shared island so every
 * adapter renders the same markup from post data; the interactive widgets
 * (`LikeButton`, `ReadingTimer`, `NowPlaying`) are nested islands.
 *
 * `"use client"` only so `bf build` compiles it into a template (it ships no
 * client state of its own — same reason as `PageShell`). Tag links use a plain
 * `?tag=${t}` (the corpus tags are URL-safe slugs) so the href lowers for SSR on
 * the template-string adapters too, rather than `encodeURIComponent` (a
 * JS-runtime callee they can't lower).
 */
export function PostArticle(props: PostArticleProps) {
  return (
    <article className="post" data-slug={props.slug}>
      <a className="back" href={props.base}>← All posts</a>
      <h1 className="page-title">{props.title}</h1>
      <div className="meta">
        {props.date} · post {props.position} of {props.total} ·{' '}
        {props.tags.map((t) => (
          <a key={t} className="tag-inline" href={`${props.base}?tag=${t}`}>#{t} </a>
        ))}
      </div>
      <div className="islands">
        <LikeButton />
        <ReadingTimer />
      </div>
      {/* v1: docked "Now playing" bar, marked data-bf-permanent inside NowPlaying
          so the router moves the same live node between posts (and index↔post). */}
      <NowPlaying />
      <div className="prose">
        {props.body.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>
      <nav className="pager">
        {props.prevSlug ? (
          <a className="pager-link" href={`${props.base}/posts/${props.prevSlug}`}>← {props.prevTitle}</a>
        ) : (
          <span className="pager-link disabled">← Start</span>
        )}
        {props.nextSlug ? (
          <a className="pager-link next" href={`${props.base}/posts/${props.nextSlug}`}>{props.nextTitle} →</a>
        ) : (
          <a className="pager-link next" href={props.base}>Back to start →</a>
        )}
      </nav>
    </article>
  )
}