"use client"
/**
 * SocialFeedDemo Component
 *
 * Social media feed block with posts, comments, and replies.
 * Compiler stress: deeply nested component composition (Feed > Post > Comments > Reply),
 * conditional rendering inside loops (liked/unliked, expanded/collapsed comments),
 * dynamic list updates (add comment → reconciliation), derived state (counts),
 * loop-in-loop with events (replies inside comments inside posts).
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Avatar, AvatarFallback } from '@ui/components/ui/avatar'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Input } from '@ui/components/ui/input'
import { Separator } from '@ui/components/ui/separator'

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
  likes: number
  liked: boolean
  replies: Reply[]
}

type Post = {
  id: number
  author: string
  initials: string
  role: string
  text: string
  time: string
  likes: number
  liked: boolean
  comments: Comment[]
  showComments: boolean
}

const initialPosts: Post[] = [
  {
    id: 1, author: 'Alice Chen', initials: 'AC', role: 'Engineer',
    text: 'Just shipped a new compiler optimization — 25% smaller runtime queries! The key insight was that parent scope IDs were already embedded in child scope IDs, we just were not using them.',
    time: '2h ago', likes: 12, liked: false, showComments: true,
    comments: [
      {
        id: 101, author: 'Bob Park', initials: 'BP',
        text: 'Nice work! Does this affect hydration performance too?', time: '1h ago',
        likes: 3, liked: false,
        replies: [
          { id: 1001, author: 'Alice Chen', initials: 'AC', text: 'Yes, fewer DOM queries during hydration.', time: '45m ago' },
        ],
      },
      {
        id: 102, author: 'Carol Liu', initials: 'CL',
        text: 'The before/after diff is impressive. Clean refactoring.', time: '30m ago',
        likes: 5, liked: true, replies: [],
      },
    ],
  },
  {
    id: 2, author: 'Dave Kim', initials: 'DK', role: 'Designer',
    text: 'Working on the new component library docs. Dark mode support is tricky with CSS layers — anyone have tips on UnoCSS @layer ordering?',
    time: '5h ago', likes: 8, liked: true, showComments: false,
    comments: [
      {
        id: 201, author: 'Eve Wang', initials: 'EW',
        text: 'Check if your preflights use border: 0 solid — that shorthand resets border-color!', time: '4h ago',
        likes: 7, liked: false, replies: [],
      },
    ],
  },
  {
    id: 3, author: 'Frank Lee', initials: 'FL', role: 'PM',
    text: 'Sprint retrospective: 13 PRs merged this cycle covering compiler refactoring, CSS fixes, and contract tests. Great teamwork everyone!',
    time: '1d ago', likes: 24, liked: false, showComments: false,
    comments: [],
  },
]

let nextCommentId = 300
let nextReplyId = 2000

export function SocialFeedDemo() {
  const [posts, setPosts] = createSignal<Post[]>(initialPosts)

  const totalLikes = createMemo(() =>
    posts().reduce((sum, p) => sum + p.likes, 0)
  )

  const totalComments = createMemo(() =>
    posts().reduce((sum, p) => sum + p.comments.length, 0)
  )

  const toggleLike = (postId: number) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 }
        : p
    ))
  }

  const toggleComments = (postId: number) => {
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, showComments: !p.showComments } : p
    ))
  }

  const addComment = (postId: number, text: string) => {
    if (!text.trim()) return
    const newComment: Comment = {
      id: nextCommentId++,
      author: 'You',
      initials: 'ME',
      text: text.trim(),
      time: 'just now',
      likes: 0,
      liked: false,
      replies: [],
    }
    setPosts(prev => prev.map(p =>
      p.id === postId ? { ...p, comments: [...p.comments, newComment], showComments: true } : p
    ))
  }

  const toggleCommentLike = (postId: number, commentId: number) => {
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? {
            ...p,
            comments: p.comments.map(c =>
              c.id === commentId
                ? { ...c, liked: !c.liked, likes: c.liked ? c.likes - 1 : c.likes + 1 }
                : c
            ),
          }
        : p
    ))
  }

  const addReply = (postId: number, commentId: number, text: string) => {
    if (!text.trim()) return
    const newReply: Reply = {
      id: nextReplyId++,
      author: 'You',
      initials: 'ME',
      text: text.trim(),
      time: 'just now',
    }
    setPosts(prev => prev.map(p =>
      p.id === postId
        ? {
            ...p,
            comments: p.comments.map(c =>
              c.id === commentId
                ? { ...c, replies: [...c.replies, newReply] }
                : c
            ),
          }
        : p
    ))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Stats bar */}
      <div className="flex items-center gap-4 rounded-lg border p-4">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{posts().length}</span> posts
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalLikes()}</span> likes
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalComments()}</span> comments
        </div>
      </div>

      {/* Post list — no wrapper needed: bf-loop markers protect siblings */}
      {posts().map(post => (
        <div key={post.id} className="rounded-lg border">
          {/* Post header */}
          <div className="flex items-start gap-3 p-4">
            <Avatar>
              <AvatarFallback>{post.initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{post.author}</span>
                <Badge variant="secondary" className="text-xs">{post.role}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{post.time}</p>
            </div>
          </div>

          {/* Post body */}
          <div className="px-4 pb-3">
            <p className="text-sm leading-relaxed">{post.text}</p>
          </div>

          {/* Post actions */}
          <div className="flex items-center gap-1 border-t px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              className={post.liked ? 'text-red-500' : ''}
              onClick={() => toggleLike(post.id)}
            >
              {post.liked ? '♥' : '♡'} {post.likes}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleComments(post.id)}
            >
              💬 {post.comments.length}
            </Button>
          </div>

          {/* Comments section (conditional) */}
          {post.showComments ? (
            <div className="border-t bg-muted/30 p-4 space-y-3">
              {/* Comment list — loop inside conditional inside loop */}
              {post.comments.map(comment => (
                <div key={comment.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-xs">{comment.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="rounded-lg bg-background p-2">
                        <span className="text-xs font-semibold">{comment.author}</span>
                        <p className="text-sm">{comment.text}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => toggleCommentLike(post.id, comment.id)}
                        >
                          {comment.liked ? '♥' : '♡'} {comment.likes}
                        </button>
                        <span className="text-xs text-muted-foreground">{comment.time}</span>
                      </div>

                      {/* Replies — third nesting level: post > comment > reply */}
                      {comment.replies.length > 0 ? (
                        <div className="ml-4 mt-2 space-y-2">
                          {comment.replies.map(reply => (
                            <div key={reply.id} className="flex items-start gap-2">
                              <Avatar className="size-6">
                                <AvatarFallback className="text-[10px]">{reply.initials}</AvatarFallback>
                              </Avatar>
                              <div className="rounded-lg bg-muted p-2 flex-1">
                                <span className="text-xs font-semibold">{reply.author}</span>
                                <p className="text-xs">{reply.text}</p>
                                <span className="text-[10px] text-muted-foreground">{reply.time}</span>
                              </div>
                            </div>
                          ))}
                          {/* Reply input — event inside 3rd-level loop */}
                          <div className="flex items-center gap-1">
                            <Input
                              placeholder="Reply..."
                              className="flex-1 h-6 text-xs"
                              onKeyDown={(e: KeyboardEvent) => {
                                if (e.key === 'Enter') {
                                  const input = e.target as HTMLInputElement
                                  addReply(post.id, comment.id, input.value)
                                  input.value = ''
                                }
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add comment input */}
              <div className="flex items-center gap-2 pt-2">
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs">ME</AvatarFallback>
                </Avatar>
                <Input
                  placeholder="Write a comment..."
                  className="flex-1 h-8 text-sm"
                  onKeyDown={(e: KeyboardEvent) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement
                      addComment(post.id, input.value)
                      input.value = ''
                    }
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}
