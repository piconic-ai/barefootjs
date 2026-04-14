/**
 * BarefootJS Compiler - Nested loops/conditionals inside mapArray bodies (#830)
 *
 * Verifies that conditionals and loops at depth 2+ inside mapArray callbacks
 * generate insert() and mapArray() calls instead of being statically baked
 * into template HTML.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('nested loops/conditionals inside mapArray (#830)', () => {
  test('Path A: conditional inside conditional emits nested insert()', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      type TreeNode = { id: number; name: string; type: 'file' | 'folder'; expanded: boolean; children: TreeNode[] }

      export function FileBrowser() {
        const [tree, setTree] = createSignal<TreeNode[]>([])

        const toggleExpand = (id: number) => {
          setTree(prev => prev.map(n =>
            n.id === id ? { ...n, expanded: !n.expanded } : n
          ))
        }

        return (
          <div>
            {tree().map(node => (
              <div key={node.id}>
                {node.type === 'folder' ? (
                  <div>
                    <button onClick={() => toggleExpand(node.id)}>{node.name}</button>
                    {node.expanded ? (
                      <div>
                        {node.children.map(child => (
                          <div key={child.id}>{child.name}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div>{node.name}</div>
                )}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'FileBrowser.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Count insert() calls — should have 2:
    // 1. node.type === 'folder' (depth 1)
    // 2. node.expanded (depth 2, nested inside first conditional)
    const insertCount = (js.match(/\binsert\(/g) || []).length
    expect(insertCount).toBeGreaterThanOrEqual(2)

    // Count mapArray() calls — should have 2:
    // 1. tree() (top-level loop)
    // 2. node.children (nested inside expanded conditional)
    const mapArrayCount = (js.match(/\bmapArray\(/g) || []).length
    expect(mapArrayCount).toBeGreaterThanOrEqual(2)
  })

  test('Path B: conditional inside inner loop emits insert() in mapArray callback', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      type Reply = { id: number; text: string }
      type Comment = { id: number; text: string; replies: Reply[] }
      type Post = { id: number; text: string; showComments: boolean; comments: Comment[] }

      export function SocialFeed() {
        const [posts, setPosts] = createSignal<Post[]>([])

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
                        {comment.replies.length > 0 ? (
                          <div>
                            {comment.replies.map(reply => (
                              <div key={reply.id}>{reply.text}</div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSXSync(source, 'SocialFeed.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const js = clientJs!.content

    // Count insert() calls — should have 2:
    // 1. post.showComments (depth 1)
    // 2. comment.replies.length > 0 (depth 3: inside inner loop inside conditional)
    const insertCount = (js.match(/\binsert\(/g) || []).length
    expect(insertCount).toBeGreaterThanOrEqual(2)

    // Count mapArray() calls — should have 3:
    // 1. posts() (top-level loop)
    // 2. post.comments (inside showComments conditional)
    // 3. comment.replies (inside replies.length > 0 conditional)
    const mapArrayCount = (js.match(/\bmapArray\(/g) || []).length
    expect(mapArrayCount).toBeGreaterThanOrEqual(3)
  })

  test('reactive text inside conditional inside inner loop uses re-query pattern (#840)', () => {
    // When a reactive text is inside a conditional branch inside a nested (inner) loop,
    // insert() may replace the SSR element after the text node is captured.
    // The generated code must use the re-query pattern:
    //   createEffect(() => { const [__rt] = $t(...) ... })
    // NOT the capture-then-effect pattern:
    //   { const [__rt] = $t(...); if (__rt) createEffect(() => ...) }
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client-runtime'

      type Child = { id: string; type: 'text' | 'other'; label: string }
      type Group = { id: string; children: Child[] }

      export function App() {
        const [groups, setGroups] = createSignal<Group[]>([])
        return (
          <div>
            {groups().map(group => (
              <div key={group.id}>
                {group.children.map(child => (
                  <div key={child.id}>
                    {child.type === 'text' ? (
                      <label>{child.label}</label>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      }
    `

    const result = compileJSXSync(source, 'App.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // Re-query pattern: $t() inside createEffect so it always finds the live node
    expect(content).toContain('createEffect(() => { const [__rt] = $t(')
  })
})
