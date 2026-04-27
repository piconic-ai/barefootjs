"use client"
/**
 * GraphEditorDemo — Phase 9 Block #135 (Graph / DAG Editor, SVG)
 *
 * SVG-based node graph editor: nodes are drawn with `<svg>` + `<circle>` +
 * `<rect>` + `<text>`, edges are `<path>` strings. Supports drag-to-move
 * nodes, drag-from-handle to create a new edge, and an auto-layout toggle
 * that arranges nodes in topological columns.
 *
 * Compiler stress targets (intentionally absent from every other block):
 *
 * - SVG namespace attribute bindings: `cx`, `cy` on `<circle>`, `d` on
 *   `<path>`, `x` / `y` on `<rect>` and `<text>`, `viewBox` on `<svg>`.
 *   Every other block uses HTML elements only — the compiler's SVG path
 *   (createElementNS context, attribute namespace handling) is exercised
 *   here for the first time.
 *
 * - Reactive SVG attribute binding inside `mapArray` loops: `nodes().map(n
 *   => <g><circle cx={n.x()}.../></g>)` and `edges().map(e => <path
 *   d={pathOf(e)}/>)`. Each per-node `<g>` carries a transform / class
 *   binding, each edge `<path>` rebuilds its `d` string when either
 *   endpoint moves. Nested loops (handles per node) are also present.
 *
 * - Reactive `viewBox` updates: zoom/pan controls rewrite the SVG
 *   `viewBox` string, exercising attribute updates on the root SVG.
 *
 * - Path `d` rebuild on signal change: dragging a node updates that
 *   node's position signal, which in turn rebuilds the `d` strings of
 *   every edge connected to it. The edge loop's body has multiple
 *   reactive reads (sourceNode().x(), sourceNode().y(), targetNode().x(),
 *   targetNode().y()) converging into a single attribute.
 *
 * - Pointer event handling on SVG elements: `onPointerDown` on
 *   `<circle>` (handle) and `<g>` (node body), `onPointerMove` /
 *   `onPointerUp` on the root `<svg>` for drag tracking. Tests SVG event
 *   delegation through the same compiler path used for HTML.
 *
 * - Auto-layout swap: toggling layout mode replaces every node's (x, y)
 *   simultaneously. Every reactive `cx`/`cy`/`d` binding must update on
 *   the same microtask without stale frames.
 */

import { createSignal, createMemo } from '@barefootjs/client'

// --- Types ---

type NodeKind = 'input' | 'process' | 'output'

type GraphNode = {
  id: string
  label: string
  kind: NodeKind
  x: number
  y: number
}

type GraphEdge = {
  id: string
  source: string
  target: string
}

type DragState =
  | { mode: 'idle' }
  | { mode: 'node'; nodeId: string; offsetX: number; offsetY: number }
  | { mode: 'connect'; sourceId: string; cursorX: number; cursorY: number }

// --- Layout helpers ---

const NODE_RADIUS = 28
const HANDLE_RADIUS = 5
const VIEWBOX_W = 720
const VIEWBOX_H = 400

const KIND_FILL: Record<NodeKind, string> = {
  input: '#dbeafe',
  process: '#fef3c7',
  output: '#dcfce7',
}

const KIND_STROKE: Record<NodeKind, string> = {
  input: '#3b82f6',
  process: '#f59e0b',
  output: '#22c55e',
}

const INITIAL_NODES: GraphNode[] = [
  { id: 'n1', label: 'Source', kind: 'input', x: 80, y: 100 },
  { id: 'n2', label: 'Filter', kind: 'process', x: 260, y: 60 },
  { id: 'n3', label: 'Map', kind: 'process', x: 260, y: 180 },
  { id: 'n4', label: 'Reduce', kind: 'process', x: 460, y: 120 },
  { id: 'n5', label: 'Sink', kind: 'output', x: 640, y: 120 },
]

const INITIAL_EDGES: GraphEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n1', target: 'n3' },
  { id: 'e3', source: 'n2', target: 'n4' },
  { id: 'e4', source: 'n3', target: 'n4' },
  { id: 'e5', source: 'n4', target: 'n5' },
]

/**
 * Compute a topological column layout. Roots (no incoming edges) are placed
 * in column 0; every other node sits one column right of its deepest
 * dependency. Within a column, nodes are stacked vertically.
 */
