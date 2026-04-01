"use client"
/**
 * FileBrowserDemo Component
 *
 * File browser with tree structure, expand/collapse, and selection.
 * Exercises: nested loops with conditionals (folder expand/collapse),
 * recursive data structure rendering, selection state propagation,
 * dynamic list updates (create/delete), derived state (selected count, total size).
 */

import { createSignal, createMemo } from '@barefootjs/dom'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Input } from '@ui/components/ui/input'
import { Separator } from '@ui/components/ui/separator'

type FileItem = {
  id: number
  name: string
  type: 'file'
  size: number  // bytes
  selected: boolean
}

type FolderItem = {
  id: number
  name: string
  type: 'folder'
  expanded: boolean
  selected: boolean
  children: TreeNode[]
}

type TreeNode = FileItem | FolderItem

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countFiles(nodes: TreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'file') count++
    else count += countFiles(node.children)
  }
  return count
}

function totalSize(nodes: TreeNode[]): number {
  let size = 0
  for (const node of nodes) {
    if (node.type === 'file') size += node.size
    else size += totalSize(node.children)
  }
  return size
}

function countSelected(nodes: TreeNode[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.selected) count++
    if (node.type === 'folder') count += countSelected(node.children)
  }
  return count
}

const initialTree: TreeNode[] = [
  {
    id: 1, name: 'src', type: 'folder', expanded: true, selected: false,
    children: [
      {
        id: 2, name: 'components', type: 'folder', expanded: true, selected: false,
        children: [
          { id: 3, name: 'Button.tsx', type: 'file', size: 2048, selected: false },
          { id: 4, name: 'Input.tsx', type: 'file', size: 1536, selected: false },
          { id: 5, name: 'Dialog.tsx', type: 'file', size: 3200, selected: false },
        ],
      },
      {
        id: 6, name: 'utils', type: 'folder', expanded: false, selected: false,
        children: [
          { id: 7, name: 'format.ts', type: 'file', size: 512, selected: false },
          { id: 8, name: 'cn.ts', type: 'file', size: 256, selected: false },
        ],
      },
      { id: 9, name: 'index.ts', type: 'file', size: 128, selected: false },
    ],
  },
  {
    id: 10, name: 'public', type: 'folder', expanded: false, selected: false,
    children: [
      { id: 11, name: 'favicon.ico', type: 'file', size: 4096, selected: false },
      { id: 12, name: 'robots.txt', type: 'file', size: 64, selected: false },
    ],
  },
  { id: 13, name: 'package.json', type: 'file', size: 1024, selected: false },
  { id: 14, name: 'tsconfig.json', type: 'file', size: 384, selected: false },
  { id: 15, name: 'README.md', type: 'file', size: 2560, selected: false },
]

let nextId = 100

