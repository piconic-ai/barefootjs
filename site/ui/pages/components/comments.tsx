/**
 * Comments Reference Page (/components/comments)
 *
 * Block-level composition: inline editing (conditional swap in loop),
 * sorting (full reconciliation), nested replies, reactions, and deletion.
 */

import { CommentsDemo } from '@/components/comments-demo'
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
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

function Comments() {
  const [comments, setComments] = createSignal([...])
  const [sortMode, setSortMode] = createSignal('newest')

  // Memo chain: sorted view + derived stats
  const sortedComments = createMemo(() => {
    const items = [...comments()]
    if (sortMode() === 'newest') return items.sort(...)
    return items.sort(...)
  })
  const totalReactions = createMemo(() =>
    comments().reduce((sum, c) => sum + c.reactions.length, 0)
  )

  return (
    <div>
      {/* Sort controls — full list reconciliation */}
      <div>
        <Button onClick={() => setSortMode('newest')}>Newest</Button>
        <Button onClick={() => setSortMode('popular')}>Popular</Button>
      </div>

      {sortedComments().map(comment => (
        <div key={comment.id}>
          {/* Conditional swap: edit mode vs view mode */}
          {comment.editing ? (
            <Textarea value={comment.text} />
          ) : (
            <p>{comment.text}</p>
          )}

          {/* Reactions — nested loop with toggle */}
          {comment.reactions.map(r => (
            <button key={r.emoji}>{r.emoji} {r.count}</button>
          ))}

          {/* Replies — conditional section with loop */}
          {comment.showReplies ? (
            <div>
              {comment.replies.map(reply => (
                <div key={reply.id}>{reply.text}</div>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}`

export function CommentsRefPage() {
  return (
    <DocPage slug="comments" toc={tocItems}>
      <PageHeader
        title="Comments"
        description="A comment thread with inline editing, sorting, nested replies, and emoji reactions. Exercises conditional swap in loops, full-list reconciliation on sort change, and multi-level event handling."
      />

      <Section id="preview" title="Preview">
        <Example code={previewCode}>
          <CommentsDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
          <li><strong>Inline editing:</strong> Conditional swap (view → textarea) inside a loop item, testing conditional-in-loop reconciliation</li>
          <li><strong>Sort toggle:</strong> Newest / Oldest / Popular re-orders the entire list, triggering full reconciliation with key-based diffing</li>
          <li><strong>Reactions:</strong> Per-comment emoji reactions with toggle — nested loop of reaction badges, dynamic add/remove</li>
          <li><strong>Nested replies:</strong> Expandable reply thread per comment (conditional section with inner loop)</li>
          <li><strong>Delete at every level:</strong> Remove comments and replies, exercising loop item removal reconciliation</li>
          <li><strong>Derived stats:</strong> Total comments, replies, and reactions via createMemo chain</li>
          <li><strong>Empty state:</strong> Conditional rendering when all comments are deleted</li>
        </ul>
      </Section>
    </DocPage>
  )
}
