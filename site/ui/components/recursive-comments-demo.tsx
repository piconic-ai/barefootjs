"use client"
/**
 * RecursiveCommentsDemo
 *
 * Unlimited-depth comment thread. Each <CommentNode> renders its own
 * replies as <CommentNode> instances, exercising self-referential
 * recursion through the compiler.
 *
 * Compiler stress targets:
 * - Self-referential component recursion: <CommentNode> appears inside
 *   its own JSX. Phase 1 IR collection must include the component as a
 *   sibling reference, Phase 2 must emit a recursive renderChild() call
 *   in the SSR template, and the registered hydrate() init must wire
 *   each instance independently for unbounded depth.
 * - Reactive inner loop driven by a memo over a prop:
 *   `createMemo(() => props.item.replies)` is the documented pattern that
 *   converts an otherwise-static `props.X.map()` source into a
 *   mapArray-reconciled loop. Adds, deletes, and edits to deeply-nested
 *   replies must propagate through every depth without losing keys.
 * - Cross-depth context propagation: a single CommentsContext provider
 *   wraps the root list. useContext() must resolve through arbitrarily
 *   many <CommentNode> ancestors so leaf nodes can call addReply,
 *   deleteComment, etc. without prop-drilling.
 * - Per-node controlled-input edit mode at every depth: each comment
 *   has its own editing flag, and the conditional swap (view vs edit)
 *   reuses the same slot regardless of nesting level.
 * - Tree-wide derived state: depth, count, and reaction-total memos
 *   walk the entire tree on every signal update.
 */

import { createSignal, createMemo, createContext, useContext } from '@barefootjs/client'
import { Avatar, AvatarFallback } from '@ui/components/ui/avatar'
import { Button } from '@ui/components/ui/button'
import { Separator } from '@ui/components/ui/separator'
import { Textarea } from '@ui/components/ui/textarea'

type Reaction = { emoji: string; count: number; reacted: boolean }

type Comment = {
  id: number
  author: string
  initials: string
  text: string
  time: string
  timestamp: number
  reactions: Reaction[]
  replies: Comment[]
  collapsed: boolean
  editing: boolean
  showReplyForm: boolean
}

const reactionEmojis = ['👍', '❤️', '🎉']

const initialComments: Comment[] = [
  {
    id: 1,
    author: 'Alice Chen',
    initials: 'AC',
    text: 'Self-referential recursion finally compiles to a clean mapArray at every depth — long-standing limitation of the old codegen.',
    time: '3h ago',
    timestamp: Date.now() - 10800000,
    reactions: [
      { emoji: '👍', count: 8, reacted: true },
      { emoji: '🎉', count: 2, reacted: false },
    ],
    replies: [
      {
        id: 11,
        author: 'Bob Park',
        initials: 'BP',
        text: 'Was the memo wrapper around props.item.replies the trick?',
        time: '2h ago',
        timestamp: Date.now() - 7200000,
        reactions: [{ emoji: '👍', count: 3, reacted: false }],
        replies: [
          {
            id: 111,
            author: 'Alice Chen',
            initials: 'AC',
            text: 'Right — props are static at the loop-source level, but a memo lifts it onto the reactive graph.',
            time: '1h ago',
            timestamp: Date.now() - 3600000,
            reactions: [{ emoji: '❤️', count: 4, reacted: true }],
            replies: [
              {
                id: 1111,
                author: 'Carol Liu',
                initials: 'CL',
                text: 'And context here means we never have to drill addReply into every CommentNode.',
                time: '40m ago',
                timestamp: Date.now() - 2400000,
                reactions: [],
                replies: [
                  {
                    id: 11111,
                    author: 'Dave Kim',
                    initials: 'DK',
                    text: 'Five levels deep — the reconciler still keys correctly when I edit this one.',
                    time: '20m ago',
                    timestamp: Date.now() - 1200000,
                    reactions: [{ emoji: '👍', count: 1, reacted: false }],
                    replies: [],
                    collapsed: false,
                    editing: false,
                    showReplyForm: false,
                  },
                ],
                collapsed: false,
                editing: false,
                showReplyForm: false,
              },
            ],
            collapsed: false,
            editing: false,
            showReplyForm: false,
          },
        ],
        collapsed: false,
        editing: false,
        showReplyForm: false,
      },
      {
        id: 12,
        author: 'Eve Zhang',
        initials: 'EZ',
        text: 'Does deletion at depth N rebalance keys above? Tried it on the old version and watched a sibling unmount its inputs.',
        time: '90m ago',
        timestamp: Date.now() - 5400000,
        reactions: [],
        replies: [],
        collapsed: false,
        editing: false,
        showReplyForm: false,
      },
    ],
    collapsed: false,
    editing: false,
    showReplyForm: false,
  },
  {
    id: 2,
    author: 'Frank Lee',
    initials: 'FL',
    text: 'Quick repro request: collapse a node that has unsaved edit text in a descendant, then expand. Where does the text go?',
    time: '6h ago',
    timestamp: Date.now() - 21600000,
    reactions: [{ emoji: '🤔', count: 2, reacted: false }],
    replies: [
      {
        id: 21,
        author: 'Alice Chen',
        initials: 'AC',
        text: 'Edit state lives on the comment node itself, so collapsing keeps the textarea mounted under the visibility branch.',
        time: '5h ago',
        timestamp: Date.now() - 18000000,
        reactions: [],
        replies: [],
        collapsed: false,
        editing: false,
        showReplyForm: false,
      },
    ],
    collapsed: false,
    editing: false,
    showReplyForm: false,
  },
]