export function FileBrowserDemo() {
  const [tree, setTree] = createSignal<TreeNode[]>(initialTree)

  const fileCount = createMemo(() => countFiles(tree()))
  const totalBytes = createMemo(() => totalSize(tree()))
  const selectedCount = createMemo(() => countSelected(tree()))

  // Recursive tree updater
  const updateNode = (nodes: TreeNode[], id: number, updater: (node: TreeNode) => TreeNode): TreeNode[] => {
    return nodes.map(node => {
      if (node.id === id) return updater(node)
      if (node.type === 'folder') {
        return { ...node, children: updateNode(node.children, id, updater) }
      }
      return node
    })
  }

  const toggleExpand = (id: number) => {
    setTree(prev => updateNode(prev, id, node =>
      node.type === 'folder' ? { ...node, expanded: !node.expanded } : node
    ))
  }

  const toggleSelect = (id: number) => {
    setTree(prev => updateNode(prev, id, node => ({ ...node, selected: !node.selected })))
  }

  const deleteSelected = () => {
    const removeSelected = (nodes: TreeNode[]): TreeNode[] =>
      nodes
        .filter(n => !n.selected)
        .map(n => n.type === 'folder' ? { ...n, children: removeSelected(n.children) } : n)
    setTree(removeSelected)
  }

  const addFile = (folderId: number, name: string) => {
    if (!name.trim()) return
    const newFile: FileItem = {
      id: nextId++,
      name: name.trim(),
      type: 'file',
      size: Math.floor(Math.random() * 4096) + 128,
      selected: false,
    }
    setTree(prev => updateNode(prev, folderId, node =>
      node.type === 'folder' ? { ...node, children: [...node.children, newFile], expanded: true } : node
    ))
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{fileCount()}</span> files
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{formatSize(totalBytes())}</span>
        </div>
        <Separator orientation="vertical" decorative className="h-4" />
        <div className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{selectedCount()}</span> selected
        </div>
        <div className="flex-1" />
        <Button variant="destructive" size="sm" disabled={selectedCount() === 0} onClick={() => deleteSelected()}>
          Delete selected
        </Button>
      </div>

      {/* Tree */}
      <div className="rounded-lg border">
        <div className="p-2">
          {tree().map(node => (
            <div key={node.id}>
              {node.type === 'folder' ? (
                <div>
                  {/* Folder row */}
                  <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                    <Checkbox checked={node.selected} onCheckedChange={() => toggleSelect(node.id)} />
                    <button
                      className="flex items-center gap-1 text-sm font-medium flex-1 text-left"
                      onClick={() => toggleExpand(node.id)}
                    >
                      <span className="w-4 text-center text-muted-foreground">{node.expanded ? '▼' : '▶'}</span>
                      <span>📁</span>
                      <span>{node.name}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">{node.children.length}</Badge>
                    </button>
                  </div>
                  {/* Folder children — nested loop inside conditional */}
                  {node.expanded ? (
                    <div className="ml-6 border-l pl-2">
                      {node.children.map(child => (
                        <div key={child.id}>
                          {child.type === 'folder' ? (
                            <div>
                              <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                                <Checkbox checked={child.selected} onCheckedChange={() => toggleSelect(child.id)} />
                                <button
                                  className="flex items-center gap-1 text-sm font-medium flex-1 text-left"
                                  onClick={() => toggleExpand(child.id)}
                                >
                                  <span className="w-4 text-center text-muted-foreground">{child.expanded ? '▼' : '▶'}</span>
                                  <span>📁</span>
                                  <span>{child.name}</span>
                                  <Badge variant="secondary" className="ml-auto text-xs">{child.children.length}</Badge>
                                </button>
                              </div>
                              {/* Third level — deepest nesting */}
                              {child.expanded ? (
                                <div className="ml-6 border-l pl-2">
                                  {child.children.map(grandchild => (
                                    <div key={grandchild.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                                      <Checkbox checked={grandchild.selected} onCheckedChange={() => toggleSelect(grandchild.id)} />
                                      <span className="w-4" />
                                      <span className="text-sm">📄</span>
                                      <span className="text-sm flex-1">{grandchild.name}</span>
                                      <span className="text-xs text-muted-foreground">{grandchild.type === 'file' ? formatSize(grandchild.size) : ''}</span>
                                    </div>
                                  ))}
                                  {/* Add file input */}
                                  <div className="flex items-center gap-2 px-2 py-1">
                                    <span className="w-4" />
                                    <Input
                                      placeholder="New file..."
                                      className="flex-1 h-6 text-xs"
                                      onKeyDown={(e: KeyboardEvent) => {
                                        if (e.key === 'Enter') {
                                          const input = e.target as HTMLInputElement
                                          addFile(child.id, input.value)
                                          input.value = ''
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                              <Checkbox checked={child.selected} onCheckedChange={() => toggleSelect(child.id)} />
                              <span className="w-4" />
                              <span className="text-sm">📄</span>
                              <span className="text-sm flex-1">{child.name}</span>
                              <span className="text-xs text-muted-foreground">{child.type === 'file' ? formatSize(child.size) : ''}</span>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Add file to this folder */}
                      <div className="flex items-center gap-2 px-2 py-1">
                        <span className="w-4" />
                        <Input
                          placeholder="New file..."
                          className="flex-1 h-6 text-xs"
                          onKeyDown={(e: KeyboardEvent) => {
                            if (e.key === 'Enter') {
                              const input = e.target as HTMLInputElement
                              addFile(node.id, input.value)
                              input.value = ''
                            }
                          }}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted/50">
                  <Checkbox checked={node.selected} onCheckedChange={() => toggleSelect(node.id)} />
                  <span className="w-4" />
                  <span className="text-sm">📄</span>
                  <span className="text-sm flex-1">{node.name}</span>
                  <span className="text-xs text-muted-foreground">{node.type === 'file' ? formatSize(node.size) : ''}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
