/**
 * Recursive Comments Reference Page (/components/recursive-comments)
 *
 * Block-level composition pattern: an unbounded-depth comment thread that
 * exercises self-referential component recursion through the compiler.
 */

import { RecursiveCommentsDemo } from '@/components/recursive-comments-demo'
import {
  DocPage,
  PageHeader,
  Section,
  Example,
  type TocItem,
} from '../../components/shared/docs'
import { getNavLinks } from '../../components/shared/PageNavigation'

const tocItems: TocItem[] = [
  { id: 'preview', title: 'Preview' },
  { id: 'features', title: 'Features' },
]

const previewCode = `"use client"

import { createSignal, createMemo, createContext, useContext } from '@barefootjs/client'

// <CommentNode> renders <CommentNode> directly inside its own JSX.
// The compiler emits a recursive renderChild() call in the SSR
// template and a single hydrate() registration that every depth
// shares.

interface CommentsApi {
  addReply: (parentId: number, text: string) => void
  deleteComment: (id: number) => void
  toggleReaction: (id: number, emoji: string) => void
  // ...
}

const CommentsContext = createContext<CommentsApi>()

function CommentNode(props: { item: Comment; depth: number }) {
  const api = useContext(CommentsContext)!

  // Memos lift props.item.X reads onto the reactive graph.
  // Without them, an inner .map() over a prop compiles as a
  // static-array forEach over the initial snapshot — adds and
  // deletes never reach the DOM because <CommentNode>'s
  // child-prefixed scope short-circuits subsequent initChild calls.
  const replies = createMemo(() => props.item.replies)
  const reactions = createMemo(() => props.item.reactions)

  return (
    <div data-depth={props.depth}>
      <p>{props.item.text}</p>

      {reactions().map(r => (
        <button key={r.emoji} onClick={() => api.toggleReaction(props.item.id, r.emoji)}>
          {r.emoji} {r.count}
        </button>
      ))}

      <ul>
        {replies().map(child => (
          <li key={child.id}>
            <CommentNode item={child} depth={props.depth + 1} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function RecursiveCommentsDemo() {
  const [comments, setComments] = createSignal<Comment[]>(initialComments)

  const api: CommentsApi = {
    addReply: (parentId, text) => setComments(prev => updateById(prev, parentId, c => ({
      ...c,
      replies: [...c.replies, makeComment(text)],
    }))),
    // ...
  }

  return (
    <CommentsContext.Provider value={api}>
      <ul>
        {comments().map(c => (
          <li key={c.id}>
            <CommentNode item={c} depth={0} />
          </li>
        ))}
      </ul>
    </CommentsContext.Provider>
  )
}`

export function RecursiveCommentsRefPage() {
  return (
    <DocPage slug="recursive-comments" toc={tocItems}>
      <div className="space-y-12">
        <PageHeader
          title="Recursive Comments"
          description="Unlimited-depth comment thread where <CommentNode> renders <CommentNode> directly. Tests self-referential component recursion through the compiler, depth-unbounded hydration, and reactive inner-loop reconciliation lifted onto the signal graph via memo wrappers over prop-derived arrays."
          {...getNavLinks('recursive-comments')}
        />

        <Section id="preview" title="Preview">
          <Example title="" code={previewCode}>
            <RecursiveCommentsDemo />
          </Example>
        </Section>

        <Section id="features" title="Features">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Self-Referential Component Recursion
              </h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">CommentNode</code> appears inside its own
                JSX. Phase 1 IR collection treats the call as a sibling reference,
                so no <code className="text-xs">@bf-child</code> import marker is
                emitted. Phase 2 produces a single <code className="text-xs">hydrate()</code>
                registration whose template calls <code className="text-xs">renderChild('CommentNode', ...)</code>
                on every recursion step, exercising depth-unbounded SSR rendering
                and per-instance hydration.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Memo-Lifted Inner Loops at Every Depth
              </h3>
              <p className="text-sm text-muted-foreground">
                Reading <code className="text-xs">props.item.replies</code> directly
                in a <code className="text-xs">.map()</code> source compiles as a
                static-array forEach because the loop-source detector treats props
                as static. Wrapping the access in
                <code className="mx-1 text-xs">createMemo(() =&gt; props.item.replies)</code>
                {' '}lifts it onto the reactive graph so <code className="text-xs">mapArray</code>
                {' '}reconciles adds, removes, and edits at every depth — including
                deeply-nested replies whose ancestor <code className="text-xs">CommentNode</code>{' '}
                short-circuited <code className="text-xs">initChild</code> on its
                first run because of the child-prefixed scope.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Cross-Depth Context Propagation
              </h3>
              <p className="text-sm text-muted-foreground">
                A single <code className="text-xs">CommentsContext.Provider</code>{' '}
                wraps the root list. Action handlers
                (<code className="text-xs">addReply</code>,
                <code className="text-xs"> deleteComment</code>,
                <code className="text-xs"> toggleReaction</code>) reach leaves at
                arbitrary depth without prop-drilling, exercising
                <code className="mx-1 text-xs">useContext</code> resolution through
                an unbounded chain of recursive ancestors.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Per-Node Edit Mode at Every Depth
              </h3>
              <p className="text-sm text-muted-foreground">
                Each comment carries its own <code className="text-xs">editing</code>
                {' '}flag. The conditional swap between view and edit branches reuses
                the same slot regardless of nesting level — the compiler emits one
                <code className="mx-1 text-xs">insert(...)</code>{' '}per slot id, and
                that wiring works identically at depth 0 and depth N because the
                hydrate template is shared by every instance.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium text-foreground mb-2">
                Tree-Wide Derived State
              </h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">totalCount</code>,
                <code className="text-xs"> maxDepth</code>, and
                <code className="text-xs"> totalReactions</code> walk the full tree
                on every signal update. Adding a reply five levels deep updates the
                top-level stat strip without touching intermediate
                <code className="mx-1 text-xs">CommentNode</code>{' '}instances directly.
              </p>
            </div>
          </div>
        </Section>
      </div>
    </DocPage>
  )
}