let nextId = 1000

interface CommentsApi {
  addReply: (parentId: number, text: string) => void
  deleteComment: (id: number) => void
  saveEdit: (id: number, text: string) => void
  startEditing: (id: number) => void
  cancelEditing: (id: number) => void
  toggleCollapsed: (id: number) => void
  toggleReplyForm: (id: number) => void
  toggleReaction: (id: number, emoji: string) => void
}

const CommentsContext = createContext<CommentsApi>()

function countAll(nodes: Comment[]): number {
  let n = 0
  for (const c of nodes) {
    n += 1 + countAll(c.replies)
  }
  return n
}

function maxDepthOf(nodes: Comment[], current = 0): number {
  if (nodes.length === 0) return current
  let best = current
  for (const c of nodes) {
    const d = maxDepthOf(c.replies, current + 1)
    if (d > best) best = d
  }
  return best
}

function totalReactions(nodes: Comment[]): number {
  let n = 0
  for (const c of nodes) {
    for (const r of c.reactions) n += r.count
    n += totalReactions(c.replies)
  }
  return n
}

function CommentNode(props: { item: Comment; depth: number }) {
  const api = useContext(CommentsContext)!
  // Memos lift `props.item.X` reads onto the reactive graph. Without them,
  // inner `.map()` calls compile as static-array forEach over the initial
  // snapshot — adds/removes never reach the DOM because <CommentNode>'s
  // child-prefixed scope means initChild short-circuits on subsequent
  // reconciles.
  const replies = createMemo(() => props.item.replies)
  const reactions = createMemo(() => props.item.reactions)
  const availableEmojis = createMemo(() =>
    reactionEmojis.filter(e => !reactions().some(r => r.emoji === e)),
  )
  const replyCount = createMemo(() => props.item.replies.length)
  const isCollapsed = createMemo(() => props.item.collapsed)
  const isEditing = createMemo(() => props.item.editing)
  const showsReplyForm = createMemo(() => props.item.showReplyForm)
  const ringClass = createMemo(() => props.depth >= 4 ? 'ring-1 ring-primary/30' : '')

  return (
    <div
      className={`comment-node rounded-lg border bg-card ${ringClass()}`}
      data-comment-id={props.item.id}
      data-depth={props.depth}
    >
      <div className="p-3">
        <div className="flex items-start gap-3">
          <Avatar className="size-8 shrink-0">
            <AvatarFallback className="text-xs">{props.item.initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="comment-author font-semibold">{props.item.author}</span>
                <span className="text-xs text-muted-foreground">{props.item.time}</span>
                <span className="comment-depth-badge text-[10px] uppercase tracking-wide text-muted-foreground">
                  depth {props.depth}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {isEditing() ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="comment-edit-btn h-7 px-2 text-xs"
                    onClick={() => api.startEditing(props.item.id)}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="comment-delete-btn h-7 px-2 text-xs text-destructive"
                  onClick={() => api.deleteComment(props.item.id)}
                >
                  Delete
                </Button>
              </div>
            </div>

            {isEditing() ? (
              <div className="comment-edit-shell mt-2 space-y-2">
                <Textarea
                  className="comment-edit-textarea min-h-[60px] text-sm"
                  value={props.item.text}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="comment-save-btn"
                    onClick={(e: MouseEvent) => {
                      const shell = (e.target as HTMLElement).closest('.comment-edit-shell')
                      const ta = shell?.querySelector('textarea') as HTMLTextAreaElement | null
                      if (ta) api.saveEdit(props.item.id, ta.value)
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="comment-cancel-btn"
                    onClick={() => api.cancelEditing(props.item.id)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <p className="comment-text mt-1 text-sm leading-relaxed">{props.item.text}</p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1">
              {reactions().map(reaction => (
                <button
                  key={reaction.emoji}
                  className={`comment-reaction inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-accent ${reaction.reacted ? 'border-primary bg-primary/10' : ''}`}
                  onClick={() => api.toggleReaction(props.item.id, reaction.emoji)}
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
              {availableEmojis().map(emoji => (
                <button
                  key={emoji}
                  className="comment-add-reaction rounded-full px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent opacity-50 hover:opacity-100"
                  onClick={() => api.toggleReaction(props.item.id, emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <button
                className="comment-toggle-form hover:text-foreground"
                onClick={() => api.toggleReplyForm(props.item.id)}
              >
                {showsReplyForm() ? 'Cancel reply' : 'Reply'}
              </button>
              <button
                className="comment-toggle-collapsed hover:text-foreground"
                onClick={() => api.toggleCollapsed(props.item.id)}
              >
                {isCollapsed() ? `Show ${replyCount()} replies` : 'Hide replies'}
              </button>
            </div>

            {showsReplyForm() ? (
              <div className="comment-reply-shell mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
                <Textarea
                  className="comment-reply-textarea min-h-[50px] text-xs"
                  placeholder="Write a reply..."
                />
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    className="comment-post-reply-btn"
                    onClick={(e: MouseEvent) => {
                      const shell = (e.target as HTMLElement).closest('.comment-reply-shell')
                      const ta = shell?.querySelector('textarea') as HTMLTextAreaElement | null
                      if (ta) {
                        api.addReply(props.item.id, ta.value)
                      }
                    }}
                  >
                    Post
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isCollapsed() ? null : (
        <div className="comment-children border-t bg-muted/10 px-3 pb-3 pt-2">
          {replyCount() === 0 ? (
            <p className="comment-children-empty text-[11px] text-muted-foreground">No replies yet.</p>
          ) : (
            <ul className="space-y-2">
              {replies().map(child => (
                <li key={child.id}>
                  <CommentNode item={child} depth={props.depth + 1} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function RecursiveCommentsDemo() {
  const [comments, setComments] = createSignal<Comment[]>(initialComments)
  const [newCommentText, setNewCommentText] = createSignal('')

  const totalCount = createMemo(() => countAll(comments()))
  const maxDepth = createMemo(() => maxDepthOf(comments()))
  const totalReactionsCount = createMemo(() => totalReactions(comments()))

  const updateById = (
    nodes: Comment[],
    id: number,
    updater: (n: Comment) => Comment,
  ): Comment[] => {
    return nodes.map(n => {
      if (n.id === id) return updater(n)
      if (n.replies.length > 0) {
        const replies = updateById(n.replies, id, updater)
        if (replies !== n.replies) return { ...n, replies }
      }
      return n
    })
  }

  const removeById = (nodes: Comment[], id: number): Comment[] => {
    const next: Comment[] = []
    let changed = false
    for (const n of nodes) {
      if (n.id === id) {
        changed = true
        continue
      }
      const replies = removeById(n.replies, id)
      if (replies !== n.replies) {
        next.push({ ...n, replies })
        changed = true
      } else {
        next.push(n)
      }
    }
    return changed ? next : nodes
  }

  const makeComment = (text: string): Comment => ({
    id: nextId++,
    author: 'You',
    initials: 'ME',
    text,
    time: 'just now',
    timestamp: Date.now(),
    reactions: [],
    replies: [],
    collapsed: false,
    editing: false,
    showReplyForm: false,
  })

  const api: CommentsApi = {
    addReply: (parentId, text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setComments(prev =>
        updateById(prev, parentId, c => ({
          ...c,
          replies: [...c.replies, makeComment(trimmed)],
          collapsed: false,
          showReplyForm: false,
        })),
      )
    },
    deleteComment: id => {
      setComments(prev => removeById(prev, id))
    },
    saveEdit: (id, text) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setComments(prev => updateById(prev, id, c => ({ ...c, text: trimmed, editing: false })))
    },
    startEditing: id => {
      setComments(prev => updateById(prev, id, c => ({ ...c, editing: true })))
    },
    cancelEditing: id => {
      setComments(prev => updateById(prev, id, c => ({ ...c, editing: false })))
    },
    toggleCollapsed: id => {
      setComments(prev => updateById(prev, id, c => ({ ...c, collapsed: !c.collapsed })))
    },
    toggleReplyForm: id => {
      setComments(prev => updateById(prev, id, c => ({ ...c, showReplyForm: !c.showReplyForm })))
    },
    toggleReaction: (id, emoji) => {
      setComments(prev =>
        updateById(prev, id, c => {
          const existing = c.reactions.find(r => r.emoji === emoji)
          if (existing) {
            const reactions = c.reactions
              .map(r =>
                r.emoji === emoji
                  ? { ...r, reacted: !r.reacted, count: r.reacted ? r.count - 1 : r.count + 1 }
                  : r,
              )
              .filter(r => r.count > 0)
            return { ...c, reactions }
          }
          return { ...c, reactions: [...c.reactions, { emoji, count: 1, reacted: true }] }
        }),
      )
    },
  }

  const addRoot = () => {
    const text = newCommentText().trim()
    if (!text) return
    setComments(prev => [makeComment(text), ...prev])
    setNewCommentText('')
  }

  return (
    <CommentsContext.Provider value={api}>
      <div className="recursive-comments mx-auto max-w-2xl space-y-4">
        <div className="recursive-comments-stats flex items-center gap-4 rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">
            <span className="recursive-comments-total font-semibold text-foreground">
              {totalCount()}
            </span>{' '}
            comments
          </div>
          <Separator orientation="vertical" decorative className="h-4" />
          <div className="text-sm text-muted-foreground">
            <span className="recursive-comments-max-depth font-semibold text-foreground">
              {maxDepth()}
            </span>{' '}
            max depth
          </div>
          <Separator orientation="vertical" decorative className="h-4" />
          <div className="text-sm text-muted-foreground">
            <span className="recursive-comments-reactions font-semibold text-foreground">
              {totalReactionsCount()}
            </span>{' '}
            reactions
          </div>
        </div>

        <div className="recursive-comments-form rounded-lg border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">ME</AvatarFallback>
            </Avatar>
            <Textarea
              className="recursive-comments-input flex-1 min-h-[80px] text-sm"
              placeholder="Start a new top-level thread..."
              value={newCommentText()}
              onInput={(e: Event) => setNewCommentText((e.target as HTMLTextAreaElement).value)}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="recursive-comments-post"
              onClick={addRoot}
              disabled={!newCommentText().trim()}
            >
              Post Comment
            </Button>
          </div>
        </div>

        {/*
         * Keep the root <ul> outside the conditional. A loop nested inside a
         * conditional gets wired by the conditional's `insert()` body, which
         * runs synchronously before the surrounding `provideContext()` later
         * in the init. New CommentNode components created by the inner
         * mapArray then capture an undefined api from useContext, breaking
         * delegated reactions/edits/replies. Filing this as a follow-up
         * compiler bug; the layout below is the "loop-outside-conditional"
         * workaround that lets context propagate before children mount.
         */}
        <ul className="recursive-comments-roots space-y-3">
          {comments().map(c => (
            <li key={c.id}>
              <CommentNode item={c} depth={0} />
            </li>
          ))}
        </ul>

        {totalCount() === 0 ? (
          <div className="recursive-comments-empty rounded-lg border p-8 text-center text-muted-foreground">
            <p className="text-lg font-medium">No comments yet</p>
            <p className="text-sm mt-1">Start the thread above.</p>
          </div>
        ) : null}
      </div>
    </CommentsContext.Provider>
  )
}
