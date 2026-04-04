"use client"
/**
 * CommentsDemo Component
 *
 * Comment thread with inline editing, sorting, reactions, and nested replies.
 * Compiler stress: conditional swap in loop (edit mode toggle), full list
 * reconciliation (sort order change), item removal in nested loops,
 * object state mutation (multi-reaction map), createMemo chains (filtered +
 * sorted view), and event handlers at every nesting level.
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Avatar, AvatarFallback } from '@ui/components/ui/avatar'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Separator } from '@ui/components/ui/separator'
import { Textarea } from '@ui/components/ui/textarea'

type Reaction = { emoji: string; count: number; reacted: boolean }

type Reply = {
  id: number
  author: string
  initials: string
  text: string
  time: string
}

type Comment = {
  id: number
  author: string
  initials: string
  text: string
  time: string
  timestamp: number
  reactions: Reaction[]
  replies: Reply[]
  showReplies: boolean
  editing: boolean
}

type SortMode = 'newest' | 'oldest' | 'popular'

const reactionEmojis = ['👍', '❤️', '😂', '🎉', '🤔']

const initialComments: Comment[] = [
  {
    id: 1, author: 'Alice Chen', initials: 'AC',
    text: 'The new signal-based reactivity model is much cleaner than the previous approach. Fine-grained updates make a huge difference for performance.',
    time: '2h ago', timestamp: Date.now() - 7200000,
    reactions: [
      { emoji: '👍', count: 12, reacted: false },
      { emoji: '❤️', count: 3, reacted: true },
    ],
    replies: [
      { id: 101, author: 'Bob Park', initials: 'BP', text: 'Agreed! The createMemo pattern especially feels natural.', time: '1h ago' },
      { id: 102, author: 'Carol Liu', initials: 'CL', text: 'How does it compare to SolidJS signals?', time: '45m ago' },
    ],
    showReplies: true, editing: false,
  },
  {
    id: 2, author: 'Dave Kim', initials: 'DK',
    text: 'Found an edge case with nested loops inside conditionals — the reconciler loses track of elements when the parent branch toggles. Filing an issue now.',
    time: '5h ago', timestamp: Date.now() - 18000000,
    reactions: [
      { emoji: '🤔', count: 5, reacted: false },
      { emoji: '👍', count: 2, reacted: false },
    ],
    replies: [
      { id: 201, author: 'Alice Chen', initials: 'AC', text: 'Can you share a minimal repro? I hit something similar last week.', time: '4h ago' },
    ],
    showReplies: false, editing: false,
  },
  {
    id: 3, author: 'Eve Zhang', initials: 'EZ',
    text: 'Just shipped a PR using the new composite loop pattern. The template generation handles child components correctly now after the latest fix.',
    time: '1d ago', timestamp: Date.now() - 86400000,
    reactions: [
      { emoji: '🎉', count: 8, reacted: true },
      { emoji: '👍', count: 15, reacted: false },
      { emoji: '❤️', count: 6, reacted: false },
    ],
    replies: [],
    showReplies: false, editing: false,
  },
  {
    id: 4, author: 'Frank Lee', initials: 'FL',
    text: 'Quick question: does createEffect automatically track all signal reads inside it, or do we need to explicitly declare dependencies?',
    time: '3d ago', timestamp: Date.now() - 259200000,
    reactions: [
      { emoji: '👍', count: 1, reacted: false },
    ],
    replies: [
      { id: 401, author: 'Eve Zhang', initials: 'EZ', text: 'It auto-tracks — any signal getter called during execution is registered as a dependency. No dependency array needed.', time: '3d ago' },
      { id: 402, author: 'Alice Chen', initials: 'AC', text: 'One caveat: async code after an await breaks tracking. Keep signal reads synchronous.', time: '2d ago' },
      { id: 403, author: 'Frank Lee', initials: 'FL', text: 'Good to know, thanks both!', time: '2d ago' },
    ],
    showReplies: false, editing: false,
  },
]

let nextCommentId = 100
let nextReplyId = 1000

export function CommentsDemo() {
  const [comments, setComments] = createSignal<Comment[]>(initialComments)
  const [sortMode, setSortMode] = createSignal<SortMode>('newest')
  const [newCommentText, setNewCommentText] = createSignal('')

  // Memo chain stage 1: sort comments
  const sortedComments = createMemo(() => {
    const items = [...comments()]
    const mode = sortMode()
    if (mode === 'newest') return items.sort((a, b) => b.timestamp - a.timestamp)
    if (mode === 'oldest') return items.sort((a, b) => a.timestamp - b.timestamp)
    // popular: sum of all reaction counts
    return items.sort((a, b) => {
      const aTotal = a.reactions.reduce((s, r) => s + r.count, 0)
      const bTotal = b.reactions.reduce((s, r) => s + r.count, 0)
      return bTotal - aTotal
    })
  })

  // Memo chain stage 2: derived stats
  const totalComments = createMemo(() => comments().length)
  const totalReactions = createMemo(() =>
    comments().reduce((sum, c) => sum + c.reactions.reduce((s, r) => s + r.count, 0), 0)
  )
  const totalReplies = createMemo(() =>
    comments().reduce((sum, c) => sum + c.replies.length, 0)
  )

  const addComment = () => {
    const text = newCommentText().trim()
    if (!text) return
    const newComment: Comment = {
      id: nextCommentId++,
      author: 'You',
      initials: 'ME',
      text,
      time: 'just now',
      timestamp: Date.now(),
      reactions: [],
      replies: [],
      showReplies: false,
      editing: false,
    }
    setComments(prev => [newComment, ...prev])
    setNewCommentText('')
  }

  const deleteComment = (commentId: number) => {
    setComments(prev => prev.filter(c => c.id !== commentId))
  }

  const startEditing = (commentId: number) => {
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, editing: true } : c
    ))
  }

  const cancelEditing = (commentId: number) => {
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, editing: false } : c
    ))
  }

  const saveEdit = (commentId: number, textareaEl: HTMLTextAreaElement) => {
    const text = textareaEl.value.trim()
    if (!text) return
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, text, editing: false } : c
    ))
  }

  const toggleReaction = (commentId: number, emoji: string) => {
    setComments(prev => prev.map(c => {
      if (c.id !== commentId) return c
      const existing = c.reactions.find(r => r.emoji === emoji)
      if (existing) {
        const updated = c.reactions.map(r =>
          r.emoji === emoji
            ? { ...r, reacted: !r.reacted, count: r.reacted ? r.count - 1 : r.count + 1 }
            : r
        ).filter(r => r.count > 0)
        return { ...c, reactions: updated }
      }
      return { ...c, reactions: [...c.reactions, { emoji, count: 1, reacted: true }] }
    }))
  }

  const toggleReplies = (commentId: number) => {
    setComments(prev => prev.map(c =>
      c.id === commentId ? { ...c, showReplies: !c.showReplies } : c
    ))
  }

  const addReply = (commentId: number, text: string) => {
    if (!text.trim()) return
    const newReply: Reply = {
      id: nextReplyId++,
      author: 'You',
      initials: 'ME',
      text: text.trim(),
      time: 'just now',
    }
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, replies: [...c.replies, newReply], showReplies: true }
        : c
    ))
  }

  const deleteReply = (commentId: number, replyId: number) => {
    setComments(prev => prev.map(c =>
      c.id === commentId
        ? { ...c, replies: c.replies.filter(r => r.id !== replyId) }
        : c
    ))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalComments()}</span> comments
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalReplies()}</span> replies
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalReactions()}</span> reactions
        </div>
      </div>

      {/* New comment form */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">ME</AvatarFallback>
          </Avatar>
          <Textarea
            placeholder="Write a comment..."
            value={newCommentText()}
            onInput={(e) => setNewCommentText(e.target.value)}
            className="flex-1 min-h-[80px] text-sm"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={addComment} disabled={!newCommentText().trim()}>
            Post Comment
          </Button>
        </div>
      </div>

      {/* Sort controls — triggers full list reconciliation */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort by:</span>
        <Button
          variant={sortMode() === 'newest' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('newest')}
        >
          Newest
        </Button>
        <Button
          variant={sortMode() === 'oldest' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('oldest')}
        >
          Oldest
        </Button>
        <Button
          variant={sortMode() === 'popular' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSortMode('popular')}
        >
          Popular
        </Button>
      </div>

      {/* Comment list — sorted, each with conditional edit mode */}
      {sortedComments().map(comment => (
        <div key={comment.id} className="comment-item rounded-lg border">
          <div className="p-4">
            {/* Comment header */}
            <div className="flex items-start gap-3">
              <Avatar>
                <AvatarFallback>{comment.initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{comment.author}</span>
                    <span className="text-xs text-muted-foreground">{comment.time}</span>
                  </div>
                  {/* Edit/Delete buttons — only for user's own comments or all for demo */}
                  <div className="flex items-center gap-1">
                    {comment.editing ? null : (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => startEditing(comment.id)}>
                        Edit
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => deleteComment(comment.id)}>
                      Delete
                    </Button>
                  </div>
                </div>

                {/* Conditional swap: view mode vs edit mode */}
                {comment.editing ? (
                  <div className="mt-2 space-y-2">
                    <Textarea
                      value={comment.text}
                      className="text-sm min-h-[60px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={(e: MouseEvent) => {
                        const ta = (e.target as HTMLElement).closest('.space-y-2')?.querySelector('textarea') as HTMLTextAreaElement | null
                        if (ta) saveEdit(comment.id, ta)
                      }}>Save</Button>
                      <Button variant="outline" size="sm" onClick={() => cancelEditing(comment.id)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="comment-text mt-1 text-sm leading-relaxed">{comment.text}</p>
                )}

                {/* Reactions — loop of reaction badges with toggle */}
                <div className="flex flex-wrap items-center gap-1 mt-3">
                  {comment.reactions.map(reaction => (
                    <button
                      key={reaction.emoji}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent ${reaction.reacted ? 'border-primary bg-primary/10' : ''}`}
                      onClick={() => toggleReaction(comment.id, reaction.emoji)}
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                  {/* Add reaction buttons — loop of available emojis not yet used */}
                  {reactionEmojis.filter(e => !comment.reactions.some(r => r.emoji === e)).length > 0 ? (
                    <div className="flex items-center gap-0.5 ml-1">
                      {reactionEmojis.filter(e => !comment.reactions.some(r => r.emoji === e)).map(emoji => (
                        <button
                          key={emoji}
                          className="rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent transition-colors opacity-40 hover:opacity-100"
                          onClick={() => toggleReaction(comment.id, emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {/* Reply section */}
          <div className="border-t px-4 py-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => toggleReplies(comment.id)}
            >
              {comment.showReplies ? 'Hide' : 'Show'} replies ({comment.replies.length})
            </button>
          </div>

          {/* Replies — conditional section with nested loop */}
          {comment.showReplies ? (
            <div className="border-t bg-muted/30 p-4 space-y-3">
              {comment.replies.map(reply => (
                <div key={reply.id} className="reply-item flex items-start gap-2">
                  <Avatar className="size-7">
                    <AvatarFallback className="text-xs">{reply.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-lg bg-background p-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{reply.author}</span>
                          <span className="text-[10px] text-muted-foreground">{reply.time}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1 text-[10px] text-muted-foreground hover:text-destructive"
                          onClick={() => deleteReply(comment.id, reply.id)}
                        >
                          Delete
                        </Button>
                      </div>
                      <p className="reply-text text-sm mt-1">{reply.text}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Reply input */}
              <div className="flex items-center gap-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">ME</AvatarFallback>
                </Avatar>
                <Input
                  placeholder="Write a reply..."
                  className="flex-1 h-8 text-sm"
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement
                      addReply(comment.id, input.value)
                      input.value = ''
                    }
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {/* Empty state — conditional when all deleted */}
      {comments().length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground">
          <p className="text-lg font-medium">No comments yet</p>
          <p className="text-sm mt-1">Be the first to share your thoughts.</p>
        </div>
      ) : null}
    </div>
  )
}
