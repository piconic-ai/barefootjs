/**
 * File Browser Reference Page (/components/file-browser)
 *
 * Tree-structured file browser with expand/collapse, selection, and CRUD.
 */

import { FileBrowserDemo } from '@/components/file-browser-demo'
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
import { Checkbox } from '@/components/ui/checkbox'

type TreeNode = FileItem | FolderItem

function FileBrowser() {
  const [tree, setTree] = createSignal<TreeNode[]>([...])

  // Recursive update helper
  const updateNode = (nodes, id, updater) =>
    nodes.map(n => n.id === id ? updater(n) :
      n.type === 'folder' ? { ...n, children: updateNode(n.children, id, updater) } : n)

  // 3-level tree: root → folders → files
  return (
    <div>
      {tree().map(node => (
        <div key={node.id}>
          {node.type === 'folder' ? (
            <div>
              <button onClick={() => toggleExpand(node.id)}>
                {node.name}
              </button>
              {node.expanded ? (
                <div>{node.children.map(child => (...))}</div>
              ) : null}
            </div>
          ) : (
            <div><Checkbox />{node.name}</div>
          )}
        </div>
      ))}
    </div>
  )
}`

export function FileBrowserRefPage() {
  return (
    <DocPage slug="file-browser" toc={tocItems}>
      <PageHeader
        title="File Browser"
        description="A tree-structured file browser with folder expand/collapse, multi-select, and file creation. Demonstrates nested conditional rendering inside loops."
      />

      <Section id="preview" title="Preview">
        <Example code={previewCode}>
          <FileBrowserDemo />
        </Example>
      </Section>

      <Section id="features" title="Features">
        <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
          <li><strong>Tree structure:</strong> 3-level hierarchy — root items → folders → files</li>
          <li><strong>Expand/collapse:</strong> Per-folder toggle, conditional rendering inside loops</li>
          <li><strong>Multi-select:</strong> Checkbox on every node, with selected count in toolbar</li>
          <li><strong>Delete selected:</strong> Recursive filter removes selected nodes across all levels</li>
          <li><strong>Add file:</strong> Enter key in folder creates new file with random size</li>
          <li><strong>Derived state:</strong> File count, total size, and selected count via createMemo</li>
        </ul>
      </Section>
    </DocPage>
  )
}