function autoLayout(nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  const incoming: Record<string, string[]> = {}
  const outgoing: Record<string, string[]> = {}
  for (const n of nodes) {
    incoming[n.id] = []
    outgoing[n.id] = []
  }
  for (const e of edges) {
    if (outgoing[e.source]) outgoing[e.source].push(e.target)
    if (incoming[e.target]) incoming[e.target].push(e.source)
  }

  const depth: Record<string, number> = {}
  const queue: string[] = []
  for (const n of nodes) {
    if (incoming[n.id].length === 0) {
      depth[n.id] = 0
      queue.push(n.id)
    }
  }
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of outgoing[id]) {
      const candidate = depth[id] + 1
      if (depth[next] === undefined || candidate > depth[next]) {
        depth[next] = candidate
        queue.push(next)
      }
    }
  }

  const columns: Record<number, GraphNode[]> = {}
  for (const n of nodes) {
    const d = depth[n.id] ?? 0
    if (!columns[d]) columns[d] = []
    columns[d].push(n)
  }

  const columnKeys = Object.keys(columns).map(Number).sort((a, b) => a - b)
  const colWidth = VIEWBOX_W / Math.max(columnKeys.length + 1, 2)
  const result: GraphNode[] = []
  for (const k of columnKeys) {
    const col = columns[k]
    const rowHeight = VIEWBOX_H / (col.length + 1)
    for (let i = 0; i < col.length; i++) {
      result.push({
        ...col[i],
        x: Math.round(colWidth * (k + 1)),
        y: Math.round(rowHeight * (i + 1)),
      })
    }
  }
  return result
}

/**
 * Build a smooth cubic bezier path from (sx, sy) to (tx, ty) with
 * horizontal control points. The compiler must rebuild this string on
 * every move because either endpoint may change.
 */
function bezierPath(sx: number, sy: number, tx: number, ty: number): string {
  const dx = Math.max(40, Math.abs(tx - sx) * 0.5)
  const c1x = sx + dx
  const c2x = tx - dx
  return `M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`
}

let edgeIdCounter = INITIAL_EDGES.length

function nextEdgeId(): string {
  edgeIdCounter += 1
  return `e${edgeIdCounter}`
}

