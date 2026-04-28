"use client"

// JSX-native Flow container (#1081 step 8).
//
// Translates the rendering portion of `initFlow(scope, props)` into a
// `<Flow>` JSX component. The container tree is now declarative:
//
//   <div class="bf-flow">
//     <div class="bf-flow__viewport" style="transform: translate(...) scale(...)">
//       <svg class="bf-flow__edges">{edges().map(e => <SimpleEdge ... />)}</svg>
//       <div class="bf-flow__nodes">{nodes().map(n => <NodeWrapper ... />)}</div>
//     </div>
//     {props.children}  // Background / Controls / MiniMap slot
//   </div>
//
// All pointer-paced subsystems (XYPanZoom, ResizeObserver, keyboard
// handlers, selection rectangle, pane click detection) stay imperative.
// They attach via the outer-`<div>` `ref` callback in the consolidation
// step that swaps `initFlow` for `<Flow>` in the public API.
//
// **Wiring status:** the imperative `initFlow` in `flow.ts` is still the
// production code path. The JSX `<Flow>` is the canonical form that
// IR-tests today. The runtime cutover (replace `initFlow` callers with
// `<Flow>` and delete the imperative renderer files) is a follow-up
// PR — keeping it separate so reviewers can validate the JSX shape
// before pulling the rug on production.

import {
  createMemo,
  createSignal,
  provideContext,
} from '@barefootjs/client'
import type { JSX } from '@barefootjs/jsx/jsx-runtime'
import type { NodeBase, EdgeBase } from '@xyflow/system'
import { createFlowStore } from '../store'
import { FlowContext } from '../context'
import type { FlowProps } from '../types'
import { SimpleEdge } from './simple-edge'
import { NodeWrapper } from './node-wrapper'

type Child = JSX.Element | string | number | boolean | null | undefined | Child[]

export interface FlowComponentProps<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
> extends FlowProps<NodeType, EdgeType> {
  /** Slot for `<Background>` / `<Controls>` / `<MiniMap>` overlays. */
  children?: Child
}

export function Flow<
  NodeType extends NodeBase = NodeBase,
  EdgeType extends EdgeBase = EdgeBase,
>(props: FlowComponentProps<NodeType, EdgeType>) {
  // Store creation happens once, on first render. The store owns the
  // reactive node/edge state — `provideContext` makes it available to
  // descendant `<NodeWrapper>` / `<SimpleEdge>` / `<Background>` /
  // `<Controls>` / `<MiniMap>` instances.
  const store = createFlowStore<NodeType, EdgeType>(props)
  provideContext(FlowContext, store as never)

  // Pan/zoom transform memo. Re-runs only when viewport changes.
  const viewportTransform = createMemo(() => {
    const vp = store.viewport()
    return `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`
  })

  // Edge list memo. Per-edge `<SimpleEdge>` mounts with a stable key
  // so the analyzer's BF023 invariant is satisfied and the runtime
  // can reconcile DOM via `mapArray` instead of unmount/remount.
  const visibleEdges = createMemo(() =>
    store.edges().filter((e) => !e.hidden),
  )
  const visibleNodes = createMemo(() => store.nodes())

  // Imperative subsystem attach point (panZoom, ResizeObserver,
  // keyboard handlers, selection rectangle, pane click detection).
  // The cutover step in flow.ts will pass a ref callback that wires
  // these in via `attachImperativeSubsystems(el, store, props)`.
  // Keeping it as a no-op signal here makes the JSX shape testable
  // in isolation.
  const [_paneRef] = createSignal<HTMLElement | null>(null)
  function attachPane(el: HTMLElement) {
    // wired in consolidation step
    void el
  }

  return (
    <div
      ref={attachPane}
      className="bf-flow"
      style="position: relative; overflow: hidden; width: 100%; height: 100%;"
    >
      <div
        className="bf-flow__viewport xyflow__viewport"
        style={`position: absolute; top: 0; left: 0; width: 100%; height: 100%; transform-origin: 0 0; transform: ${viewportTransform()};`}
      >
        <svg
          className="bf-flow__edges"
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none;"
        >
          {visibleEdges().map((edge) => (
            <SimpleEdge key={edge.id} edgeId={edge.id} />
          ))}
        </svg>
        <div
          className="bf-flow__nodes"
          style="position: absolute; top: 0; left: 0;"
        >
          {visibleNodes().map((node) => (
            <NodeWrapper key={node.id} nodeId={node.id} />
          ))}
        </div>
      </div>
      {props.children}
    </div>
  )
}
