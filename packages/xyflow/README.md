# @barefootjs/xyflow

Signal-based wrapper around [`@xyflow/system`](https://www.npmjs.com/package/@xyflow/system)
for [BarefootJS](https://barefootjs.dev). Ships the **utility layer**
(store, signal hooks, types, geometry helpers, imperative
pointer-paced subsystems). The **JSX-native renderer components**
(`Flow`, `Background`, `Controls`, `MiniMap`, `Handle`, `NodeWrapper`,
`SimpleEdge`) live in the shadcn-style registry at
[`ui/components/ui/xyflow/`](../../ui/components/ui/xyflow/) and ship
to consumers via:

```sh
bf add xyflow            # via the BarefootJS CLI
npx shadcn@latest add https://ui.barefootjs.dev/r/xyflow.json
```

This split mirrors the chart pattern (`@barefootjs/chart` for utility,
`ui/components/ui/chart/` for JSX components).

## Usage

```tsx
"use client"

import { Flow, Background, Controls, MiniMap } from "@/components/ui/xyflow"
import { useNodesState, useEdgesState } from "@barefootjs/xyflow"

const initialNodes = [
  { id: "1", position: { x: 100, y: 100 }, data: { label: "Input" } },
  { id: "2", position: { x: 350, y: 50 },  data: { label: "Transform" } },
  { id: "3", position: { x: 600, y: 125 }, data: { label: "Output" } },
]
const initialEdges = [
  { id: "e1-2", source: "1", target: "2" },
  { id: "e2-3", source: "2", target: "3" },
]

export function MyCanvas() {
  const [nodes, setNodes] = useNodesState(initialNodes)
  const [edges, setEdges] = useEdgesState(initialEdges)

  return (
    <div className="w-full h-[420px]">
      <Flow nodes={nodes()} edges={edges()}>
        <Background variant="dots" gap={20} />
        <Controls />
        <MiniMap pannable zoomable />
      </Flow>
    </div>
  )
}
```

### Custom node bodies

The default `<Flow>` loop renders `data.label ?? id` inside each
`<NodeWrapper>`. To compose custom node bodies, mount your own
`<NodeWrapper>` instances as Flow children:

```tsx
<Flow nodes={nodes()} edges={edges()}>
  <Background />
  {nodes().map((n) => (
    <NodeWrapper key={n.id} nodeId={n.id}>
      <div className="rounded-md border bg-card px-3 py-2">
        {n.data.label}
        <Handle type="target" position={Position.Left}  nodeId={n.id} />
        <Handle type="source" position={Position.Right} nodeId={n.id} />
      </div>
    </NodeWrapper>
  ))}
</Flow>
```

## What this package exports

| Surface | Item | Purpose |
|---|---|---|
| Store / state | `createFlowStore`, `FlowContext` | Reactive node / edge / viewport state |
| Hooks | `useFlow`, `useViewport`, `useNodes`, `useEdges`, `useNodesInitialized`, `useStore`, `screenToFlowPosition` | Read store from descendants |
| React Flow shim | `useNodesState`, `useEdgesState`, `useReactFlow`, `addEdge`, `reconnectEdge` | Drop-in helpers for migrators |
| Geometry | `computeEdgePosition`, `getEdgePath` | Path math shared with `<SimpleEdge>` |
| Subsystem attach | `attachFlowSubsystems` | `<Flow>`'s `ref` calls this — pan / zoom / keyboard / selection rectangle / pane click |
| Subsystem attach | `attachConnectionHandler`, `attachReconnectionHandler` | `<Handle>` and reconnect overlay refs |
| Imperative-only | `setupKeyboardHandlers`, `setupNodeSelection`, `setupSelectionRectangle`, `initNodeResizer` | Pointer-paced primitives that JSX gives no leverage to |
| Re-exports | `getBezierPath`, `getSmoothStepPath`, `getStraightPath`, `getConnectedEdges`, `getOutgoers`, `getIncomers`, `getNodesBounds`, `getNodesInside`, `getEdgeToolbarTransform`, `Position`, `MarkerType`, `ConnectionMode` | From `@xyflow/system` |
| Types | `FlowProps`, `FlowStore`, `InternalFlowStore`, `NodeBase`, `EdgeBase`, `Viewport`, `NodeLookup`, `EdgeLookup`, `Connection`, `OnConnect`, `OnReconnect`, `IsValidConnection`, `HandleType`, … | (see `src/types.ts`) |

## Source layout

```
src/
├── index.ts            re-exports the utility surface above
├── store.ts            createFlowStore + signal wiring
├── hooks.ts            useFlow / useViewport / useNodes / ...
├── context.ts          FlowContext
├── types.ts            FlowProps / FlowStore / InternalFlowStore / ...
├── constants.ts        SVG_NS / INFINITE_EXTENT / ...
├── utils.ts            misc helpers
├── edge-path.ts        computeEdgePosition / getEdgePath
├── flow-subsystems.ts  attachFlowSubsystems (panZoom + ResizeObserver + ...)
├── connection.ts       attachConnectionHandler / attachReconnectionHandler
├── selection.ts        setupKeyboardHandlers / setupSelectionRectangle / setupNodeSelection
├── node-resizer.ts     initNodeResizer (pointer-paced resize handles)
├── compat.ts           React Flow API shims
└── __tests__/          store / compat / jsx-smoke unit tests
```

JSX-native components are deliberately **not** in this package — they
live in `ui/components/ui/xyflow/index.tsx` so consumers `add` the
source directly into their app, can edit it, and own their own copy
(shadcn pattern). This avoids the JSX-runtime resolution headaches
that come from publishing `.tsx` directly from a workspace package.

## Browser bundle (importmap)

`bun run build` also emits `dist/xyflow.browser.min.js`: a minified ESM build
with `@barefootjs/client`, `@barefootjs/client/runtime` and
`@barefootjs/client/reactive` left as externals (`build:browser` in
`package.json`). Serve it as an independently cached static asset instead of
re-bundling xyflow into every client entry. Re-bundling by hand needs all three
externals — missing one silently inlines a second copy of the reactive
primitives, and signals stop propagating across the boundary (`fitView`
becomes a no-op, `FlowContext` reads from the wrong owner).

The file is also the `umd` export condition and the `unpkg` / `jsdelivr`
top-level fields, so `https://unpkg.com/@barefootjs/xyflow` serves it.

Copy it next to your client build and map it in an importmap:

```sh
cp node_modules/@barefootjs/xyflow/dist/xyflow.browser.min.js public/static/components/xyflow.js
cp node_modules/@barefootjs/xyflow/dist/xyflow.browser.min.js.map public/static/components/xyflow.js.map  # optional
```

```html
<script type="importmap">
{
  "imports": {
    "@barefootjs/client":          "/static/components/barefoot.js",
    "@barefootjs/client/runtime":  "/static/components/barefoot.js",
    "@barefootjs/client/reactive": "/static/components/barefoot.js",
    "@barefootjs/xyflow":          "/static/components/xyflow.js"
  }
}
</script>
```

All three `@barefootjs/client*` entries point at one file so the browser keeps
a single module instance and the reactive primitives share one
`Listener` / `Owner`.

- **Escape `<` inside the importmap JSON.** A mapped URL containing
  `</script>` would close the `<script type="importmap">` element early.
  When serializing the map dynamically, replace every `<` with `\u003c`
  before writing it into the tag — JSON decodes it back to `<`.
- **Add `crossorigin` to a cross-origin `modulepreload`**, e.g. when pointing
  at the unpkg URL instead of a copied file:

  ```html
  <link rel="modulepreload" href="https://unpkg.com/@barefootjs/xyflow" crossorigin>
  ```

  A module `import` is always a CORS fetch; without `crossorigin` the preload
  does not match it and the browser fetches the module twice. It is harmless
  on a same-origin preload.

## Related

- [`@xyflow/system`](https://www.npmjs.com/package/@xyflow/system) — upstream pan/zoom + edge-path math library this package wraps.