export function GraphEditorDemo() {
  const [nodes, setNodes] = createSignal<GraphNode[]>(INITIAL_NODES)
  const [edges, setEdges] = createSignal<GraphEdge[]>(INITIAL_EDGES)
  const [drag, setDrag] = createSignal<DragState>({ mode: 'idle' })
  const [autoLayoutOn, setAutoLayoutOn] = createSignal(false)
  const [zoom, setZoom] = createSignal(1)
  const [selectedEdgeId, setSelectedEdgeId] = createSignal<string | null>(null)

  // Reactive viewBox: zoom centers on the canvas midpoint.
  const viewBox = createMemo(() => {
    const z = zoom()
    const w = VIEWBOX_W / z
    const h = VIEWBOX_H / z
    const cx = VIEWBOX_W / 2
    const cy = VIEWBOX_H / 2
    return `${Math.round(cx - w / 2)} ${Math.round(cy - h / 2)} ${Math.round(w)} ${Math.round(h)}`
  })

  // Lookup map for edge endpoint resolution.
  const nodeIndex = createMemo(() => {
    const map: Record<string, GraphNode> = {}
    for (const n of nodes()) map[n.id] = n
    return map
  })

  // Each edge's path string. Rebuilt whenever any node moves (because
  // nodes() changes identity on setNodes), exercising d-attribute
  // reactivity inside a mapArray loop body.
  function edgePath(e: GraphEdge): string {
    const idx = nodeIndex()
    const s = idx[e.source]
    const t = idx[e.target]
    if (!s || !t) return ''
    return bezierPath(s.x, s.y, t.x, t.y)
  }

  // Preview path while dragging from a handle.
  const connectPreview = createMemo(() => {
    const d = drag()
    if (d.mode !== 'connect') return null
    const idx = nodeIndex()
    const s = idx[d.sourceId]
    if (!s) return null
    return bezierPath(s.x, s.y, d.cursorX, d.cursorY)
  })

  function svgPoint(target: SVGSVGElement, clientX: number, clientY: number) {
    const rect = target.getBoundingClientRect()
    const z = zoom()
    const x = ((clientX - rect.left) / rect.width) * (VIEWBOX_W / z) + (VIEWBOX_W - VIEWBOX_W / z) / 2
    const y = ((clientY - rect.top) / rect.height) * (VIEWBOX_H / z) + (VIEWBOX_H - VIEWBOX_H / z) / 2
    return { x, y }
  }

  function onNodePointerDown(node: GraphNode, ev: PointerEvent) {
    if (autoLayoutOn()) return // auto-layout is authoritative
    ev.stopPropagation()
    const svg = (ev.currentTarget as SVGElement).ownerSVGElement
    if (!svg) return
    const { x, y } = svgPoint(svg, ev.clientX, ev.clientY)
    setDrag({ mode: 'node', nodeId: node.id, offsetX: x - node.x, offsetY: y - node.y })
    ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
  }

  function onHandlePointerDown(node: GraphNode, ev: PointerEvent) {
    ev.stopPropagation()
    const svg = (ev.currentTarget as SVGElement).ownerSVGElement
    if (!svg) return
    setDrag({ mode: 'connect', sourceId: node.id, cursorX: node.x, cursorY: node.y })
    ;(ev.currentTarget as Element).setPointerCapture?.(ev.pointerId)
  }

  function onSvgPointerMove(ev: PointerEvent) {
    const d = drag()
    if (d.mode === 'idle') return
    const svg = ev.currentTarget as SVGSVGElement
    const { x, y } = svgPoint(svg, ev.clientX, ev.clientY)
    if (d.mode === 'node') {
      const id = d.nodeId
      setNodes((prev: GraphNode[]) => prev.map((n: GraphNode) =>
        n.id === id
          ? { ...n, x: Math.round(Math.max(NODE_RADIUS, Math.min(VIEWBOX_W - NODE_RADIUS, x - d.offsetX))), y: Math.round(Math.max(NODE_RADIUS, Math.min(VIEWBOX_H - NODE_RADIUS, y - d.offsetY))) }
          : n,
      ))
    } else if (d.mode === 'connect') {
      setDrag({ mode: 'connect', sourceId: d.sourceId, cursorX: x, cursorY: y })
    }
  }

  function onSvgPointerUp(ev: PointerEvent) {
    const d = drag()
    if (d.mode === 'connect') {
      // Resolve drop target by hit-testing the cursor position. The handle
      // grabbed `setPointerCapture` on pointerdown, so `ev.target` is the
      // source handle for every subsequent event — we need the element
      // actually under the cursor, which is what `elementFromPoint` gives.
      const hit = document.elementFromPoint(ev.clientX, ev.clientY) as Element | null
      const targetGroup = hit?.closest?.('[data-node-id]') as Element | null
      const targetId = targetGroup?.getAttribute('data-node-id') ?? null
      if (targetId && targetId !== d.sourceId) {
        const exists = edges().some((e: GraphEdge) => e.source === d.sourceId && e.target === targetId)
        if (!exists) {
          setEdges((prev: GraphEdge[]) => [...prev, { id: nextEdgeId(), source: d.sourceId, target: targetId }])
        }
      }
    }
    setDrag({ mode: 'idle' })
  }

  function toggleAutoLayout() {
    const next = !autoLayoutOn()
    setAutoLayoutOn(next)
    if (next) {
      setNodes((prev: GraphNode[]) => autoLayout(prev, edges()))
    }
  }

  function deleteSelectedEdge() {
    const id = selectedEdgeId()
    if (!id) return
    setEdges((prev: GraphEdge[]) => prev.filter((e: GraphEdge) => e.id !== id))
    setSelectedEdgeId(null)
  }

  function reset() {
    setNodes(INITIAL_NODES.map(n => ({ ...n })))
    setEdges(INITIAL_EDGES.map(e => ({ ...e })))
    setSelectedEdgeId(null)
    setAutoLayoutOn(false)
    setZoom(1)
  }

  const nodeCount = createMemo(() => nodes().length)
  const edgeCount = createMemo(() => edges().length)

  return (
    <div className="graph-editor-demo w-full space-y-3">
      {/* Toolbar */}
      <div className="graph-toolbar flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="auto-layout-toggle h-3 w-3"
              checked={autoLayoutOn()}
              onChange={toggleAutoLayout}
            />
            Auto layout
          </label>
          <button
            type="button"
            className="zoom-in-btn h-8 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent"
            onClick={() => setZoom((z: number) => Math.min(2, +(z + 0.1).toFixed(2)))}
          >
            Zoom +
          </button>
          <button
            type="button"
            className="zoom-out-btn h-8 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent"
            onClick={() => setZoom((z: number) => Math.max(0.5, +(z - 0.1).toFixed(2)))}
          >
            Zoom −
          </button>
          <span className="zoom-label text-xs text-muted-foreground">
            {Math.round(zoom() * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="node-count text-xs text-muted-foreground">{nodeCount()} nodes</span>
          <span className="edge-count text-xs text-muted-foreground">{edgeCount()} edges</span>
          <button
            type="button"
            className="delete-edge-btn h-8 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent disabled:opacity-50"
            disabled={selectedEdgeId() === null}
            onClick={deleteSelectedEdge}
          >
            Delete edge
          </button>
          <button
            type="button"
            className="reset-btn h-8 px-3 text-xs rounded-md border border-input bg-background hover:bg-accent"
            onClick={reset}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="graph-canvas-wrap rounded-md border border-border bg-card">
        <svg
          className="graph-canvas block w-full"
          data-graph-canvas
          viewBox={viewBox()}
          style="height:400px;touch-action:none;user-select:none"
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
        >
          <defs>
            <marker
              id="graph-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>

          {/* Edges loop — d attribute rebuilds reactively on any node move. */}
          <g className="edges-layer">
            {edges().map((e: GraphEdge) => (
              <path
                key={e.id}
                data-edge-id={e.id}
                className={`graph-edge${selectedEdgeId() === e.id ? ' graph-edge-selected' : ''}`}
                d={edgePath(e)}
                stroke={selectedEdgeId() === e.id ? '#2563eb' : '#94a3b8'}
                strokeWidth={selectedEdgeId() === e.id ? 2.5 : 1.5}
                fill="none"
                markerEnd="url(#graph-arrow)"
                pointerEvents="all"
                style="cursor:pointer"
                onPointerDown={(ev: PointerEvent) => {
                  ev.stopPropagation()
                  setSelectedEdgeId(e.id)
                }}
              />
            ))}
          </g>

          {/* Connect-in-progress preview path. Pointer-transparent so the
              drop hit-test sees through to the target node underneath. */}
          {connectPreview() !== null ? (
            <path
              className="graph-connect-preview"
              data-connect-preview
              d={connectPreview() ?? ''}
              stroke="#2563eb"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              fill="none"
              pointerEvents="none"
            />
          ) : null}

          {/* Nodes loop — every node has reactive cx/cy on its circle and
              x/y on its label, plus a connect handle whose cx/cy track the
              right edge. Nested mapArray-equivalents (handles per node) are
              expressed as multiple SVG children inside one .map() body. */}
          <g className="nodes-layer">
            {nodes().map((n: GraphNode) => (
              <g
                key={n.id}
                data-node-id={n.id}
                className={`graph-node graph-node-${n.kind}`}
                onPointerDown={(ev: PointerEvent) => onNodePointerDown(n, ev)}
                style="cursor:grab"
              >
                <circle
                  className="graph-node-body"
                  cx={n.x}
                  cy={n.y}
                  r={NODE_RADIUS}
                  fill={KIND_FILL[n.kind]}
                  stroke={KIND_STROKE[n.kind]}
                  strokeWidth="2"
                />
                <text
                  className="graph-node-label"
                  x={n.x}
                  y={n.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill="#0f172a"
                  pointerEvents="none"
                >
                  {n.label}
                </text>
                <circle
                  className="graph-node-handle"
                  data-handle
                  data-node-handle-id={n.id}
                  cx={n.x + NODE_RADIUS}
                  cy={n.y}
                  r={HANDLE_RADIUS}
                  fill="#0f172a"
                  stroke="#fff"
                  strokeWidth="1.5"
                  style="cursor:crosshair"
                  onPointerDown={(ev: PointerEvent) => onHandlePointerDown(n, ev)}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  )
}
