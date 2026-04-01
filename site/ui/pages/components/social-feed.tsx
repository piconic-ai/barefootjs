/**
 * Social Feed Reference Page (/components/social-feed)
 *
 * Block-level composition pattern: deeply nested loops (posts > comments > replies),
 * conditional rendering inside loops, dynamic list updates, and derived state.
 */

import { SocialFeedDemo } from '@/components/social-feed-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo } from '@barefootjs/dom'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

function SocialFeed() {
  const [posts, setPosts] = createSignal([...])

  // Derived state
  const totalLikes = createMemo(() =>
    posts().reduce((sum, p) => sum + p.likes, 0)
  )

  // Deeply nested: posts > comments > replies
  return (
    <div>
      {posts().map(post => (
        <div key={post.id}>
          <p>{post.text}</p>
          {post.showComments ? (
            <div>
              {post.comments.map(comment => (
                <div key={comment.id}>
                  <p>{comment.text}</p>
                  {comment.replies.map(reply => (
                    <div key={reply.id}>{reply.text}</div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}`

export function SocialFeedRefPage() {
  return (
    <DocPage slug="social-feed" toc={tocItems}>
      <PageHeader
        title="Social Feed"
        description="A community feed with threaded comments. Posts, comments, and nested replies form a 3-level hierarchy with interactive state at each level."
      />

      <Section id="preview" title="Preview">
        <Example code={previewCode}>
          <SocialFeedDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
          <li><strong>3-level nesting:</strong> Posts → Comments → Replies, each with its own loop and events</li>
          <li><strong>Conditional in loop:</strong> Comments section toggles per post (showComments)</li>
          <li><strong>Nested conditional:</strong> Reply section shows only when replies exist</li>
          <li><strong>Dynamic list update:</strong> Add comment via Enter key, triggers reconciliation</li>
          <li><strong>Like toggle:</strong> Per-post and per-comment, with immutable state updates</li>
          <li><strong>Derived state:</strong> Total likes and comments via createMemo</li>
        </ul>
      </Section>
    </DocPage>
  )
}
