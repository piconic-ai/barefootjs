/**
 * Compiler-unit regression pin for #2705 (fixed).
 *
 * A loop nested inside a loop-row conditional's branch, behind a wrapper
 * element the branch's own IR subtree never sees (`<article>{cond &&
 * items.map(...)}</article>`), gets no `containerSlotId` of its own
 * (`collectInnerLoops`'s branch walk in ir-to-client-js/collect-elements.ts
 * never observes an ancestor outside the branch). `buildBranchInnerLoopsPlan`
 * (control-flow/plan/build-loop-child-arm.ts) must fall back to
 * `findCondContainer(__branchScope, '<condSlotId>')` — NOT the raw
 * `__branchScope` (the whole conditional's bind scope, several elements
 * wider than the loop's actual container; the pre-fix behavior that caused
 * the runtime defect in issue-2705-nested-loop-branch-container-slot.test.ts).
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('#2705 — branch inner-loop container fallback', () => {
  test('inner loop behind a wrapped loop-row `&&` conditional resolves its container via findCondContainer', () => {
    const source = `
      "use client";
      import { createSignal } from '@barefootjs/client'
      type Item = { id: string; label: string }
      type Group = { id: string; show: boolean; items: Item[] }
      export function Repro() {
        const [groups] = createSignal<Group[]>([])
        return (
          <div>
            {groups().map((group) => (
              <div key={group.id}>
                <article>
                  Group
                  {group.show &&
                    group.items.map((item) => (
                      <section key={item.id}>{item.label}</section>
                    ))}
                </article>
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'Repro.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const content = result.files.find(f => f.type === 'clientJs')!.content

    // The conditional's own slot id feeds `findCondContainer` — never a raw
    // `__branchScope` container for this inner mapArray.
    expect(content).toMatch(/const __bic\w+ = findCondContainer\(__branchScope, '(s\d+)'\)/)
    expect(content).not.toMatch(/const __bic\w+ = __branchScope\s*$/m)
    expect(content).toContain('findCondContainer')
  })

  test('an existing (non-null containerSlotId) inner-loop container is unaffected', () => {
    // Control: a loop DIRECTLY inside a component whose own element carries
    // a slot id continues to resolve via the qsa/bf-h fallback chain, not
    // `findCondContainer` — the fix only changes the previously-null path.
    const source = `
      "use client";
      import { createSignal } from '@barefootjs/client'
      type TreeNode = { id: number; name: string; type: 'file' | 'folder'; expanded: boolean; children: TreeNode[] }
      export function FileBrowser() {
        const [tree] = createSignal<TreeNode[]>([])
        return (
          <div>
            {tree().map(node => (
              <div key={node.id}>
                {node.expanded ? (
                  <div>
                    {node.children.map(child => (
                      <div key={child.id}>{child.name}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )
      }
    `
    const result = compileJSX(source, 'FileBrowser.tsx', { adapter })
    expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
    const content = result.files.find(f => f.type === 'clientJs')!.content
    expect(content).not.toContain('findCondContainer')
    expect(content).toMatch(/\.querySelector\('\[bf="s\d+"\]'\)/)
  })
})
