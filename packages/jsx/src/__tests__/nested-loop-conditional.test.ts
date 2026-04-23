/**
 * BarefootJS Compiler - Nested loops/conditionals inside mapArray bodies (#830, #839)
 *
 * Verifies that conditionals and loops at depth 2+ inside mapArray callbacks
 * generate insert() and mapArray() calls instead of being statically baked
 * into template HTML. Also verifies that event handlers inside conditional
 * branches are preserved in insert() bindEvents (#839).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('nested loops/conditionals inside mapArray (#830, #839)', () => {
  test('Path A: conditional inside conditional emits nested insert()', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

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
      import { createSignal } from '@barefootjs/client'

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
      import { createSignal } from '@barefootjs/client'

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

  test('event handler inside conditional branch of loop item appears in bindEvents (#839)', () => {
    // When a conditional is inside a mapArray loop item, insert() manages branch switching.
    // Event handlers on elements inside the conditional branches MUST be bound inside
    // insert()'s bindEvents callback — not via delegation on the container — so that
    // the handler is reattached whenever insert() replaces the branch's DOM elements.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      type Row = { id: string; label: string; isGroup: boolean }

      export function ToggleList() {
        const [rows, setRows] = createSignal<Row[]>([])
        const toggle = (id: string) => setRows(prev => prev.map(r => r.id === id ? { ...r, isGroup: !r.isGroup } : r))
        return (
          <ul>
            {rows().map((row) => (
              <li key={row.id}>
                {row.isGroup ? (
                  <button onClick={() => toggle(row.id)}>{row.label}</button>
                ) : (
                  <span>{row.label}</span>
                )}
              </li>
            ))}
          </ul>
        )
      }
    `

    const result = compileJSXSync(source, 'ToggleList.tsx', { adapter })
    expect(result.errors).toHaveLength(0)

    const clientJs = result.files.find(f => f.type === 'clientJs')
    expect(clientJs).toBeDefined()
    const content = clientJs!.content

    // insert() must be generated for the conditional
    expect(content).toContain('insert(')

    // The click handler must appear inside bindEvents, not as a top-level delegation
    // Pattern: addEventListener inside the bindEvents callback (after 'bindEvents: (__branchScope)')
    const bindEventsMatch = content.match(/bindEvents:\s*\(__branchScope\)\s*=>\s*\{([\s\S]*?)\}/m)
    expect(bindEventsMatch).not.toBeNull()
    expect(bindEventsMatch![1]).toContain("addEventListener('click'")

    // Handler must use the loop param accessor pattern: row().id (not row.id)
    expect(content).toContain('toggle(row().id)')

    // Must use qsa() (not scope-aware $()) for element lookup inside loop items,
    // because loop item elements lack bf-s and $() would fail to match
    expect(bindEventsMatch![1]).toContain('qsa(__branchScope')
    expect(bindEventsMatch![1]).not.toContain('$(__branchScope')
  })

  test('child component inside nested conditional is only initialized once (#929)', () => {
    // Regression: The file browser pattern has a Checkbox inside a
    // `child.type === 'folder' ? <folder-branch> : <file-branch>` conditional,
    // itself inside a nested `node.children.map(child => ...)`. Before the fix,
    // `collectConditionalBranchChildComponents` recursed into conditional
    // branches even when collecting the inner loop's direct child components,
    // causing the same Checkbox to be emitted by both the outer ssr path and
    // the insert() bindEvents. The two initChild() calls wired up two click
    // handlers, and two `onCheckedChange` invocations per click cancelled
    // each other out, leaving the nested checkbox visually unresponsive.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Checkbox } from '@ui/components/ui/checkbox'

      type TreeNode = { id: number; name: string; type: 'file' | 'folder'; selected: boolean; children: TreeNode[] }

      export function FileBrowser() {
        const [tree, setTree] = createSignal<TreeNode[]>([])
        const toggle = (id: number) => {
          setTree(prev => prev.map(n => n.id === id ? { ...n, selected: !n.selected } : n))
        }
        return (
          <div>
            {tree().map(node => (
              <div key={node.id}>
                {node.children.map(child => (
                  <div key={child.id}>
                    {child.type === 'folder' ? (
                      <div>
                        <Checkbox checked={child.selected} onCheckedChange={() => toggle(child.id)} />
                        <span>{child.name}</span>
                      </div>
                    ) : (
                      <div>
                        <Checkbox checked={child.selected} onCheckedChange={() => toggle(child.id)} />
                        <span>{child.name}</span>
                      </div>
                    )}
                  </div>
                ))}
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
    const content = clientJs!.content

    // Locate the nested mapArray callback body — the second mapArray in the file
    // is the inner `node.children.map(child => ...)`.
    const mapCalls = content.match(/mapArray\([\s\S]*?\}\)\s*\}/g)
    expect(mapCalls).not.toBeNull()
    expect(mapCalls!.length).toBeGreaterThanOrEqual(2)

    // Pick the inner mapArray. It references `child.id` as the key function.
    const innerMapArray = mapCalls!.find(m => /\(child\)\s*=>\s*String\(child\.id\)/.test(m))
    expect(innerMapArray).toBeDefined()

    // Count initChild('Checkbox', ...) occurrences inside the inner callback,
    // but exclude those inside `bindEvents:` (insert branches), which handle
    // the conditional separately.
    const body = innerMapArray!
    const bindEventsRegions: string[] = []
    const bindEventsRe = /bindEvents:\s*\(__branchScope\)\s*=>\s*\{/g
    let m: RegExpExecArray | null
    while ((m = bindEventsRe.exec(body)) !== null) {
      let depth = 1
      let i = m.index + m[0].length
      const start = i
      while (i < body.length && depth > 0) {
        if (body[i] === '{') depth++
        else if (body[i] === '}') depth--
        i++
      }
      bindEventsRegions.push(body.slice(start, i - 1))
    }
    // Body outside bindEvents: replace each bindEvents region with a marker.
    let outsideBody = body
    for (const region of bindEventsRegions) {
      outsideBody = outsideBody.replace(region, '/*BINDEVENTS*/')
    }
    const outsideInitChildCount = (outsideBody.match(/initChild\('Checkbox'/g) || []).length

    // The outer-level ssr path should NOT emit initChild('Checkbox', ...)
    // for the Checkbox that lives inside the conditional. It is handled by
    // the insert() bindEvents (which runs once per branch activation).
    expect(outsideInitChildCount).toBe(0)
  })
})
