/**
 * Node-type dispatch — the helper that funnels `<Flow nodeTypes={...}>`
 * entries into the host `<div>` produced by `FlowNodeTypeBridge`.
 *
 * `nodeTypes` accepts two entry shapes through the same map so projects
 * can migrate custom nodes from imperative to JSX one file at a time
 * without touching every `<Flow>` call site:
 *
 *   1. Imperative: `function MyNode(this: HTMLElement, props): void`
 *      — mutates `this` (the host element) and returns nothing.
 *   2. JSX-component shim: post-`'use client'` `.tsx` compile output
 *      — ignores `this` and returns a real DOM `Node`. The bridge
 *      appends that returned node into the host so subsequent
 *      wipe+rebuild cycles see it.
 *
 * See piconic-ai/barefootjs#1236 for the migration motivation.
 */

import type { NodeBase } from './types.ts'
import type { NodeComponentProps } from './types.ts'

/**
 * Cross-shape `nodeTypes` entry. The return type covers both supported
 * shapes — imperative entries return `void`, JSX-component shim
 * entries return a `Node`.
 */
export type NodeInitFn<NodeType extends NodeBase = NodeBase> = (
  this: HTMLElement,
  props: NodeComponentProps<NodeType>,
) => void | Node | undefined

/**
 * Dispatch a `nodeTypes` entry into the host element. Invokes `initFn`
 * with `el` bound as `this` (imperative path) and appends its return
 * value when it is a `Node` (JSX-component shim path). The
 * `instanceof Node` guard is harmless on the imperative path: `void`
 * is not an instance of `Node`, so the branch is skipped.
 */
export function dispatchNodeType<NT extends NodeBase>(
  el: HTMLElement,
  initFn: NodeInitFn<NT>,
  props: NodeComponentProps<NT>,
): void {
  const result = initFn.call(el, props)
  if (result instanceof Node) el.appendChild(result)
}
